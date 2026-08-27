import { getSupabaseClient, FixedAssetRow } from "./supabaseClient";
import { Asset } from "../tax/depreciation";

// ------------------------------------------------------------------
// fixed_assets（固定資産台帳）への読み取りアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③
// 「balanceSheetForm.ts等の再設計・現金を伴わない仕訳の自動生成」のために必要な
// 最小限のCRUD（現時点では一覧取得のみ。固定資産の登録・編集用フォームは
// ステージ④の対象）。journalEntries.ts・accounts.ts と同じ形（テナントスコープを
// 明示的な引数として受け取る）に合わせている。
// ------------------------------------------------------------------

/** テナントの固定資産台帳を取得日の昇順で一覧取得する。 */
export async function listFixedAssets(tenantId: string): Promise<FixedAssetRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("acquisition_date", { ascending: true });

  if (error) {
    throw new Error(`固定資産台帳の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

/**
 * FixedAssetRow（DB行）を lib/tax/depreciation.ts の Asset（計算用の純粋な入力型）へ変換する。
 * asset_account_id・depreciation_expense_account_id 等、減価償却額の計算そのものには
 * 不要な列（生成仕訳の勘定科目を指定するための列）は含まない。
 */
export function toDepreciationAsset(row: FixedAssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    acquisitionDate: row.acquisition_date,
    acquisitionCost: row.acquisition_cost,
    usefulLifeYears: row.useful_life_years,
    immediateExpensing: row.immediate_expensing,
    method: row.method,
  };
}

/** 除却済み（disposed_atが対象期間末以前）の資産を除外した、期間末時点で保有中の固定資産のみを返す。 */
export function activeFixedAssetsAsOf(rows: FixedAssetRow[], asOfDate: string): FixedAssetRow[] {
  return rows.filter((row) => !row.disposed_at || row.disposed_at > asOfDate);
}
