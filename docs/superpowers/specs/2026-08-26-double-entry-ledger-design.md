# 複式簿記台帳（journal_entries）への移行と実データ接続

## 背景・目的

現状のアプリは以下の2つの問題を同時に抱えている。

1. **永続化がない**: `app/supabase/schema.sql` はスキャフォールドのみで実プロジェクトへ未適用。全70ページ以上が `SAMPLE_DATA`/`SAMPLE_ENTRIES` のハードコードで、ユーザーごとのデータが1件も保存されない。
2. **貸借対照表が近似でしかない**: `lib/tax/balanceSheetForm.ts` の冒頭コメントに明記されている通り、このアプリは銀行明細（フロー情報）しか持たず、「期首は現金のみ・負債ゼロ」という単純化で無理やり貸借対照表を一致させている。固定資産・売掛金・借入金は一切反映されない。`lib/tax/depreciation.ts`（減価償却計算）は存在するが `balanceSheetForm.ts` からは一切参照されておらず、孤立している。借入金を扱う専用モジュールはどこにも存在しない。

オーナー（修吾）が代表を務める「ごえん合同会社」（12月決算、固定資産・借入金あり）の実際の法人税・消費税・地方税申告に、2027年2月末の期限までに実際に使う必要がある。デモ用の近似値では申告書として使えないため、これを機に単一仕訳モデルから複式簿記（`journal_entries`）へ移行し、実際の資産・負債残高を正確に追跡できるようにする。

**リスク低減策（オーナー確認済み）**: 数字の最終チェックはオーナーの知人の税理士が行う。万一開発が間に合わない、または数字に疑義がある場合は、その税理士に直接申告してもらうフォールバックがある。ただしこれは「品質を落としてよい」という意味ではなく、開発側は引き続き正確性を最優先する。

## スコープ

**含む**:
- `accounts`（勘定科目マスタ）・`journal_entries`（複式簿記仕訳）を中心とした新データモデルの設計と、既存 `app/supabase/schema.sql` への反映
- 単一仕訳（`CategorizedTransaction`）を消費する既存57本の `lib/tax/` モジュールを**無改修**のまま使い続けるための射影関数 `deriveCategorizedTransactions()`
- 貸借対照表・株主資本等変動計算書・別表五（一）の3モジュールを、近似ではなく実際の `journal_entries` 残高から計算するよう再設計
- 固定資産（既存 `depreciation.ts` を接続）・借入金（新規）の台帳と、そこから毎期の仕訳を自動生成する仕組み
- 期首残高（前期末貸借対照表）の投入と、2026年1〜8月分の銀行/カードCSV一括取込
- 実装順序（4段階、コア計算層は直列・並列specなし）

**含まない**（別トラック・別スペック）:
- e-Tax/eLTax送信用ファイル形式（`.xtx`/CSV）の生成ロジック — 国税庁からの仕様書取得待ちのため対象外。draft生成後のファイル出力形式は現状のスタブのまま
- フェイクドアLPによるPMF検証（別トラック、本スペックとは独立に進行）
- ステージ①〜④完了後の、残り70ページ全部のSupabase接続（これはコア確定後、通常の並列spec運用に戻して進める）
- 複数事業者（マルチテナントSaaSとしての一般提供）を想定した性能・スケーリング対応。今回はごえん合同会社1社が実際に使えることを最優先の基準とする

## データモデル設計

### 方針: 既存 `schema.sql` を編集して置き換える（マイグレーションではない）

`schema.sql` は「実際のSupabaseプロジェクトへは未適用」と明記されている通り、まだ本番データが存在しない。そのため `ALTER TABLE` による段階的マイグレーションではなく、`schema.sql` 自体を直接書き換える。

### `tenants`（拡張）

既存のカラムに加え、法人税・地方税計算に必要なメタデータを追加する（内容は `app/CLAUDE.md` の `company_profiles` 案から流用、テーブル名は既存の `tenants` を維持）。

```sql
alter table tenants
  add column if not exists company_type text check (company_type in ('godo', 'kabushiki')),
  add column if not exists prefecture_city_key text, -- taxRateMaster.ts のキー
  add column if not exists fiscal_year_end_month int check (fiscal_year_end_month between 1 and 12),
  add column if not exists capital_amount bigint not null default 0,
  add column if not exists incorporation_date date,
  add column if not exists tax_payment_method text not null default 'inclusive' check (tax_payment_method in ('inclusive', 'exclusive')),
  add column if not exists etax_taxpayer_id text,
  add column if not exists eltax_user_id text;
```

