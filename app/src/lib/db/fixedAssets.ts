import { getSupabaseClient, FixedAssetRow } from "./supabaseClient";
import { Asset } from "../tax/depreciation";

// ------------------------------------------------------------------
// fixed_assets（固定資産台帳）への読み書きアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③
// 「balanceSheetForm.ts等の再設計・現金を伴わない仕訳の自動生成」のために必要だった
// 一覧取得に加え、ステージ④「固定資産の登録用フォーム」が使う作成を提供する。
// journalEntries.ts・accounts.ts と同じ形（テナントスコープを明示的な引数として受け取る）
// に合わせている。
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

/** fixed_assets に1行挿入する際の入力（id・created_at等のDB側で決まる列を除く）。 */
export interface NewFixedAssetInput {
  name: string;
  acquisition_date: string;
  acquisition_cost: number;
  useful_life_years: number;
  immediate_expensing?: boolean;
  method?: FixedAssetRow["method"];
  asset_account_id: string;
  depreciation_expense_account_id: string;
  disposed_at?: string | null;
}

/**
 * 固定資産台帳に1件登録する（期首時点で既に保有している資産の投入、または期中の新規取得の
 * どちらにも使う。期首保有分は取得日を期首より前の実際の取得日にする）。
 */
export async function createFixedAsset(tenantId: string, input: NewFixedAssetInput): Promise<FixedAssetRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      acquisition_date: input.acquisition_date,
      acquisition_cost: input.acquisition_cost,
      useful_life_years: input.useful_life_years,
      immediate_expensing: input.immediate_expensing ?? false,
      method: input.method ?? "straight-line",
      asset_account_id: input.asset_account_id,
      depreciation_expense_account_id: input.depreciation_expense_account_id,
      disposed_at: input.disposed_at ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`固定資産の登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

// ------------------------------------------------------------------
// 固定資産登録フォーム向けの入力値バリデーション（openingBalances.tsのOpeningBalanceDraftと
// 同じ方針）。勘定科目（asset_account_id・depreciation_expense_account_id）はフォーム側の
// 勘定科目選択コンポーネントが必須選択を担保するため、ここでは空文字チェックのみ行う。
// ------------------------------------------------------------------

export interface FixedAssetDraft {
  name: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLifeYears: string;
  immediateExpensing: boolean;
  method: FixedAssetRow["method"];
  assetAccountId: string;
  depreciationExpenseAccountId: string;
}

export const EMPTY_FIXED_ASSET_DRAFT: FixedAssetDraft = {
  name: "",
  acquisitionDate: "",
  acquisitionCost: "",
  usefulLifeYears: "",
  immediateExpensing: false,
  method: "straight-line",
  assetAccountId: "",
  depreciationExpenseAccountId: "",
};

export type FixedAssetFieldErrors = Partial<Record<keyof FixedAssetDraft, string>>;

export function validateFixedAssetDraft(draft: FixedAssetDraft): FixedAssetFieldErrors {
  const errors: FixedAssetFieldErrors = {};

  if (!draft.name.trim()) {
    errors.name = "資産名を入力してください";
  }
  if (!draft.acquisitionDate.trim()) {
    errors.acquisitionDate = "取得日を入力してください";
  }
  if (draft.acquisitionCost.trim() === "" || !Number.isFinite(Number(draft.acquisitionCost)) || Number(draft.acquisitionCost) <= 0) {
    errors.acquisitionCost = "取得価額は0より大きい数値で入力してください";
  }
  if (
    draft.usefulLifeYears.trim() === "" ||
    !Number.isInteger(Number(draft.usefulLifeYears)) ||
    Number(draft.usefulLifeYears) <= 0
  ) {
    errors.usefulLifeYears = "耐用年数は1以上の整数で入力してください";
  }
  if (!draft.assetAccountId) {
    errors.assetAccountId = "資産側の勘定科目を選択してください";
  }
  if (!draft.depreciationExpenseAccountId) {
    errors.depreciationExpenseAccountId = "減価償却費の勘定科目を選択してください";
  }

  return errors;
}

export function hasFixedAssetErrors(errors: FixedAssetFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * draftをDB登録用の入力へ変換する。
 * 呼び出し側は事前に validateFixedAssetDraft でエラーがないことを確認しておくこと。
 */
export function draftToFixedAssetInput(draft: FixedAssetDraft): NewFixedAssetInput {
  return {
    name: draft.name.trim(),
    acquisition_date: draft.acquisitionDate.trim(),
    acquisition_cost: Number(draft.acquisitionCost) || 0,
    useful_life_years: Number(draft.usefulLifeYears) || 0,
    immediate_expensing: draft.immediateExpensing,
    method: draft.method,
    asset_account_id: draft.assetAccountId,
    depreciation_expense_account_id: draft.depreciationExpenseAccountId,
  };
}
