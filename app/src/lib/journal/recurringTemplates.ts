// 定期取引テンプレート（家賃・サブスクリプション費用・顧問料など、毎月ほぼ同じ内容で発生する
// 取引のひな形）機能。
//
// journal/recurringEntries.ts（既存機能）は「テンプレートからワンクリックで仕訳を確定生成する」
// ためのものだが、本ファイルはその逆方向の用途を扱う:
//   1. テンプレートを登録する（勘定科目・金額・税区分・発生日・摘要パターン）
//   2. CSV取込・手入力で入ってきた実際の取引を、摘要パターン＋金額の近似＋発生日（日にち）の
//      許容誤差でテンプレートと突き合わせ、「この取引はどのテンプレートに該当しそうか」を提案する
//   3. 当月について「本来発生するはずだが、まだ記帳されていない定期取引」を検出し、
//      記帳漏れに気づけるようにする
//
// recurringEntries.ts とは型・関数名の両方を独立させ、互いにインポートしない（userRules.ts が
// dictionary.ts と疎結合を保つのと同じ設計方針）。
//
// 注意: これはMVP用の簡易ロジックであり、正式な税務判断ではありません。
// 最終的な勘定科目・税区分・金額の確定は必ず利用者本人が確認してください。

import type { Transaction } from "../categorize/engine";
import { TaxCategory } from "../categorize/dictionary";

export type { Transaction };

/**
 * テンプレートの摘要マッチパターンとして許容する最小文字数。
 * userRules.ts の MIN_PATTERN_LENGTH と同じ理由（"au"/"ANA"/"JR"のような短い非境界キーワードが
 * 無関係な取引に誤って一致するのを防ぐ）で、こちらも独立して同じ値を定義する。
 */
export const MIN_PATTERN_LENGTH = 3;

/** 定期取引テンプレートの登録フォーム下書き（保存前の入力値、数値項目は入力中の生文字列） */
export interface RecurringTransactionTemplateDraft {
  /** 摘要に対するマッチキーワード（正規表現ではなく単純な文字列として扱う） */
  pattern: string;
  account: string;
  taxCategory: TaxCategory;
  /** 想定金額の生文字列。収入は正、支出は負の数値として入力する */
  amount: string;
  /** 想定発生日（1〜31）の生文字列。月末を超える指定は対象月の末日に丸められる */
  dayOfMonth: string;
  note?: string;
}

/** 保存済みの定期取引テンプレート */
export interface RecurringTransactionTemplate {
  id: string;
  pattern: string;
  account: string;
  taxCategory: TaxCategory;
  /** 想定金額。収入は正、支出は負の数値 */
  amount: number;
  /** 想定発生日（1〜31） */
  dayOfMonth: number;
  note?: string;
  /** ISO8601形式の作成日時 */
  createdAt: string;
  /** falseの場合、一覧には残すがマッチング・期待リストの対象から除外する（解約済み等） */
  active: boolean;
}

export type RecurringTransactionTemplateFieldErrors = Partial<
  Record<"pattern" | "account" | "taxCategory" | "amount" | "dayOfMonth", string>
>;

export const EMPTY_RECURRING_TEMPLATE_DRAFT: RecurringTransactionTemplateDraft = {
  pattern: "",
  account: "",
  taxCategory: "課税仕入10%",
  amount: "",
  dayOfMonth: "",
  note: "",
};

const NUMERIC_FORMAT = /^-?\d+(\.\d+)?$/;
const INTEGER_FORMAT = /^\d+$/;

/**
 * 新規テンプレート下書きのバリデーション。エラーがなければ空オブジェクトを返す。
 * - パターンが空でなく MIN_PATTERN_LENGTH 文字以上であること（誤マッチ防止）
 * - 勘定科目・税区分が指定されていること
 * - 金額が0以外の数値であること
 * - 発生日が1〜31の整数であること
 */