### `accounts`（勘定科目マスタ、拡張）

既存の `category ('income' | 'expense')` を、貸借対照表側も表現できるよう `account_type` に置き換える。

```sql
-- 既存の category 列を廃止し account_type に統合する
alter table accounts drop column if exists category;
alter table accounts
  add column if not exists account_type text not null default 'expense'
    check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  add column if not exists tax_category text; -- この勘定科目のデフォルト税区分（自動仕訳の初期値）
```

### `journal_entries`（新設、`transactions` を置き換える）

1行 = 借方勘定・貸方勘定・金額の組。**この形式では1行ごとに借方＝貸方＝amountが自明に成立するため、貸借バランスの検算ロジックが不要になる**（これが単純な複式簿記モデルを選んだ最大の理由）。

```sql
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
```

`schema.sql` から旧 `transactions` テーブル定義は削除する。

### `fixed_assets`（新設）

既存 `lib/tax/depreciation.ts` の `Asset` インターフェースをDB化したもの。フィールドは1:1で対応させる。

```sql
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
```

### `loans`（新設）

借入金元本・利率・返済条件を保持する。既存コードに対応する仕組みはないため新規設計する。

```sql
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
```

新規モジュール `lib/tax/loanAmortization.ts` を作成し、`depreciation.ts` と同様のスタイルで「借入金1件＋対象期間」から元本・利息の月次内訳を計算する（元利均等・元金均等の2方式に対応）。

### `company_opening_balances`（新設、期首残高）

前期末（＝当期首）時点の残高を1回だけ記録する。`journal_entries` はこの日付以降の**変動**のみを積み上げるので、期首残高そのものを表す仕訳ではなく、別テーブルとして保持する。

```sql
create table if not exists company_opening_balances (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  as_of_date date not null, -- 通常は fiscal_year_end_month の前期末日
  cash_balance bigint not null default 0,
  retained_earnings bigint not null default 0, -- 期首繰越利益積立金額（別表五（一）の前期繰越額と一致させる）
  -- 固定資産・借入金の期首残高は fixed_assets / loans に
  -- 「取得日が期首より前」「期首時点の残存簿価」を持たせる形で表現し、このテーブルには持たない
  created_at timestamptz not null default now()
);
```

## 既存コードとの接続: `deriveCategorizedTransactions()`

新規ファイル `lib/categorize/deriveFromLedger.ts` に、`journal_entries` を既存の `CategorizedTransaction[]` 形式へ射影する関数を1つ実装する。

```typescript
function deriveCategorizedTransactions(
  entries: JournalEntryRow[],
  accounts: AccountRow[]
): CategorizedTransaction[]
```

**変換ルール**:
- 貸方勘定が `account_type === 'revenue'` の行 → 収益取引として1件（金額はプラス、`account` = 貸方勘定名）
- 借方勘定が `account_type === 'expense'` の行 → 費用取引として1件（`account` = 借方勘定名）
- 両建てが `asset`/`liability`/`equity` の行（固定資産購入、借入金返済の元本部分など）→ **P/Lに影響しないため射影対象外**（貸借対照表側でのみ扱う）
- `tax_category`・`confidence`・`source`・`personal_deduction_only`・`exclude_from_income` はそのまま転記する

既存57本の `lib/tax/` モジュール（`plStatement.ts`・`corporateForms.ts`・`consumptionTaxForm.ts` 等）は、この関数の出力を今まで通り `CategorizedTransaction[]` として受け取るだけなので**無改修**とする。

**書き換え対象は以下の3本のみ**:
- `lib/tax/balanceSheetForm.ts` — `company_opening_balances` + `journal_entries`（全期間）+ `fixed_assets` + `loans` から実際の資産・負債残高を積み上げて計算するよう再設計。「期首は現金のみ」という前提コメントを削除する
- `lib/tax/equityChangeForm.ts` — 同様に実残高ベースに変更
- `lib/tax/form5_1RetainedEarnings.ts` — 期首繰越額を `company_opening_balances.retained_earnings` から取得するよう変更（現状はどこから取得しているか要確認の上、実装時に整合させる）

## 現金を伴わない仕訳の自動生成

