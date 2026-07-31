import { CategorizedTransaction } from "../categorize/engine";
import { DEFAULT_EXPENSE, EXPENSE_RULES } from "../categorize/dictionary";

// ------------------------------------------------------------------
// 経費科目ごとの「月間予算」と、記帳済み取引の実績を比較する純粋関数群。
// business-plan.md 12節にある「税務に不慣れでランニングコストを下げたい」
// フリーランス/マイクロ法人向けに、税務判断を伴わない一般的な支出管理
// （予算 vs 実績の可視化）を提供する。
//
// 科目（カテゴリ）の一覧は categorize/dictionary.ts の EXPENSE_RULES /
// DEFAULT_EXPENSE をそのまま再利用する（独自のカテゴリ体系を新設しない）。
//
// 免責的な位置づけ: ここで扱うのは記帳データから機械的に算出した数値の比較と
// フラグ立てのみであり、個別の節税・支出削減の助言は行わない
// （呼び出し側のUIでも「advice」ではなく中立的な比較として表示すること）。
// ------------------------------------------------------------------

/** 月間予算1件。account は categorize/dictionary.ts の CategoryRule.account と同じ文字列を想定 */
export interface CategoryBudget {
  account: string;
  /** 月間予算額（円）。0以上を想定（0は「予算ゼロ＝支出禁止枠」として扱う） */
  monthlyBudgetYen: number;
}

export type BudgetTrackingStatus =
  /** 予算に対して実績が下回っている（または一致より下） */
  | "under_budget"
  /** 予算と実績が一致している（0円予算・0円実績を含む） */
  | "at_budget"
  /** 予算(>0)に対して実績が上回っている */
  | "over_budget"
  /** 予算が0円のカテゴリに実績が発生している。ゼロ除算になるため超過率(%)は算出せず、フラグのみで超過を示す */
  | "over_budget_no_cap"
  /** このカテゴリには予算が設定されていない（実績のみ存在、または予算が後から削除された） */
  | "no_budget_set";

export interface CategoryBudgetComparison {
  account: string;
  /** 設定されている月間予算額（円）。予算が設定されていないカテゴリは null */
  budgetYen: number | null;
  /** 対象期間の実績支出合計（円、常に0以上） */
  actualYen: number;
  /**
   * 予算との差額（円）= budgetYen - actualYen。
   * 正の値は予算の残り、負の値は超過額を表す。予算未設定（budgetYen === null）の場合は null
   */
  varianceYen: number | null;
  /**
   * 予算に対する超過率(%) = (actualYen - budgetYen) / budgetYen * 100。
   * budgetYen が 0 または未設定（null）の場合、ゼロ除算・NaN/Infinity を避けるため null を返す。
   * その場合でも status / isOverBudget で超過の有無自体は判定できる。
   */
  overagePercent: number | null;
  status: BudgetTrackingStatus;
  /** 予算超過（または上限0円での実績発生）を示すフラグ。UI側の警告表示用 */
  isOverBudget: boolean;
}

export interface BudgetTrackingResult {
  /** 集計対象の期間。"YYYY-MM" 形式 */
  period: string;
  comparisons: CategoryBudgetComparison[];
  /** 予算超過（no_budget_setを除く）と判定されたカテゴリ数 */
  overBudgetCount: number;
  /** 対象期間・対象カテゴリの実績支出合計（円） */
  totalActualYen: number;
  /** 設定されている月間予算の合計（円）。予算未設定カテゴリの実績は含まれない */
  totalBudgetYen: number;
}

/**
 * categorize/dictionary.ts の EXPENSE_RULES / DEFAULT_EXPENSE から、既存の経費科目
 * （account）一覧を重複なく取り出す。予算設定フォームの選択肢に使う想定。
 * 新しいカテゴリ体系を作らず、既存の自動分類ルールの科目名をそのまま流用するため。
 */
export function knownExpenseCategories(): string[] {
  const seen = new Set<string>();
  const accounts: string[] = [];
  for (const rule of [...EXPENSE_RULES, DEFAULT_EXPENSE]) {
    if (!seen.has(rule.account)) {
      seen.add(rule.account);
      accounts.push(rule.account);
    }
  }
  return accounts;
}

/**
 * 取引フォームの文字列入力から予算額（円）を安全にパースする。
 * 空文字・非数値・NaN/Infinity・負の値は 0（＝未設定と同じ挙動）として扱い、
 * 小数点以下は円単位に丸める。ここでも NaN/Infinity をそのまま状態に残さないための防御。
 */