export function validateRecurringTransactionTemplateDraft(
  draft: RecurringTransactionTemplateDraft
): RecurringTransactionTemplateFieldErrors {
  const errors: RecurringTransactionTemplateFieldErrors = {};
  const pattern = draft.pattern.trim();
  const account = draft.account.trim();

  if (!pattern) {
    errors.pattern = "摘要のマッチパターンを入力してください";
  } else if (pattern.length < MIN_PATTERN_LENGTH) {
    errors.pattern = `パターンは${MIN_PATTERN_LENGTH}文字以上で入力してください（短すぎると無関係な取引まで一致してしまいます）`;
  }

  if (!account) {
    errors.account = "勘定科目を入力してください";
  }

  if (!draft.taxCategory) {
    errors.taxCategory = "税区分を選択してください";
  }

  const amount = draft.amount.trim();
  if (!amount) {
    errors.amount = "想定金額を入力してください";
  } else if (!NUMERIC_FORMAT.test(amount)) {
    errors.amount = "想定金額は数値で入力してください";
  } else if (Number(amount) === 0) {
    errors.amount = "想定金額は0以外の数値で入力してください";
  }

  const dayOfMonth = draft.dayOfMonth.trim();
  if (!dayOfMonth) {
    errors.dayOfMonth = "想定発生日を入力してください";
  } else if (!INTEGER_FORMAT.test(dayOfMonth) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31) {
    errors.dayOfMonth = "想定発生日は1〜31の整数で入力してください";
  }

  return errors;
}

