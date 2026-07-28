// 固定費・定期取引のテンプレート化ロジック。
// 家賃・サブスクリプション・顧問料など毎月/毎年発生する取引を一度テンプレートとして登録しておき、
// 対象年月を指定してワンクリックで仕訳エントリ（journal/entries.ts の CategorizedTransaction と
// 同じ型）を自動生成できるようにする。
// 「AIによる仕訳の自動確定率を最大化・人間のレビューは例外処理のみ」という製品方針に沿い、
// テンプレートから確定的に生成されたエントリは confidence=1 でそのまま確定仕訳として扱う。

import { CategorizedTransaction } from "../categorize/engine";
import { TaxCategory } from "../categorize/dictionary";

export type RecurringFrequency = "monthly" | "yearly";

export const RECURRING_FREQUENCIES: RecurringFrequency[] = ["monthly", "yearly"];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: "毎月",
  yearly: "毎年",
};

/** 定期取引テンプレート。amountは収入は正、支出は負の数値 */
export interface RecurringEntryTemplate {
  id: string;
  description: string;
  amount: number;
  account: string;
  taxCategory: TaxCategory;
  frequency: RecurringFrequency;
  /** 発生開始日。YYYY-MM-DD。毎月なら「日」、毎年なら「月日」が発生日の基準になる */
  startDate: string;
  /** 発生終了日（この日を含む）。省略時は無期限に発生し続ける */
  endDate?: string;
  note?: string;
  /** falseの場合、一覧には残すが自動生成の対象から除外する（解約済みサブスク等） */
  active: boolean;
}

/** テンプレート追加フォームの入力値。amountはユーザー入力の生文字列のまま保持し、確定時に数値へ変換する */
export interface RecurringTemplateDraft {
  description: string;
  amount: string;
  account: string;
  taxCategory: TaxCategory;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  note?: string;
}

export type RecurringTemplateFieldErrors = Partial<
  Record<"description" | "amount" | "account" | "taxCategory" | "startDate" | "endDate", string>
>;

export const EMPTY_RECURRING_TEMPLATE_DRAFT: RecurringTemplateDraft = {
  description: "",
  amount: "",
  account: "",
  taxCategory: "課税仕入10%",
  frequency: "monthly",
  startDate: "",
  endDate: "",
  note: "",
};

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_FORMAT = /^\d{4}-\d{2}$/;
const NUMERIC_FORMAT = /^-?\d+(\.\d+)?$/;

