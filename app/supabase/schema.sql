-- ------------------------------------------------------------------
-- Supabase スキーマ（スキャフォールドのみ・未接続）
--
-- docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md の
-- データモデル設計に沿った複式簿記台帳（journal_entries）ベースのテーブル定義。
-- 実際のSupabaseプロジェクトへは未適用。
-- ------------------------------------------------------------------

-- テナント（1テナント = 1事業者。個人事業主 or マイクロ法人）
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('individual', 'corp')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- テナント拡張（法人税・地方税計算に必要なメタデータ）。
-- 内容は app/CLAUDE.md の company_profiles 案から流用しつつ、テーブル名は既存の tenants を維持する。
alter table tenants
  add column if not exists company_type text check (company_type in ('godo', 'kabushiki')),
  add column if not exists prefecture_city_key text, -- taxRateMaster.ts のキー
  add column if not exists fiscal_year_end_month int check (fiscal_year_end_month between 1 and 12),
  add column if not exists capital_amount bigint not null default 0,
  add column if not exists incorporation_date date,
  add column if not exists tax_payment_method text not null default 'inclusive' check (tax_payment_method in ('inclusive', 'exclusive')),
  add column if not exists etax_taxpayer_id text,
  add column if not exists eltax_user_id text,
  add column if not exists blue_return boolean not null default false; -- 青色申告の承認有無。lib/db/tenants.ts の TenantProfile が前提とする列

-- ユーザー（Supabase Authのauth.usersを拡張する形。1テナントに複数ユーザーは将来拡張用）
create table if not exists tenant_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

-- 勘定科目マスタ（lib/categorize/dictionary.ts のルールベース分類結果を将来的にDB化する場合の受け皿）
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text,
  name text not null,
  category text not null check (category in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- 既存のcategory列を廃止しaccount_typeに統合する（貸借対照表側も表現できるようにするため）。
alter table accounts drop column if exists category;
alter table accounts
  add column if not exists account_type text not null default 'expense'
    check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  add column if not exists tax_category text; -- この勘定科目のデフォルト税区分（自動仕訳の初期値）

-- 複式簿記仕訳（journal_entries）。1行 = 借方勘定・貸方勘定・金額の組。
-- この形式では1行ごとに借方＝貸方＝amountが自明に成立するため、貸借バランスの検算ロジックが不要になる
-- （これが単純な複式簿記モデルを選んだ最大の理由）。旧 transactions テーブルを置き換える。
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  entry_group_id uuid not null default gen_random_uuid(), -- 1つの経済取引が複数勘定に分かれる場合のグルーピング用（例: 1回の支払いを消耗品費と交際費に案分）
  date date not null,
  debit_account_id uuid not null references accounts (id),
  credit_account_id uuid not null references accounts (id),
  amount bigint not null check (amount > 0),
  description text,
  tax_category text not null,
  confidence numeric(3, 2) not null default 1.0,
  source text not null check (source in ('rule', 'ai', 'uncategorized', 'manual', 'generated')), -- 'generated' = 減価償却・借入金返済など自動生成された仕訳
  personal_deduction_only boolean not null default false,
  exclude_from_income boolean not null default false,
  created_at timestamptz not null default now()
);

-- 固定資産台帳。既存 lib/tax/depreciation.ts の Asset インターフェースをDB化したもの。フィールドは1:1で対応させる。
create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  acquisition_date date not null,
  acquisition_cost bigint not null,
  useful_life_years int not null,
  immediate_expensing boolean not null default false,
  method text not null default 'straight-line' check (method in ('straight-line', 'declining-balance')),
  asset_account_id uuid not null references accounts (id), -- 資産側の勘定科目（例: 工具器具備品）
  depreciation_expense_account_id uuid not null references accounts (id), -- 減価償却費の勘定科目
  disposed_at date, -- 除却・売却日。未除却なら null
  created_at timestamptz not null default now()
);

-- 借入金台帳。元本・利率・返済条件を保持する。既存コードに対応する仕組みはないため新規設計する。
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null, -- 例: 「日本政策金融公庫 運転資金」
  principal_amount bigint not null,
  interest_rate numeric(6, 4) not null, -- 年利率（例: 0.0175 = 1.75%）
  start_date date not null,
  term_months int not null,
  repayment_type text not null default 'equal-principal' check (repayment_type in ('equal-principal', 'equal-payment')),
  liability_account_id uuid not null references accounts (id), -- 負債側の勘定科目（例: 長期借入金）
  interest_expense_account_id uuid not null references accounts (id), -- 支払利息の勘定科目
  created_at timestamptz not null default now()
);

-- 期首残高（前期末＝当期首時点の残高を1回だけ記録する）。
-- journal_entries はこの日付以降の変動のみを積み上げるので、期首残高そのものを表す仕訳ではなく、
-- 別テーブルとして保持する。
create table if not exists company_opening_balances (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  as_of_date date not null, -- 通常は fiscal_year_end_month の前期末日
  cash_balance bigint not null default 0,
  retained_earnings bigint not null default 0, -- 期首繰越利益積立金額（別表五（一）の前期繰越額と一致させる）
  -- 固定資産・借入金の期首残高は fixed_assets / loans に
  -- 「取得日が期首より前」「期首時点の残存簿価」を持たせる形で表現し、このテーブルには持たない
  created_at timestamptz not null default now()
);

-- 証憑（レシート・請求書等のOCR取込先。Phase 1後半以降のスキャナ保存要件対応時に本格利用）
-- transaction_id は旧 transactions テーブルの置き換えである journal_entries を指すよう更新する。
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  transaction_id uuid references journal_entries (id) on delete set null,
  storage_path text not null, -- Cloudflare R2 or Supabase Storage のパス
  uploaded_at timestamptz not null default now()
);

-- 監査ログ（仕訳・申告書データへの全CRUD操作を追記専用で記録。改ざん防止のためUPDATE/DELETEは許可しない運用を想定）
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid references auth.users (id),
  action text not null, -- 例: 'transaction.confirm', 'transaction.edit'
  entity_type text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Row Level Security: テナントごとにデータアクセスを強制分離する。
-- 実運用開始前に、実際のSupabaseプロジェクトでポリシーの動作確認が必要。
-- ------------------------------------------------------------------

alter table tenants enable row level security;
alter table tenant_users enable row level security;
alter table accounts enable row level security;
alter table journal_entries enable row level security;
alter table fixed_assets enable row level security;
alter table loans enable row level security;
alter table company_opening_balances enable row level security;
alter table documents enable row level security;
alter table audit_logs enable row level security;

create policy "tenant members can read their tenant" on tenants
  for select using (id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can read their own membership" on tenant_users
  for select using (user_id = auth.uid());

create policy "tenant members can access their accounts" on accounts
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their journal entries" on journal_entries
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their fixed assets" on fixed_assets
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their loans" on loans
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their opening balances" on company_opening_balances
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their documents" on documents
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can read their audit logs" on audit_logs
  for select using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
-- audit_logs へのINSERTはサーバー側（service role）からのみ許可し、クライアントからの直接INSERTは意図的に許可しない。
