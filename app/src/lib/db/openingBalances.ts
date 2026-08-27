import { getSupabaseClient, CompanyOpeningBalanceRow } from "./supabaseClient";

// ------------------------------------------------------------------
// company_opening_balances（期首残高、tenant_idが主キー＝テナントにつき1行のみ）への
// 読み取りアクセス。docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md
// ステージ③「balanceSheetForm.ts等の再設計」のために必要な最小限のCRUD（現時点では
// 取得のみ。期首残高の投入用フォームはステージ④の対象）。
// accounts.ts・journalEntries.ts と同じ形（テナントスコープを明示的な引数として受け取る）
// に合わせている。
// ------------------------------------------------------------------

/**
 * テナントの期首残高（company_opening_balances）を取得する。
 * まだ投入されていないテナント（ステージ④のフォーム未使用）の場合は null を返す
 * （行が存在しない、またはRLSにより取得できない場合を区別しない）。
 */
export async function getCompanyOpeningBalance(tenantId: string): Promise<CompanyOpeningBalanceRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("company_opening_balances").select("*").eq("tenant_id", tenantId).maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}
