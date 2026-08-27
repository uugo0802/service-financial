import { getSupabaseClient, LoanRow } from "./supabaseClient";
import { Loan } from "../tax/loanAmortization";

// ------------------------------------------------------------------
// loans（借入金台帳）への読み書きアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③
// 「balanceSheetForm.ts等の再設計・現金を伴わない仕訳の自動生成」のために必要だった
// 一覧取得に加え、ステージ④「借入金の登録用フォーム」が使う作成を提供する。
// fixedAssets.ts・journalEntries.ts・accounts.ts と同じ形
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

/** loans に1行挿入する際の入力（id・created_at等のDB側で決まる列を除く）。 */
export interface NewLoanInput {
  name: string;
  principal_amount: number;
  interest_rate: number;
  start_date: string;
  term_months: number;
  repayment_type?: LoanRow["repayment_type"];
  liability_account_id: string;
  interest_expense_account_id: string;
}

/**
 * 借入金台帳に1件登録する（期首時点で既に返済中の借入金の投入、または期中の新規借入の
 * どちらにも使う。期首残高分は借入日を期首より前の実際の借入日にする）。
 */
export async function createLoan(tenantId: string, input: NewLoanInput): Promise<LoanRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("loans")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      principal_amount: input.principal_amount,
      interest_rate: input.interest_rate,
      start_date: input.start_date,
      term_months: input.term_months,
      repayment_type: input.repayment_type ?? "equal-principal",
      liability_account_id: input.liability_account_id,
      interest_expense_account_id: input.interest_expense_account_id,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`借入金の登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

// ------------------------------------------------------------------
// 借入金登録フォーム向けの入力値バリデーション（openingBalances.ts・fixedAssets.tsと
// 同じ方針）。年利率はフォーム上「%」表記（例: "1.75"）で受け取り、DB保存用の小数
// （0.0175）へはdraftToLoanInputで変換する。
// ------------------------------------------------------------------

export interface LoanDraft {
  name: string;
  principalAmount: string;
  interestRatePercent: string; // 例: "1.75" = 年利1.75%
  startDate: string;
  termMonths: string;
  repaymentType: LoanRow["repayment_type"];
  liabilityAccountId: string;
  interestExpenseAccountId: string;
}

export const EMPTY_LOAN_DRAFT: LoanDraft = {
  name: "",
  principalAmount: "",
  interestRatePercent: "",
  startDate: "",
  termMonths: "",
  repaymentType: "equal-principal",
  liabilityAccountId: "",
  interestExpenseAccountId: "",
};

export type LoanFieldErrors = Partial<Record<keyof LoanDraft, string>>;

export function validateLoanDraft(draft: LoanDraft): LoanFieldErrors {
  const errors: LoanFieldErrors = {};

  if (!draft.name.trim()) {
    errors.name = "借入先・借入名を入力してください";
  }
  if (draft.principalAmount.trim() === "" || !Number.isFinite(Number(draft.principalAmount)) || Number(draft.principalAmount) <= 0) {
    errors.principalAmount = "借入元本は0より大きい数値で入力してください";
  }
  if (draft.interestRatePercent.trim() === "" || !Number.isFinite(Number(draft.interestRatePercent)) || Number(draft.interestRatePercent) < 0) {
    errors.interestRatePercent = "年利率は0以上の数値で入力してください（例: 1.75）";
  }
  if (!draft.startDate.trim()) {
    errors.startDate = "借入日を入力してください";
  }
  if (draft.termMonths.trim() === "" || !Number.isInteger(Number(draft.termMonths)) || Number(draft.termMonths) <= 0) {
    errors.termMonths = "返済期間（月数）は1以上の整数で入力してください";
  }
  if (!draft.liabilityAccountId) {
    errors.liabilityAccountId = "負債側の勘定科目を選択してください";
  }
  if (!draft.interestExpenseAccountId) {
    errors.interestExpenseAccountId = "支払利息の勘定科目を選択してください";
  }

  return errors;
}

export function hasLoanErrors(errors: LoanFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * draftをDB登録用の入力へ変換する（年利率は%表記→小数に変換する）。
 * 呼び出し側は事前に validateLoanDraft でエラーがないことを確認しておくこと。
 */
export function draftToLoanInput(draft: LoanDraft): NewLoanInput {
  return {
    name: draft.name.trim(),
    principal_amount: Number(draft.principalAmount) || 0,
    interest_rate: (Number(draft.interestRatePercent) || 0) / 100,
    start_date: draft.startDate.trim(),
    term_months: Number(draft.termMonths) || 0,
    repayment_type: draft.repaymentType,
    liability_account_id: draft.liabilityAccountId,
    interest_expense_account_id: draft.interestExpenseAccountId,
  };
}
