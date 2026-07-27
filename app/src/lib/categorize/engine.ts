import {
  CategoryRule,
  DEFAULT_EXPENSE,
  DEFAULT_INCOME,
  EXPENSE_RULES,
  INCOME_RULES,
  TaxCategory,
} from "./dictionary";

export type CategorySource = "rule" | "ai" | "uncategorized" | "manual";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number; // 収入は正、支出は負
}

export interface CategorizedTransaction extends Transaction {
  account: string;
  taxCategory: TaxCategory;
  /** 0〜1。ルール完全一致は1、AI分類は返却値、未分類は0 */
  confidence: number;
  source: CategorySource;
  note?: string;
  /** 個人事業主の場合、事業の必要経費ではなく所得控除・参考情報として扱うべき項目 */
  personalDeductionOnly?: boolean;
}

const CONFIDENCE_THRESHOLD = 0.75;

function matchRules(description: string, rules: CategoryRule[]): CategoryRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(description)) return rule;
  }
  return null;
}

/** ルールベース分類。マッチすれば confidence=1、しなければ既定カテゴリで confidence=0 */
export function ruleBasedCategorize(tx: Transaction): CategorizedTransaction {
  const isIncome = tx.amount > 0;
  const rules = isIncome ? INCOME_RULES : EXPENSE_RULES;
  const fallback = isIncome ? DEFAULT_INCOME : DEFAULT_EXPENSE;

  const matched = matchRules(tx.description, rules);
  const rule = matched ?? fallback;

  return {
    ...tx,
    account: rule.account,
    taxCategory: rule.taxCategory,
    confidence: matched ? 1 : 0,
    source: matched ? "rule" : "uncategorized",
    note: rule.note,
    personalDeductionOnly: rule.personalDeductionOnly,
  };
}

export function needsEscalation(tx: CategorizedTransaction): boolean {
  return tx.confidence < CONFIDENCE_THRESHOLD;
}

export { CONFIDENCE_THRESHOLD };
