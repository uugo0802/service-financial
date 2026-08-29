import { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// ------------------------------------------------------------------
// Supabaseクライアントのスキャフォールドのみ。実際のSupabaseプロジェクトへの
// 接続は行っていない（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// は未設定）。DB導入時（Phase 1後半〜Phase 2）に supabase/schema.sql を
// 実プロジェクトに適用し、.env.local に接続情報を設定してから使い始める想定。
// ------------------------------------------------------------------

// supabase/schema.sql の各テーブルに対応する型定義。
export interface Tenant {
  id: string;
  entity_type: "individual" | "corp";
  display_name: string;
  created_at: string;
  // ここから下は docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md で
  // 追加されたテナント拡張列（法人税・地方税計算に必要なメタデータ）。
  // 既存のサンプルデータ・テストフィクスチャ（settings/page.tsx等、本specのステージ①の対象外）を
  // 壊さないよう、DB上はNOT NULL DEFAULTの列も含めてTS側では省略可能にしている。
  company_type?: "godo" | "kabushiki" | null;
  prefecture_city_key?: string | null; // taxRateMaster.ts のキー
  fiscal_year_end_month?: number | null;
  capital_amount?: number;
  incorporation_date?: string | null;
  tax_payment_method?: "inclusive" | "exclusive";
  etax_taxpayer_id?: string | null;
  eltax_user_id?: string | null;
}

export interface TenantUser {
  user_id: string;
  tenant_id: string;
  role: "owner" | "member";
  created_at: string;
}

/** accounts.account_type。貸借対照表・損益計算書のどちら側の科目かを表す。 */
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface AccountRow {
  id: string;
  tenant_id: string;
  code: string | null;
  name: string;
  account_type: AccountType;
  tax_category: string | null; // この勘定科目のデフォルト税区分（自動仕訳の初期値）
  created_at: string;
}

/**
 * @deprecated 旧 transactions テーブル（単式簿記の1行1取引モデル）の型定義。
 * schema.sql からは journal_entries に置き換わっている（旧 transactions テーブル定義は削除済み）。
 * lib/db/transactions.ts をはじめとする既存の利用箇所（検索・タグ付け等、ページ配線を含む）は
 * 本スペックのステージ①の対象外のため、この型自体は当面残す。
 * 新規の実データ配線には journal_entries + JournalEntryRow / deriveCategorizedTransactions() を使うこと。
 */
export interface TransactionRow {
  id: string;
  tenant_id: string;
  date: string;
  description: string;
  amount: number;
  account_id: string | null;
  tax_category: string;
  confidence: number;
  source: "rule" | "ai" | "uncategorized";
  note: string | null;
  personal_deduction_only: boolean;
  created_at: string;
}

/**
 * 複式簿記仕訳（journal_entries）。1行 = 借方勘定・貸方勘定・金額の組。
 * lib/categorize/deriveFromLedger.ts の deriveCategorizedTransactions() で
 * 既存の CategorizedTransaction[] へ射影して、既存の lib/tax/* モジュールに渡す。
 */
export interface JournalEntryRow {
  id: string;
  tenant_id: string;
  entry_group_id: string;
  date: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number; // 円単位、常に正（借方＝貸方＝amount）
  description: string | null;
  tax_category: string;
  confidence: number;
  source: "rule" | "ai" | "uncategorized" | "manual" | "generated"; // 'generated' = 減価償却・借入金返済など自動生成された仕訳
  personal_deduction_only: boolean;
  exclude_from_income: boolean;
  created_at: string;
}

/** 固定資産台帳。lib/tax/depreciation.ts の Asset インターフェースと1:1で対応する。 */
export interface FixedAssetRow {
  id: string;
  tenant_id: string;
  name: string;
  acquisition_date: string;
  acquisition_cost: number;
  useful_life_years: number;
  immediate_expensing: boolean;
  method: "straight-line" | "declining-balance";
  asset_account_id: string; // 資産側の勘定科目（例: 工具器具備品）
  depreciation_expense_account_id: string; // 減価償却費の勘定科目
  disposed_at: string | null; // 除却・売却日。未除却なら null
  created_at: string;
}

/** 借入金台帳。元本・利率・返済条件を保持する。 */
export interface LoanRow {
  id: string;
  tenant_id: string;
  name: string; // 例: 「日本政策金融公庫 運転資金」
  principal_amount: number;
  interest_rate: number; // 年利率（例: 0.0175 = 1.75%）
  start_date: string;
  term_months: number;
  repayment_type: "equal-principal" | "equal-payment";
  liability_account_id: string; // 負債側の勘定科目（例: 長期借入金）
  interest_expense_account_id: string; // 支払利息の勘定科目
  created_at: string;
}

/** 期首残高（前期末＝当期首時点の残高を1回だけ記録する）。tenant_idが主キー。 */
export interface CompanyOpeningBalanceRow {
  tenant_id: string;
  as_of_date: string;
  cash_balance: number;
  retained_earnings: number; // 期首繰越利益積立金額（別表五（一）の前期繰越額と一致させる）
  created_at: string;
}

export interface DocumentRow {
  id: string;
  tenant_id: string;
  transaction_id: string | null; // journal_entries.id を指す（旧 transactions テーブルの置き換え）
  storage_path: string;
  uploaded_at: string;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: unknown;
  created_at: string;
}

let cachedClient: SupabaseClient | null = null;

/**
 * ブラウザ/クライアントサイド用のSupabaseクライアントを返す。
 * 環境変数が未設定の間は呼び出し時に例外を投げる（import時点では失敗させない
 * ことで、DB未導入の現状でもアプリのビルド・実行に影響しない設計にしている）。
 *
 * @supabase/supabase-js の createClient ではなく @supabase/ssr の
 * createBrowserClient を使う。前者はセッションをlocalStorageにのみ保存するため、
 * middleware.ts / lib/auth/serverSession.ts（サーバー側、Cookieからセッションを読む）
 * からはログイン状態が一切見えず、ログイン成功後にmiddlewareへ弾き返され続ける
 * バグの原因になっていた（2026-08-29発見）。createBrowserClientはセッションを
 * Cookieにも同期するため、ブラウザ側とサーバー側で同じログイン状態を共有できる。
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabaseが未設定です（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）。" +
        "現在このアプリはDB未接続で動作する設計のため、この関数はまだどこからも呼び出されていません。"
    );
  }

  cachedClient = createBrowserClient(url, anonKey);
  return cachedClient;
}
