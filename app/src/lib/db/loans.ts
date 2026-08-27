import { getSupabaseClient, LoanRow } from "./supabaseClient";
import { Loan } from "../tax/loanAmortization";

// ------------------------------------------------------------------
// loans（借入金台帳）への読み取りアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③
// 「balanceSheetForm.ts等の再設計・現金を伴わない仕訳の自動生成」のために必要な
// 最小限のCRUD（現時点では一覧取得のみ。借入金の登録・編集用フォームは
// ステージ④の対象）。fixedAssets.ts・journalEntries.ts・accounts.ts と同じ形
// （テナントスコープを明示的な引数として受け取る）に合わせている。
// ------------------------------------------------------------------

/** テナントの借入金台帳を借入日の昇順で一覧取得する。 */
export async function listLoans(tenantId: string): Promise<LoanRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("start_date", { ascending: true });

  if (error) {
    throw new Error(`借入金台帳の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

/**
 * LoanRow（DB行）を lib/tax/loanAmortization.ts の Loan（計算用の純粋な入力型）へ変換する。
 * liability_account_id・interest_expense_account_id 等、返済スケジュールの計算そのものには
 * 不要な列（生成仕訳の勘定科目を指定するための列）は含まない。
 */
export function toAmortizationLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    name: row.name,
    principalAmount: row.principal_amount,
    interestRate: row.interest_rate,
    startDate: row.start_date,
    termMonths: row.term_months,
    repaymentType: row.repayment_type,
  };
}
