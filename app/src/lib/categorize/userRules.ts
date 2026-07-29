// ユーザー辞書編集機能 — テナントごとのカスタム分類ルール。
//
// dictionary.ts（グローバルなキーワード辞書）には一切手を加えない、追加のレイヤーとして実装する。
// dictionary.ts からは型（CategoryRule / TaxCategory）のみをインポートし、
// EXPENSE_RULES / INCOME_RULES といった実際のルール配列には依存しない。
// これにより、辞書本体に対する他の変更（キーワードの追加・修正等）と競合せず、
// このファイルは常にグローバル辞書から疎結合な状態を保つ。
//
// 注意: これはMVP用の簡易ルールであり、正式な税務判断ではありません。
// 最終的な勘定科目・税区分の確定は必ず利用者本人が確認してください。

import type { CategoryRule, TaxCategory } from "./dictionary";

export type { TaxCategory };

/**
 * ユーザーが登録できるキーワード（マッチパターン）の最小文字数。
 *
 * dictionary.ts の履歴（コミット ae8d39b「Fix false-positive categorization from
 * unbounded short keywords (au/ANA/JR/JAL/ETC)」）が示すとおり、"au" / "ANA" / "JR" のような
 * 1〜2文字の非境界キーワードは、"Restaurant"（auを含む）や "Panasonic"（anaを含む）のような
 * 無関係な文字列に対しても意図せずマッチしてしまい、誤分類（偽陽性）を引き起こす。
 * グローバル辞書側は \b による単語境界で対処できたが、ユーザーが自由入力するキーワードには
 * 同様の境界指定を保証できないため、この機能では「短すぎるキーワードそのものを入力時点で
 * 拒否する」という、より単純で安全側に倒したガードを採用する。
 */
export const MIN_PATTERN_LENGTH = 3;

/**
 * 税区分の選択肢一覧（フォームの<select>等で使用する）。
 *
 * dictionary.ts は同内容の TAX_CATEGORIES を値としてエクスポートしているが、本ファイルは
 * dictionary.ts から型（TaxCategory）のみに依存する方針のため、値としてはインポートせず
 * ここで独立して定義する。TaxCategory 型に新しい選択肢を追加した場合は、この配列も
 * 手動で追従させる必要がある点に注意。
 */
export const TAX_CATEGORY_OPTIONS: TaxCategory[] = [
  "課税売上10%",
  "課税仕入10%",
  "課税仕入8%(軽減)",
  "非課税",
  "不課税",
  "対象外",
  "要確認",
];

/** ユーザー辞書ルールの下書き（保存前の入力値）。 */
export interface UserCategoryRuleDraft {
  /** 摘要文字列に対するマッチキーワード（正規表現ではなく単純な文字列として扱う） */
  pattern: string;
  account: string;
  taxCategory: TaxCategory;
  /** ルールの補足メモ（任意） */
  note?: string;
}

/** 保存済みのユーザー辞書ルール。 */
export interface UserCategoryRule extends UserCategoryRuleDraft {
  id: string;
  /** ISO8601形式の作成日時 */
  createdAt: string;
}

export type UserCategoryRuleFieldErrors = Partial<Record<"pattern" | "account" | "taxCategory", string>>;

/**
 * 新規ルール下書きのバリデーション。エラーがなければ空オブジェクトを返す。
 * - パターンが空でないこと
 * - パターンが MIN_PATTERN_LENGTH 文字以上であること（誤分類防止。上記コメント参照）
 * - 勘定科目が空でないこと
 * - 税区分が指定されていること
 */