CSV取込では発生しない仕訳（減価償却、借入金返済）は、既存の計算ロジックから `journal_entries` へ書き込むバッチ処理として実装する。

- **減価償却**: `fixed_assets` の各行 × 対象事業年度に対して既存 `depreciation.ts` の `calculateAssetDepreciation()` を呼び、結果を `journal_entries`（借方: `depreciation_expense_account_id`、貸方: `asset_account_id`、`source: 'generated'`）として1件書き込む
- **借入金返済**: `loans` の各行 × 対象月に対して新規 `loanAmortization.ts` を呼び、利息部分（借方: `interest_expense_account_id`、貸方: 現金/預金勘定）と元本部分（借方: `liability_account_id`、貸方: 現金/預金勘定）をそれぞれ `journal_entries` に書き込む

どちらも「同じ期間に対して二重生成しない」ことをテストで保証する（生成済みかどうかは `journal_entries` に該当 `source: 'generated'` 行が存在するかで判定する）。

## CSV取込との接続

既存の `app/api/categorize/route.ts` は変更しない。CSV取込画面に「この明細がどの現金・預金勘定と対応するか」を選ぶ入力を1つ追加し、ルールベース/AI分類の結果（借方または貸方の相手勘定・税区分）と組み合わせて `journal_entries` の1行を組み立てる変換層を新規に挟む。

## 期首残高・過去データ移行

1. オーナーが前期末（2025年12月31日）時点の貸借対照表（現金残高・固定資産簿価・借入金残高・利益積立金額）を用意し、`company_opening_balances` と `fixed_assets`/`loans` の初期行として投入する（投入用の簡易フォーム、または直接INSERTのどちらでも可。UIの形は実装時に判断する）
2. 2026年1〜8月分の銀行/カードCSVを、月をまたいでまとめて一括アップロードできるようにする（既存のCSVアップロードUIを複数ファイル対応に拡張する）

## 実装順序（4段階、コア計算層は直列で進める）

`docs/service-financial-spec-driven-routine`（クラウドルーティン）は複数specを並列worktreeで処理する仕組みだが、本スペックの①〜③は互いに強く依存するため、**次のspecは前のspecがマージされてから初めてキューに投入する**（同時に2本以上を投入しない）。④完了後、残り70ページの接続は依存関係が薄いため通常の並列運用に戻してよい。

| 段階 | 内容 | 依存 |
|---|---|---|
| ① スキーマ・型・射影関数 | `schema.sql` 更新、`accounts`/`journal_entries`/`fixed_assets`/`loans`/`company_opening_balances` をSupabaseに適用、`deriveCategorizedTransactions()` 実装 | なし |
| ② P/L・法人税本体の実データ化 | 既存57本のモジュールは無改修。ページ側を①の実データ・射影関数に接続 | ① |
| ③ 貸借対照表・株主資本等変動計算書・別表五（一）＋固定資産/借入金の自動仕訳生成 | `balanceSheetForm.ts`・`equityChangeForm.ts`・`form5_1RetainedEarnings.ts` の再設計、`loanAmortization.ts` 新設、生成バッチの実装 | ①② |
| ④ 期首残高投入・過去CSV一括取込UI・残りの別表群の実データ接続 | ①〜③の上に、実運用に必要な最後のピースを乗せる | ①②③ |

## テスト方針

- `deriveCategorizedTransactions()` は、現行の `SAMPLE_DATA` を journal_entries 形式に変換したフィクスチャに対して実行し、**既存の `CategorizedTransaction` ベースのテストが期待する値と一致すること**をゴールデンテストとして保証する
- 減価償却・借入金返済の自動生成バッチは、同一期間に対する二重生成が起きないことをテストする
- `balanceSheetForm.ts`・`equityChangeForm.ts`・`form5_1RetainedEarnings.ts` は、固定資産・借入金を含む具体的な期首残高＋1年分の仕訳サンプルに対して、資産合計＝負債＋純資産合計が一致することをテストする
- 既存の税額計算60本のテストスイートは、①②の変更後も全てグリーンのまま維持する（回帰なし）

## 未解決・実装時に判断してよい事項

- 期首残高投入用のUIの具体的な形（フォームか、直接データ投入か）
- `form5_1RetainedEarnings.ts` が現状どこから期首繰越額を取得しているかの詳細確認と、`company_opening_balances` への差し替え方法