export function hasRecurringTransactionTemplateErrors(errors: RecurringTransactionTemplateFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * バリデーション済みの下書きから保存用のテンプレートを作成する。
 * 呼び出し側は事前に validateRecurringTransactionTemplateDraft でエラーがないことを確認しておくこと。
 */
export function createRecurringTransactionTemplate(
  draft: RecurringTransactionTemplateDraft,
  now: Date = new Date()
): RecurringTransactionTemplate {
  const note = draft.note?.trim();
  return {
    id: generateId(),
    pattern: draft.pattern.trim(),
    account: draft.account.trim(),
    taxCategory: draft.taxCategory,
    amount: Number(draft.amount.trim()),
    dayOfMonth: Number(draft.dayOfMonth.trim()),
    note: note ? note : undefined,
    createdAt: now.toISOString(),
    active: true,
  };
}

/** 下書きをバリデーションのうえテンプレート一覧に登録する純粋関数。新しい配列を返す */
export function registerRecurringTemplate(
  templates: RecurringTransactionTemplate[],
  draft: RecurringTransactionTemplateDraft,
  now: Date = new Date()
): RecurringTransactionTemplate[] {
  return [...templates, createRecurringTransactionTemplate(draft, now)];
}

export function removeRecurringTemplate(
  templates: RecurringTransactionTemplate[],
  id: string
): RecurringTransactionTemplate[] {
  return templates.filter((template) => template.id !== id);
}

/** テンプレートの有効/無効を切り替える（削除せず一時停止したいケース向け） */
export function toggleRecurringTemplateActive(
  templates: RecurringTransactionTemplate[],
  id: string
): RecurringTransactionTemplate[] {
  return templates.map((template) => (template.id === id ? { ...template, active: !template.active } : template));
}

// --- マッチング -----------------------------------------------------------

/** マッチング時に許容する誤差。金額は比率、発生日は日数で指定する */
export interface RecurringTemplateMatchTolerance {
  /** 金額の許容乖離率（例: 0.1 = 想定金額の±10%まで許容） */
  amountToleranceRatio: number;
  /** 発生日（日にち）の許容乖離日数 */
  dayOfMonthTolerance: number;
}

/** 既定の許容誤差。想定金額の±10%、発生日の前後3日まではゆらぎとして許容する */
export const DEFAULT_MATCH_TOLERANCE: RecurringTemplateMatchTolerance = {
  amountToleranceRatio: 0.1,
  dayOfMonthTolerance: 3,
};

/**
 * 正規表現の特殊文字をエスケープし、パターンをそのままの文字列として扱えるようにする。
 * userRules.ts の同名関数と同じ考え方だが、本ファイルを独立させる方針のためあえて複製している。
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesDescription(template: RecurringTransactionTemplate, description: string): boolean {
  return new RegExp(escapeRegExp(template.pattern), "i").test(description);
}

/** "YYYY-MM-DD" 形式の日付文字列から「日」だけを取り出す。形式が不正な場合はnull */
function dayOfMonthFromDate(date: string): number | null {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(date);
  if (!match) return null;
  return Number(match[1]);
}

/** 1件のテンプレートに対するマッチング結果の詳細（乖離の大きさをUI表示に使えるよう保持する） */
export interface RecurringTemplateMatchResult {
  template: RecurringTransactionTemplate;
  /** |実際の金額 - 想定金額| / |想定金額| */
  amountDeltaRatio: number;
  /** |実際の発生日 - 想定発生日|（日数） */
  dayOfMonthDelta: number;
}

/**
 * 1件の取引が1件のテンプレートに一致するかどうかを判定する。
 * 一致条件（すべて満たす場合のみ一致とみなす）:
 * - テンプレートが有効（active）であること
 * - 摘要にテンプレートのパターンが含まれること（大文字小文字を無視した部分一致）
 * - 収入/支出の符号が一致すること
 * - 金額の乖離率が許容範囲内であること
 * - 取引日の「日」とテンプレートの想定発生日との差が許容日数以内であること
 * 一致しない場合は null を返す。
 */
export function matchTransactionToTemplate(
  transaction: Transaction,
  template: RecurringTransactionTemplate,
  tolerance: RecurringTemplateMatchTolerance = DEFAULT_MATCH_TOLERANCE
): RecurringTemplateMatchResult | null {
  if (!template.active) return null;
  if (!matchesDescription(template, transaction.description)) return null;

  // 符号（収入/支出）が異なる取引はそもそも同一の定期取引とはみなさない。
  // Math.sign(0) は 0 になるが、テンプレート・取引双方とも金額0はバリデーションで排除される想定。
  if (Math.sign(transaction.amount) !== Math.sign(template.amount)) return null;

  const amountDeltaRatio = Math.abs(transaction.amount - template.amount) / Math.abs(template.amount);
  if (amountDeltaRatio > tolerance.amountToleranceRatio) return null;

  const day = dayOfMonthFromDate(transaction.date);
  if (day === null) return null;
  const dayOfMonthDelta = Math.abs(day - template.dayOfMonth);
  if (dayOfMonthDelta > tolerance.dayOfMonthTolerance) return null;

  return { template, amountDeltaRatio, dayOfMonthDelta };
}

/**
 * 複数テンプレートの中から、取引に最初に一致するものを返す（なければnull）。
 * findMatchingRule（userRules.ts）と同様に配列の先頭から順に評価する。
 */
export function findMatchingTemplate(
  transaction: Transaction,
  templates: RecurringTransactionTemplate[],
  tolerance: RecurringTemplateMatchTolerance = DEFAULT_MATCH_TOLERANCE
): RecurringTemplateMatchResult | null {
  for (const template of templates) {
    const match = matchTransactionToTemplate(transaction, template, tolerance);
    if (match) return match;
  }
  return null;
}

/** 取引1件分の、テンプレートとの一致提案（CSV取込・手入力レビュー画面での「このテンプレでは？」表示用） */
export interface RecurringTemplateSuggestion {
  transaction: Transaction;
  template: RecurringTransactionTemplate;
  amountDeltaRatio: number;
  dayOfMonthDelta: number;
}

/**
 * 新規に取り込まれた取引の一覧を、登録済みテンプレートと突き合わせる。
 * いずれかのテンプレートに一致した取引のみを結果に含める（一致しない取引は結果に含まれない）。
 */
export function suggestRecurringTemplateMatches(
  transactions: Transaction[],
  templates: RecurringTransactionTemplate[],
  tolerance: RecurringTemplateMatchTolerance = DEFAULT_MATCH_TOLERANCE
): RecurringTemplateSuggestion[] {
  const suggestions: RecurringTemplateSuggestion[] = [];
  for (const transaction of transactions) {
    const match = findMatchingTemplate(transaction, templates, tolerance);
    if (match) {
      suggestions.push({
        transaction,
        template: match.template,
        amountDeltaRatio: match.amountDeltaRatio,
        dayOfMonthDelta: match.dayOfMonthDelta,
      });
    }
  }
  return suggestions;
}

// --- 当月の期待リスト（記帳漏れ検出） --------------------------------------

// new Date("2026-02-30") はUTCで3/2へロールオーバーしてしまうため、月末日は
// 「翌月の0日目」というDateの丸め仕様を利用して算出する（journal/recurringEntries.ts と同じ考え方）。
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const YEAR_MONTH_FORMAT = /^\d{4}-\d{2}$/;

/**
 * 対象年月(YYYY-MM)とテンプレートの想定発生日から、その月における期待発生日(YYYY-MM-DD)を求める。
 * 想定発生日が対象月の日数を超える場合は月末日に丸める（例: 31日想定・2月は2/28または2/29）。
 * 対象年月の形式が不正な場合はnullを返す。
 */
export function resolveExpectedDate(template: RecurringTransactionTemplate, yearMonth: string): string | null {
  if (!YEAR_MONTH_FORMAT.test(yearMonth)) return null;
  const [year, month] = yearMonth.split("-").map(Number);
  const day = Math.min(template.dayOfMonth, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type ExpectedRecurringTransactionStatus = "recorded" | "missing" | "upcoming";

/** 1テンプレート・対象月分の「期待される定期取引」の状態 */
export interface ExpectedRecurringTransaction {
  template: RecurringTransactionTemplate;
  /** その月における期待発生日(YYYY-MM-DD)。月末を超える指定は月末日に丸め済み */
  expectedDate: string;
  /**
   * - "recorded": 対象月内に一致する取引が既に記帳されている
   * - "missing": 期待発生日を過ぎているのに、まだ一致する取引が記帳されていない（記帳漏れの疑い）
   * - "upcoming": 期待発生日がまだ先で、記帳されていなくても不自然ではない
   */
  status: ExpectedRecurringTransactionStatus;
  /** status が "recorded" の場合、一致した実際の取引 */
  matchedTransaction?: Transaction;
}

/**
 * 対象年月について、登録済みの有効なテンプレートごとに「記帳済みかどうか」を判定し、
 * 期待リストを返す。recordedTransactions は対象年月に限らず渡してよい（対象年月分のみに絞り込む）。
 *
 * asOfDate（基準日、YYYY-MM-DD）は呼び出し側から渡す。reminders/page.tsx 等と同様、
 * 「今日」の決定はUI層（実行時のブラウザ日時）に委ね、本モジュールは受け取った日付のみで判定する
 * 純粋関数として保つ。
 */
export function computeExpectedRecurringTransactions(
  templates: RecurringTransactionTemplate[],
  recordedTransactions: Transaction[],
  yearMonth: string,
  asOfDate: string,
  tolerance: RecurringTemplateMatchTolerance = DEFAULT_MATCH_TOLERANCE
): ExpectedRecurringTransaction[] {
  const monthTransactions = recordedTransactions.filter((tx) => tx.date.startsWith(`${yearMonth}-`));

  const results: ExpectedRecurringTransaction[] = [];
  for (const template of templates) {
    if (!template.active) continue;

    const expectedDate = resolveExpectedDate(template, yearMonth);
    if (expectedDate === null) continue;

    const matchedTransaction = monthTransactions.find(
      (tx) => matchTransactionToTemplate(tx, template, tolerance) !== null
    );

    const status: ExpectedRecurringTransactionStatus = matchedTransaction
      ? "recorded"
      : expectedDate <= asOfDate
        ? "missing"
        : "upcoming";

    results.push({ template, expectedDate, status, matchedTransaction });
  }

  return results;
}

/**
 * computeExpectedRecurringTransactions の結果のうち、記帳漏れの疑いがあるもの（status:"missing"）
 * だけを抽出するショートカット。
 */
export function getMissingRecurringTransactions(
  templates: RecurringTransactionTemplate[],
  recordedTransactions: Transaction[],
  yearMonth: string,
  asOfDate: string,
  tolerance: RecurringTemplateMatchTolerance = DEFAULT_MATCH_TOLERANCE
): ExpectedRecurringTransaction[] {
  return computeExpectedRecurringTransactions(templates, recordedTransactions, yearMonth, asOfDate, tolerance).filter(
    (item) => item.status === "missing"
  );
}
