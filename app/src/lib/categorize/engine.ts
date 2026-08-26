import {
  CategoryRule,
  DEFAULT_EXPENSE,
  DEFAULT_INCOME,
  EXPENSE_RULES,
  INCOME_RULES,
  TaxCategory,
} from "./dictionary";

// "generated" は journal_entries.source の値（減価償却・借入金返済など自動生成された仕訳）を
// deriveCategorizedTransactions() でそのまま転記できるようにするための追加（2026-08-26
// 複式簿記台帳design docの「そのまま転記する」方針）。ruleBasedCategorize自体はこの値を返さない。
export type CategorySource = "rule" | "ai" | "uncategorized" | "manual" | "generated";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number; // 収入は正、支出は負
}

export interface CategorizedTransaction extends Transaction {
  account: string;
  taxCategory: TaxCategory;
  /** 0〜1。ルール完全一致は1、AI分類は返却値、未分類・要確認は0 */
  confidence: number;
  source: CategorySource;
  note?: string;
  /** 個人事業主の場合、事業の必要経費ではなく所得控除・参考情報として扱うべき項目 */
  personalDeductionOnly?: boolean;
  /** 借入金の実行・出資の払込み等、プラスの金額でも売上・事業収入として扱うべきではない項目 */
  excludeFromIncome?: boolean;
}

const CONFIDENCE_THRESHOLD = 0.75;

function matchRules(description: string, rules: CategoryRule[]): CategoryRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(description)) return rule;
  }
  return null;
}

/**
 * ルールベース分類。
 * 一致したルールの税区分が「要確認」の場合は、勘定科目自体は特定できていても
 * 税区分の確定はできていないとみなし、未分類の取引と同様に confidence=0・
 * source="uncategorized" として扱う（AIエスカレーション・人間レビューの対象に含めるため）。
 * それ以外で一致すれば confidence=1、何も一致しなければ既定カテゴリで confidence=0。
 */
export function ruleBasedCategorize(tx: Transaction): CategorizedTransaction {
  const isIncome = tx.amount > 0;
  const rules = isIncome ? INCOME_RULES : EXPENSE_RULES;
  const fallback = isIncome ? DEFAULT_INCOME : DEFAULT_EXPENSE;

  const matched = matchRules(tx.description, rules);
  const rule = matched ?? fallback;
  const isConfirmed = matched != null && rule.taxCategory !== "要確認";

  return {
    ...tx,
    account: rule.account,
    taxCategory: rule.taxCategory,
    confidence: isConfirmed ? 1 : 0,
    source: isConfirmed ? "rule" : "uncategorized",
    note: rule.note,
    personalDeductionOnly: rule.personalDeductionOnly,
    excludeFromIncome: rule.excludeFromIncome,
  };
}

export function needsEscalation(tx: CategorizedTransaction): boolean {
  return tx.confidence < CONFIDENCE_THRESHOLD;
}

export { CONFIDENCE_THRESHOLD };
