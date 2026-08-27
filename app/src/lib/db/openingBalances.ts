import { getSupabaseClient, CompanyOpeningBalanceRow } from "./supabaseClient";

// ------------------------------------------------------------------
// company_opening_balances（期首残高、tenant_idが主キー＝テナントにつき1行のみ）への
// 読み書きアクセス。docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md
// ステージ③「balanceSheetForm.ts等の再設計」のために必要だった取得に加え、
// ステージ④「期首残高投入用のフォーム」が使う投入（作成・更新）を提供する。
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

/** company_opening_balances を投入・更新する際の入力（tenant_id・created_atはDB側で決まる）。 */
export interface UpsertCompanyOpeningBalanceInput {
  as_of_date: string;
  cash_balance: number;
  retained_earnings: number;
}

/**
 * テナントの期首残高を投入・更新する（tenant_idが主キーのため、既存行があれば上書きする）。
 * ステージ④で新設した、期首残高投入用フォームからの唯一の書き込み経路。
 */
export async function upsertCompanyOpeningBalance(
  tenantId: string,
  input: UpsertCompanyOpeningBalanceInput
): Promise<CompanyOpeningBalanceRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("company_opening_balances")
    .upsert(
      {
        tenant_id: tenantId,
        as_of_date: input.as_of_date,
        cash_balance: input.cash_balance,
        retained_earnings: input.retained_earnings,
      },
      { onConflict: "tenant_id" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`期首残高の保存に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

// ------------------------------------------------------------------
// 期首残高投入フォーム向けの入力値バリデーション（tenants.tsのTenantProfileDraft/
// validateTenantProfileDraftと同じ方針。フォームの生の文字列入力を保持するDraft型と、
// 送信前チェック・DB用パッチへの変換を素の関数として切り出し、UI側はこれらを呼ぶだけにする）。
// ------------------------------------------------------------------

/** フォームの入力値。数値項目は入力途中の状態も表現できるよう文字列のまま保持する。 */
export interface OpeningBalanceDraft {
  asOfDate: string;
  cashBalance: string;
  retainedEarnings: string;
}

export const EMPTY_OPENING_BALANCE_DRAFT: OpeningBalanceDraft = {
  asOfDate: "",
  cashBalance: "",
  retainedEarnings: "",
};

/** 保存済みの期首残高を編集フォームの初期値へ変換する。 */
export function openingBalanceToDraft(row: CompanyOpeningBalanceRow): OpeningBalanceDraft {
  return {
    asOfDate: row.as_of_date,
    cashBalance: String(row.cash_balance),
    retainedEarnings: String(row.retained_earnings),
  };
}

export type OpeningBalanceFieldErrors = Partial<Record<keyof OpeningBalanceDraft, string>>;

/**
 * フォーム入力のバリデーション。エラーがなければ空オブジェクトを返す。
 * 現金残高は負の期首残高がありえないため0以上を必須とするが、繰越利益剰余金は
 * 繰越欠損金（マイナス）もありうるため符号は問わない。
 */
export function validateOpeningBalanceDraft(draft: OpeningBalanceDraft): OpeningBalanceFieldErrors {
  const errors: OpeningBalanceFieldErrors = {};

  if (!draft.asOfDate.trim()) {
    errors.asOfDate = "期首日（前期末日）を入力してください";
  }

  if (draft.cashBalance.trim() === "") {
    errors.cashBalance = "期首現金・預金残高を入力してください";
  } else if (!Number.isFinite(Number(draft.cashBalance)) || Number(draft.cashBalance) < 0) {
    errors.cashBalance = "期首現金・預金残高は0以上の数値で入力してください";
  }

  if (draft.retainedEarnings.trim() === "") {
    errors.retainedEarnings = "期首繰越利益剰余金を入力してください";
  } else if (!Number.isFinite(Number(draft.retainedEarnings))) {
    errors.retainedEarnings = "期首繰越利益剰余金は数値で入力してください";
  }

  return errors;
}

export function hasOpeningBalanceErrors(errors: OpeningBalanceFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * draftをDB保存用の入力へ変換する。
 * 呼び出し側は事前に validateOpeningBalanceDraft でエラーがないことを確認しておくこと。
 */
export function draftToOpeningBalanceInput(draft: OpeningBalanceDraft): UpsertCompanyOpeningBalanceInput {
  return {
    as_of_date: draft.asOfDate.trim(),
    cash_balance: Number(draft.cashBalance) || 0,
    retained_earnings: Number(draft.retainedEarnings) || 0,
  };
}
