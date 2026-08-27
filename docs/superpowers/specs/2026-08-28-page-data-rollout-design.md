# 実データ接続ロールアウト — 残りページのSAMPLE_DATA解消

## 背景・目的

[[design_refresh_followup]]系の作業（レスポンシブ対応・複式簿記台帳移行ステージ①〜④）が完了し、`docs/superpowers/specs/`に未実装specが無くなった。ユーザーから「まだSAMPLE_DATAで動いているページの実データ接続を、既存テーブルで足りるものだけでなく、必要な新規テーブル設計も含めて1本のspecにまとめてほしい」との指示を受け、本スペックを作成する。

現状（2026-08-28調査）: `dashboard`・`trial-balance`・`financial-statements`・`general-ledger`・`reconcile`・`export`・`payment-report`のうち後者5ページは既に`useLedgerTransactions`/`useBalanceSheetData`フック経由で実データ接続済み。残りは以下の通り、**フックを差し替えるだけで済むページ**と、**新規テーブルが要るページ**が混在している。

## 対象ページと分類

### Wave 1: 既存の`useLedgerTransactions`フックへの差し替えのみ（新規テーブル不要）
`lib/db/journalEntries.ts`・`lib/db/ledgerTransactions.ts`は実装済み。各ページの`SAMPLE_TRANSACTIONS`/`buildSampleTransactions()`相当（`CategorizedTransaction[]`）を`useLedgerTransactions(既存のサンプル定数)`に差し替えるだけでよい（`financial-statements`等5ページと全く同じパターン）。

- `dashboard/page.tsx`
- `budget/page.tsx`
- `rule-backfill/page.tsx`（`SAMPLE_TRANSACTIONS`部分のみ。`SAMPLE_USER_RULES`部分はWave 3）
- `monthly-close-checklist/MonthlyCloseChecklistPanel.tsx`（`SAMPLE_TRANSACTIONS`部分のみ。`SAMPLE_INVOICES`部分はWave 3）
- `notifications/page.tsx`（`SAMPLE_CATEGORIZED_TRANSACTIONS`部分のみ。`SAMPLE_RECONCILIATIONS`部分は実装時に対応要否を判断してよい。既存の照合結果永続化の仕組みが無ければ無理に接続せず「要ユーザー確認」として保留してよい）
- `invoice-reconciliation/page.tsx`（`SAMPLE_TRANSACTIONS`部分のみ。`SAMPLE_INVOICES`部分はWave 3）

### Wave 2: 既存テーブル・既存`lib/db/`層はあるがUIに未配線
`documents`テーブルと`lib/db/documents.ts`（`listDocuments()`等）、`lib/db/transactions.ts`・`lib/db/transactionSearch.ts`はすでに実装済み。UI側を接続するだけでよい。

- `documents/page.tsx` → `listDocuments()`
- `transactions/page.tsx`（`TransactionRow[]`を返す`SAMPLE_TRANSACTIONS`）→ `lib/db/transactions.ts`/`transactionSearch.ts`
- `journal/page.tsx` → 現状`useState<CategorizedTransaction[]>([])`で仕訳を画面内に保持するだけの入力フォーム。保存操作を`lib/db/journalEntries.ts`の`createJournalEntries()`に接続する（読み取りではなく書き込み側の配線）

### Wave 3: 新規テーブル・新規`lib/db/`層が必要
`schema.sql`に無いテーブルを追加し、対応する`lib/db/*.ts`を新設する。既存の`lib/tags/tagging.ts`・`lib/clients/clientMaster.ts`・`lib/invoice/receivables.ts`は意図的にDB非依存の純粋関数として書かれているため、これらは変更せず、DBの行から必要な最小フィールドを抜き出して渡す接続層だけを新設する。

#### `user_categorize_rules`（新設）
`lib/db/categorizeRules.ts`のコメントに想定スキーマが既に書かれている。それをそのまま使う:
```sql
create table if not exists user_categorize_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  pattern text not null,
  account text not null,
  tax_category text not null,
  note text,
  created_at timestamptz not null default now()
);
```
RLSは他テーブルと同じ`tenant_users`経由のポリシーを追加する。`lib/db/categorizeRules.ts`自体は実装済みなので、テーブル追加後は`rule-backfill/page.tsx`の`SAMPLE_USER_RULES`部分をこれに接続する。

