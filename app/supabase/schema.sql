-- ------------------------------------------------------------------
-- Supabase スキーマ（スキャフォールドのみ・未接続）
--
-- docs/cto-tech-architecture.md 2章のデータモデル方針
-- （journal_entries, accounts, transactions, documents, users/tenants, audit_logs）
-- に沿った初期テーブル定義。実際のSupabaseプロジェクトへは未適用。
-- Phase 1後半〜Phase 2でDB導入する際、このファイルをベースにマイグレーションを起こす想定。
-- ------------------------------------------------------------------

-- テナント（1テナント = 1事業者。個人事業主 or マイクロ法人）
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('individual', 'corp')),
  display_name text not null,
  created_at timestamptz not null default now()
);

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

-- 取引明細（CSV取込結果。app/src/lib/categorize/engine.ts の CategorizedTransaction に対応）
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  date date not null,
  description text not null,
  amount bigint not null, -- 円単位、収入は正・支出は負（既存ロジックと揃える）
  account_id uuid references accounts (id),
  tax_category text not null,
  confidence numeric(3, 2) not null default 0,
  source text not null check (source in ('rule', 'ai', 'uncategorized')),
  note text,
  personal_deduction_only boolean not null default false,
  created_at timestamptz not null default now()
);

-- 証憑（レシート・請求書等のOCR取込先。Phase 1後半以降のスキャナ保存要件対応時に本格利用）
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
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
alter table transactions enable row level security;
alter table documents enable row level security;
alter table audit_logs enable row level security;

create policy "tenant members can read their tenant" on tenants
  for select using (id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can read their own membership" on tenant_users
  for select using (user_id = auth.uid());

create policy "tenant members can access their accounts" on accounts
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their transactions" on transactions
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can access their documents" on documents
  for all using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "tenant members can read their audit logs" on audit_logs
  for select using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
-- audit_logs へのINSERTはサーバー側（service role）からのみ許可し、クライアントからの直接INSERTは意図的に許可しない。