export function validateUserCategoryRuleDraft(draft: UserCategoryRuleDraft): UserCategoryRuleFieldErrors {
  const errors: UserCategoryRuleFieldErrors = {};
  const pattern = draft.pattern.trim();
  const account = draft.account.trim();

  if (!pattern) {
    errors.pattern = "キーワード（マッチパターン）を入力してください";
  } else if (pattern.length < MIN_PATTERN_LENGTH) {
    errors.pattern = `キーワードは${MIN_PATTERN_LENGTH}文字以上で入力してください（短すぎるキーワードは無関係な取引まで誤って分類してしまう恐れがあります）`;
  }

  if (!account) {
    errors.account = "勘定科目を入力してください";
  }

  if (!draft.taxCategory) {
    errors.taxCategory = "税区分を選択してください";
  }

  return errors;
}

export function hasUserCategoryRuleErrors(errors: UserCategoryRuleFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `user-rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * バリデーション済みの下書きから保存用のユーザー辞書ルールを作成する。
 * 呼び出し側は事前に validateUserCategoryRuleDraft でエラーがないことを確認しておくこと。
 */
export function createUserCategoryRule(draft: UserCategoryRuleDraft, now: Date = new Date()): UserCategoryRule {
  const note = draft.note?.trim();
  return {
    pattern: draft.pattern.trim(),
    account: draft.account.trim(),
    taxCategory: draft.taxCategory,
    note: note ? note : undefined,
    id: generateId(),
    createdAt: now.toISOString(),
  };
}

/** 正規表現の特殊文字をエスケープし、キーワードをそのままの文字列として扱えるようにする */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ユーザー辞書ルールを、グローバル辞書と同じ CategoryRule 形式に変換する。
 * ユーザー入力は正規表現ではなく単純なキーワード文字列として扱い、
 * 大文字小文字を無視した（エスケープ済みの）部分一致に変換する。
 */
export function userCategoryRuleToCategoryRule(rule: UserCategoryRule): CategoryRule {
  return {
    pattern: new RegExp(escapeRegExp(rule.pattern), "i"),
    account: rule.account,
    taxCategory: rule.taxCategory,
    note: rule.note ?? `ユーザー辞書登録ルール（${rule.createdAt.slice(0, 10)}追加）`,
  };
}

/**
 * グローバル辞書ルール（呼び出し側が dictionary.ts から渡す EXPENSE_RULES / INCOME_RULES 等）と
 * テナント固有のユーザールールをマージし、優先順位付きの単一配列として返す純粋関数。
 *
 * engine.ts の matchRules は配列の先頭から順に評価し、最初にマッチしたルールを採用する
 * （dictionary.ts 冒頭のコメント「ルールは配列の先頭から順に評価され、最初にマッチしたものが
 * 採用されます」を参照）。そのため、ユーザールールを常に先頭側に置くことで、同じ取引摘要に
 * グローバル辞書とユーザー辞書の両方がマッチする場合でも、ユーザー辞書側が優先される。
 *
 * ユーザールール同士は配列内の順序（登録順）で先勝ちとする。
 * globalRules 自体は変更しない（新しい配列を返す）。
 */
export function mergeCategoryRules(globalRules: CategoryRule[], userRules: UserCategoryRule[]): CategoryRule[] {
  if (userRules.length === 0) {
    // ユーザールールが1件もない場合は、グローバル辞書のみのこれまでの挙動に完全に一致させる
    // （新しい配列を作らず、そのまま返す）。
    return globalRules;
  }
  return [...userRules.map(userCategoryRuleToCategoryRule), ...globalRules];
}

/**
 * マージ済みルール配列の中から、摘要に最初にマッチするルールを返す（なければ null）。
 *
 * engine.ts の matchRules と同じ「先頭から順に評価し最初にマッチしたもの」というロジックだが、
 * engine.ts は本機能の対象外（変更禁止）のためインポートせず、ここに意図的に複製している。
 * 実際に本番の分類フローへ組み込む場合は、mergeCategoryRules の結果を engine.ts 側の
 * 呼び出し元に渡す配線が別途必要になる。
 */
export function findMatchingRule(description: string, rules: CategoryRule[]): CategoryRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(description)) return rule;
  }
  return null;
}