#### `tags` / `tag_assignments`（新設）
`lib/tags/tagging.ts`の`Tag`/`TagAssignment`インターフェースに1:1対応させる:
```sql
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  label text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (tenant_id, label)
);

create table if not exists tag_assignments (
  tag_id uuid not null references tags (id) on delete cascade,
  transaction_id uuid not null references journal_entries (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tag_id, transaction_id)
);
```
`lib/db/tags.ts`を新設し、`listTags()`・`listTagAssignments()`・`upsertTag()`・`assignTag()`等を実装。`tags/page.tsx`を接続する。

#### `counterparties`（新設、取引先マスタ）
`lib/clients/clientMaster.ts`の`Counterparty`に1:1対応させる:
```sql
create table if not exists counterparties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('client', 'vendor')),
  default_account_name text,
  invoice_registration_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
`lib/db/clients.ts`を新設。`search/page.tsx`の`SAMPLE_CLIENTS`部分を接続する。

#### `invoices`（新設、未収入金集計用）
`lib/invoice/receivables.ts`の`ReceivableInvoiceInput`に1:1対応させる:
```sql
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  invoice_number text not null,
  client_name text not null,
  issue_date date not null,
  due_date date,
  grand_total bigint not null,
  paid_at date,
  paid_amount bigint,
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);
```
`lib/db/invoices.ts`を新設。`invoice-reconciliation/page.tsx`・`monthly-close-checklist/MonthlyCloseChecklistPanel.tsx`の`SAMPLE_INVOICES`部分、`search/page.tsx`の請求書検索部分を接続する。

いずれの新規テーブルもRLSを有効化し、既存テーブルと同じ`tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())`パターンのポリシーを追加する。

## 実装順序

Wave 1 → Wave 2 → Wave 3 の順で進める（Wave 3は新規テーブルのため`schema.sql`変更を伴い、他のWaveより影響範囲が広いため後回しにする）。各Waveの中のページ数が多いため、`docs/superpowers/service-financial-spec-driven-routine`の運用（1回の実行で最大3体・3バッチまで）に従い、複数回のルーティン実行にまたがってよい。1回のセッションで全ページ終わらなくても、実装済み/未実装をレポートに明記し、未完了分は次回以降のルーティン実行で本specが「未完了」と判定されて再度キューに入ることを期待する（`docs/superpowers/specs/2026-08-27-responsive-app-shell-design.md`と同じ運用）。

## テスト方針

- Wave 1: 各ページに`useLedgerTransactions`を使う既存5ページと同スタイルのテストを追加（Vitest + Testing Library、`isSampleData`のフォールバック動作を検証）
- Wave 2: `lib/db/documents.ts`・`transactions.ts`は既存テスト済みのため、UI側の配線テストのみ追加
- Wave 3: 新設する`lib/db/tags.ts`・`clients.ts`・`invoices.ts`は、既存の`lib/db/*.ts`と同スタイル（Supabaseクライアントをモックしたテスト）で追加
- 既存の全Vitestスイートがグリーンのまま維持されること
- `npm run lint`・`tsc --noEmit`・`npm run build`がクリーンであること

## 未解決・実装時に判断してよい事項

- `notifications/page.tsx`の`SAMPLE_RECONCILIATIONS`（銀行照合結果）は、永続化の仕組みが既存に無ければ無理に接続せず、レポートに「要ユーザー確認」として残してよい
- `journal/page.tsx`の保存操作を`createJournalEntries()`に接続する際のUI側の挙動（保存後に一覧をクリアするか等）は実装時の判断でよい
- 新規テーブルのカラム名・型は上記の通り既存TypeScriptインターフェースに1:1対応させる方針を優先し、追加のバリデーション要件（例: 請求書番号の採番規則）を勝手に作らない