// new Date("2026-02-30") はUTCで3/2へロールオーバーしてしまい NaN にならないため、
// 各要素を分解して実在する日付かどうかを個別に検証する（entries.ts の isValidCalendarDate と同じ考え方）。
function isValidCalendarDate(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** フォーム入力のバリデーション。エラーがなければ空オブジェクトを返す */
export function validateRecurringTemplateDraft(draft: RecurringTemplateDraft): RecurringTemplateFieldErrors {
  const errors: RecurringTemplateFieldErrors = {};

  if (!draft.description.trim()) {
    errors.description = "摘要を入力してください";
  }

  const amount = draft.amount.trim();
  if (!amount) {
    errors.amount = "金額を入力してください";
  } else if (!NUMERIC_FORMAT.test(amount)) {
    errors.amount = "金額は数値で入力してください";
  } else if (Number(amount) === 0) {
    errors.amount = "金額は0以外の数値で入力してください";
  }

  if (!draft.account.trim()) {
    errors.account = "勘定科目を入力してください";
  }

  const startDate = draft.startDate.trim();
  if (!startDate) {
    errors.startDate = "開始日を入力してください";
  } else if (!DATE_FORMAT.test(startDate) || !isValidCalendarDate(startDate)) {
    errors.startDate = "開始日はYYYY-MM-DD形式で入力してください";
  }

  const endDate = draft.endDate?.trim();
  if (endDate) {
    if (!DATE_FORMAT.test(endDate) || !isValidCalendarDate(endDate)) {
      errors.endDate = "終了日はYYYY-MM-DD形式で入力してください";
    } else if (!errors.startDate && startDate && endDate < startDate) {
      errors.endDate = "終了日は開始日以降の日付にしてください";
    }
  }

  return errors;
}

export function hasRecurringTemplateErrors(errors: RecurringTemplateFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * draftをRecurringEntryTemplateへ変換する。
 * 呼び出し側は事前に validateRecurringTemplateDraft でエラーがないことを確認しておくこと。
 */
export function draftToRecurringTemplate(
  draft: RecurringTemplateDraft,
  id: string = generateTemplateId()
): RecurringEntryTemplate {
  const endDate = draft.endDate?.trim();
  return {
    id,
    description: draft.description.trim(),
    amount: Number(draft.amount.trim()),
    account: draft.account.trim(),
    taxCategory: draft.taxCategory,
    frequency: draft.frequency,
    startDate: draft.startDate.trim(),
    endDate: endDate || undefined,
    note: draft.note?.trim() || undefined,
    active: true,
  };
}

export function addRecurringTemplate(
  templates: RecurringEntryTemplate[],
  draft: RecurringTemplateDraft
): RecurringEntryTemplate[] {
  return [...templates, draftToRecurringTemplate(draft)];
}

export function removeRecurringTemplate(templates: RecurringEntryTemplate[], id: string): RecurringEntryTemplate[] {
  return templates.filter((template) => template.id !== id);
}

/** テンプレートの有効/無効を切り替える（削除せず一時停止したいケース向け） */
export function toggleRecurringTemplateActive(
  templates: RecurringEntryTemplate[],
  id: string
): RecurringEntryTemplate[] {
  return templates.map((template) => (template.id === id ? { ...template, active: !template.active } : template));
}

function daysInMonth(year: number, month: number): number {
  // month は1-12。「翌月の0日目」= 当月末日、というDateの丸め仕様を利用する
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * テンプレートが対象年月(YYYY-MM)に発生日を持つかどうかを判定し、発生日を返す。
 * - 毎月頻度: 開始日の「日」を対象月に当てはめる。対象月の日数を超える場合は月末日に丸める
 *   （例: 開始日が1/31の場合、2月は2/28（うるう年は2/29）、4月は4/30になる）。
 * - 毎年頻度: 開始日と同じ「月」のときだけ発生する。うるう年の2/29が開始日の場合、
 *   平年では2/28に丸める。
 * - 開始月より前、または終了日より後の場合は null（対象外）を返す。
 */
export function resolveRecurringEntryDate(template: RecurringEntryTemplate, yearMonth: string): string | null {
  if (!YEAR_MONTH_FORMAT.test(yearMonth)) return null;
  if (!DATE_FORMAT.test(template.startDate) || !isValidCalendarDate(template.startDate)) return null;

  const { year: targetYear, month: targetMonth } = (() => {
    const [year, month] = yearMonth.split("-").map(Number);
    return { year, month };
  })();
  const start = parseDateParts(template.startDate);
  const startYearMonth = formatDate(start.year, start.month, 1).slice(0, 7);

  if (yearMonth < startYearMonth) return null; // 開始月より前は対象外
  if (template.frequency === "yearly" && targetMonth !== start.month) return null;

  const clampedDay = Math.min(start.day, daysInMonth(targetYear, targetMonth));
  const date = formatDate(targetYear, targetMonth, clampedDay);

  if (template.endDate && DATE_FORMAT.test(template.endDate) && date > template.endDate) {
    return null; // 終了日より後は対象外
  }

  return date;
}

/** テンプレートID + 対象年月から決定的なエントリIDを生成する。重複生成防止の判定キーとしても使う */
export function buildRecurringEntryId(templateId: string, yearMonth: string): string {
  return `recurring-${templateId}-${yearMonth}`;
}

/** 指定した対象年月について、既存エントリの中に同一テンプレートの生成済みエントリが既にあるかどうか */
export function isAlreadyGeneratedForMonth(
  entries: CategorizedTransaction[],
  templateId: string,
  yearMonth: string
): boolean {
  const id = buildRecurringEntryId(templateId, yearMonth);
  return entries.some((entry) => entry.id === id);
}

/**
 * 1テンプレート分の仕訳エントリを生成する。
 * 対象外（頻度不一致・期間外）の場合は null を返す。非アクティブなテンプレートも呼び出し側で
 * 事前に除外することを想定しているが、念のためここでも除外する。
 */
export function generateEntryFromTemplate(
  template: RecurringEntryTemplate,
  yearMonth: string
): CategorizedTransaction | null {
  if (!template.active) return null;

  const date = resolveRecurringEntryDate(template, yearMonth);
  if (!date) return null;

  return {
    id: buildRecurringEntryId(template.id, yearMonth),
    date,
    description: template.description,
    amount: template.amount,
    account: template.account,
    taxCategory: template.taxCategory,
    confidence: 1,
    source: "manual",
    note: template.note,
  };
}

export type RecurringGenerationSkipReason = "inactive" | "duplicate" | "out-of-range";

export interface RecurringGenerationSkip {
  templateId: string;
  reason: RecurringGenerationSkipReason;
}

export interface RecurringGenerationResult {
  generated: CategorizedTransaction[];
  skipped: RecurringGenerationSkip[];
}

/**
 * 複数テンプレートについて対象年月分の仕訳を一括生成する。
 * - 非アクティブなテンプレートはスキップする（reason: "inactive"）。
 * - 既に同一テンプレート・同一年月のエントリが existingEntries に存在する場合はスキップする
 *   （reason: "duplicate"）。テンプレートID+年月をユニークキーとして判定する。
 * - 頻度・開始日・終了日の条件を満たさない場合はスキップする（reason: "out-of-range"）。
 */
export function generateRecurringEntriesForMonth(
  templates: RecurringEntryTemplate[],
  yearMonth: string,
  existingEntries: CategorizedTransaction[]
): RecurringGenerationResult {
  const generated: CategorizedTransaction[] = [];
  const skipped: RecurringGenerationSkip[] = [];

  for (const template of templates) {
    if (!template.active) {
      skipped.push({ templateId: template.id, reason: "inactive" });
      continue;
    }

    if (isAlreadyGeneratedForMonth(existingEntries, template.id, yearMonth)) {
      skipped.push({ templateId: template.id, reason: "duplicate" });
      continue;
    }

    const entry = generateEntryFromTemplate(template, yearMonth);
    if (!entry) {
      skipped.push({ templateId: template.id, reason: "out-of-range" });
      continue;
    }

    generated.push(entry);
  }

  return { generated, skipped };
}