export function parseBudgetInputYen(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * 予算一覧の中から指定カテゴリの月間予算額を更新（未登録なら追加）した新しい配列を返す。
 * 元の配列は変更しない（呼び出し側は React の状態更新にそのまま使える）。
 */
export function upsertCategoryBudget(
  budgets: readonly CategoryBudget[],
  account: string,
  monthlyBudgetYen: number
): CategoryBudget[] {
  const index = budgets.findIndex((b) => b.account === account);
  const entry: CategoryBudget = { account, monthlyBudgetYen };
  if (index === -1) return [...budgets, entry];
  const next = [...budgets];
  next[index] = entry;
  return next;
}

/** 指定カテゴリの予算設定を取り除いた新しい配列を返す（「このカテゴリの予算はもう管理しない」場合用） */
export function removeCategoryBudget(budgets: readonly CategoryBudget[], account: string): CategoryBudget[] {
  return budgets.filter((b) => b.account !== account);
}

/**
 * 指定期間（"YYYY-MM"）における、経費科目（account）ごとの実績支出合計（円）を算出する。
 * - 収入行（amount >= 0）は対象外。
 * - 取引の date は "YYYY-MM-DD"（ISO日付）を想定し、先頭7文字が period と一致するものだけを集計する。
 */
export function computeActualExpenseByCategory(
  transactions: readonly CategorizedTransaction[],
  period: string
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (!tx.date.startsWith(period)) continue;
    const current = totals.get(tx.account) ?? 0;
    totals.set(tx.account, current + Math.abs(tx.amount));
  }
  return totals;
}

function buildComparison(account: string, budgetYen: number | null, actualYen: number): CategoryBudgetComparison {
  if (budgetYen === null) {
    return {
      account,
      budgetYen: null,
      actualYen,
      varianceYen: null,
      overagePercent: null,
      status: "no_budget_set",
      isOverBudget: false,
    };
  }

  const varianceYen = budgetYen - actualYen;

  if (budgetYen === 0) {
    // 予算0円は「支出しない想定の枠」。実績が発生した場合は超過率(%)の分母が0になるため
    // 算出せず null にし、over_budget_no_cap ステータスとフラグのみで超過を表す。
    const status: BudgetTrackingStatus = actualYen > 0 ? "over_budget_no_cap" : "at_budget";
    return {
      account,
      budgetYen,
      actualYen,
      varianceYen,
      overagePercent: null,
      status,
      isOverBudget: actualYen > 0,
    };
  }

  const overagePercent = ((actualYen - budgetYen) / budgetYen) * 100;
  const status: BudgetTrackingStatus =
    actualYen > budgetYen ? "over_budget" : actualYen < budgetYen ? "under_budget" : "at_budget";

  return {
    account,
    budgetYen,
    actualYen,
    varianceYen,
    overagePercent,
    status,
    isOverBudget: actualYen > budgetYen,
  };
}

/**
 * 予算一覧と記帳済み取引から、指定期間（"YYYY-MM"）の科目別「予算 vs 実績」比較を組み立てる。
 *
 * 対象カテゴリは「予算が設定されている科目」と「その期間に実績支出がある科目」の和集合。
 * どちらも無い科目（予算未設定かつ実績0円）は比較対象に含めない（表示するものが無いため）。
 *
 * - 予算未設定の科目に実績がある場合 → status: "no_budget_set"（予算を後から削除した場合も含む）
 * - 予算0円かつ実績0円 → status: "at_budget"
 * - 予算0円かつ実績>0円 → status: "over_budget_no_cap"（超過率はゼロ除算のため null）
 * - 予算>0円 → 実績との比較により under_budget / at_budget / over_budget
 */
export function compareBudgetToActual(
  budgets: readonly CategoryBudget[],
  transactions: readonly CategorizedTransaction[],
  period: string
): BudgetTrackingResult {
  const actualByCategory = computeActualExpenseByCategory(transactions, period);
  const budgetByCategory = new Map(budgets.map((b) => [b.account, b.monthlyBudgetYen]));

  const categories = new Set<string>([...budgetByCategory.keys(), ...actualByCategory.keys()]);

  const comparisons = [...categories]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .map((account) => {
      const actualYen = actualByCategory.get(account) ?? 0;
      const budgetYen = budgetByCategory.has(account) ? budgetByCategory.get(account)! : null;
      return buildComparison(account, budgetYen, actualYen);
    });

  const overBudgetCount = comparisons.filter((c) => c.isOverBudget).length;
  const totalActualYen = comparisons.reduce((sum, c) => sum + c.actualYen, 0);
  const totalBudgetYen = comparisons.reduce((sum, c) => sum + (c.budgetYen ?? 0), 0);

  return { period, comparisons, overBudgetCount, totalActualYen, totalBudgetYen };
}

/** 現在時刻から "YYYY-MM" 形式の期間キーを作る（UIの期間選択の初期値用） */
export function formatPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
