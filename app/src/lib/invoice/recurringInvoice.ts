import {
  ClientInvoiceInput,
  ClientInvoiceLineItemInput,
  InvoiceTaxRate,
  formatInvoiceNumber,
} from "./clientInvoice";

// ------------------------------------------------------------------
// 定期請求書（サブスクリプション/顧問料クライアント向け）のテンプレート化ロジック。
//
// app/src/lib/journal/recurringEntries.ts が「固定費・定期取引」の仕訳を対象年月ごとに
// 生成するのと同じ考え方で、顧問料・月額サブスクリプションなど毎月/四半期ごとに同じ内容の
// 請求書を発行するクライアント向けのテンプレートを管理し、指定した期間内に発生する
// 請求書発行日（インスタンス）を計算する純粋関数群を提供する。
//
// これはあくまで請求書データの下書き作成を補助するツールであり、税務代理・
// 個別具体の税務相談は行わない（docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
//
// 日付計算の方針（journal/recurringEntries.ts と同一の考え方）:
// - 「日」はテンプレートの開始日（startDate）の日を基準に、対象月へ当てはめる。
//   対象月の日数を超える場合は、その月の末日に丸める（例: 開始日が1/31の場合、
//   2月は2/28（うるう年は2/29）、4月は4/30になる）。一度月末に丸めても、翌月以降は
//   再びその月の末日／startDate.dayのうち小さい方を毎回計算し直す（「30日で固定されたまま」
//   にはならない。例えば1/31開始なら 2/28 → 3/31 → 4/30 → 5/31 と、月ごとに正しい末日/開始日に戻る）。
// - 四半期（quarterly）は3か月ごとに同じ「日」基準ロジックを適用する。
// - new Date("2026-02-30") のようなJSのロールオーバー（3/2として解釈される）に依存せず、
//   年・月・日を分解して実在日かどうかを個別に検証する（entries.ts 等と同じ考え方）。
// ------------------------------------------------------------------

export type RecurringInvoiceInterval = "monthly" | "quarterly";

export const RECURRING_INVOICE_INTERVALS: RecurringInvoiceInterval[] = ["monthly", "quarterly"];

export const RECURRING_INVOICE_INTERVAL_LABELS: Record<RecurringInvoiceInterval, string> = {
  monthly: "毎月",
  quarterly: "四半期ごと（3か月ごと）",
};

/** 頻度ごとの「何か月おきか」。四半期は3か月おき */
const RECURRING_INVOICE_INTERVAL_MONTH_STEP: Record<RecurringInvoiceInterval, number> = {
  monthly: 1,
  quarterly: 3,
};

/** 定期請求書テンプレート。1明細（品目1件・数量1）のシンプルな定期請求を想定する */
export interface RecurringInvoiceTemplate {
  id: string;
  /** 請求先（取引先）名称 */
  clientName: string;
  /** 品目・役務内容（例: 「顧問料（月額）」） */
  description: string;
  /** 単価（税抜、円）。数量は常に1として扱う */
  amount: number;
  taxRate: InvoiceTaxRate;
  interval: RecurringInvoiceInterval;
  /** 発生開始日。YYYY-MM-DD。「日」が各回の発生日の基準になる（月末ロールオーバーあり） */
  startDate: string;
  /** 発生終了日（この日を含めて、以降は発生しない）。省略時は無期限に発生し続ける */
  endDate?: string | null;
  note?: string;
  /** falseの場合、一覧には残すが発生日計算・生成の対象から除外する（契約終了済みクライアント等） */
  active: boolean;
}

/** テンプレート追加フォームの入力値。amountはユーザー入力の生文字列のまま保持し、確定時に数値へ変換する */
export interface RecurringInvoiceTemplateDraft {
  clientName: string;
  description: string;
  amount: string;
  taxRate: InvoiceTaxRate;
  interval: RecurringInvoiceInterval;
  startDate: string;
  endDate?: string;
  note?: string;
}

export const EMPTY_RECURRING_INVOICE_TEMPLATE_DRAFT: RecurringInvoiceTemplateDraft = {
  clientName: "",
  description: "",
  amount: "",
  taxRate: 10,
  interval: "monthly",
  startDate: "",
  endDate: "",
  note: "",
};

export type RecurringInvoiceTemplateFieldErrors = Partial<
  Record<"clientName" | "description" | "amount" | "startDate" | "endDate", string>
>;

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_FORMAT = /^-?\d+(\.\d+)?$/;

// new Date("2026-02-30") はUTCで3/2へロールオーバーしてしまい NaN にならないため、
// 各要素を分解して実在する日付かどうかを個別に検証する（journal/recurringEntries.ts と同じ考え方）。
function isValidCalendarDate(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidDateString(date: string | null | undefined): date is string {
  return typeof date === "string" && DATE_FORMAT.test(date) && isValidCalendarDate(date);
}

function daysInMonth(year: number, month: number): number {
  // month は1-12。「翌月の0日目」= 当月末日、というDateの丸め仕様を利用する（うるう年も自動考慮される）
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** フォーム入力のバリデーション。エラーがなければ空オブジェクトを返す */
export function validateRecurringInvoiceTemplateDraft(
  draft: RecurringInvoiceTemplateDraft
): RecurringInvoiceTemplateFieldErrors {
  const errors: RecurringInvoiceTemplateFieldErrors = {};

  if (isBlank(draft.clientName)) {
    errors.clientName = "請求先（取引先）名称を入力してください";
  }

  if (isBlank(draft.description)) {
    errors.description = "品目・内容を入力してください";
  }

  const amount = draft.amount.trim();
  if (!amount) {
    errors.amount = "金額を入力してください";
  } else if (!NUMERIC_FORMAT.test(amount)) {
    errors.amount = "金額は数値で入力してください";
  } else if (Number(amount) <= 0) {
    errors.amount = "金額は0より大きい数値で入力してください";
  }

  const startDate = draft.startDate.trim();
  if (!startDate) {
    errors.startDate = "開始日を入力してください";
  } else if (!isValidDateString(startDate)) {
    errors.startDate = "開始日はYYYY-MM-DD形式で入力してください";
  }

  const endDate = draft.endDate?.trim();
  if (endDate) {
    if (!isValidDateString(endDate)) {
      errors.endDate = "終了日はYYYY-MM-DD形式で入力してください";
    } else if (!errors.startDate && startDate && endDate < startDate) {
      errors.endDate = "終了日は開始日以降の日付にしてください";
    }
  }

  return errors;
}

export function hasRecurringInvoiceTemplateErrors(errors: RecurringInvoiceTemplateFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-invoice-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * draftをRecurringInvoiceTemplateへ変換する。
 * 呼び出し側は事前に validateRecurringInvoiceTemplateDraft でエラーがないことを確認しておくこと。
 */
export function draftToRecurringInvoiceTemplate(
  draft: RecurringInvoiceTemplateDraft,
  id: string = generateTemplateId()
): RecurringInvoiceTemplate {
  const endDate = draft.endDate?.trim();
  return {
    id,
    clientName: draft.clientName.trim(),
    description: draft.description.trim(),
    amount: Number(draft.amount.trim()),
    taxRate: draft.taxRate,
    interval: draft.interval,
    startDate: draft.startDate.trim(),
    endDate: endDate || undefined,
    note: draft.note?.trim() || undefined,
    active: true,
  };
}

export function addRecurringInvoiceTemplate(
  templates: RecurringInvoiceTemplate[],
  draft: RecurringInvoiceTemplateDraft
): RecurringInvoiceTemplate[] {
  return [...templates, draftToRecurringInvoiceTemplate(draft)];
}

export function removeRecurringInvoiceTemplate(
  templates: RecurringInvoiceTemplate[],
  id: string
): RecurringInvoiceTemplate[] {
  return templates.filter((template) => template.id !== id);
}

/** テンプレートの有効/無効を切り替える（削除せず契約終了などで一時停止したいケース向け） */
export function toggleRecurringInvoiceTemplateActive(
  templates: RecurringInvoiceTemplate[],
  id: string
): RecurringInvoiceTemplate[] {
  return templates.map((template) => (template.id === id ? { ...template, active: !template.active } : template));
}

/**
 * テンプレートのk回目（0始まり、0回目=開始日が属する回）の発生日（請求書発行日）を計算する。
 * - 月インデックス（year*12 + (month-1)）で「開始月からmonthStep×k か月後」の年月を求め、
 *   その月に開始日の「日」を当てはめる。対象月の日数を超える場合は月末日に丸める
 *   （例: 開始日が1/31・monthly の場合、k=0→1/31, k=1→2/28（平年）/2/29（うるう年）,
 *   k=2→3/31, k=3→4/30 と、月が進むたびにその月の末日を計算し直す）。
 * - startDateが不正な形式・実在しない日付の場合は null を返す。
 */
function resolveOccurrenceDate(template: RecurringInvoiceTemplate, sequenceIndex: number): string | null {
  if (!isValidDateString(template.startDate)) return null;
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) return null;

  const start = parseDateParts(template.startDate);
  const monthStep = RECURRING_INVOICE_INTERVAL_MONTH_STEP[template.interval];
  const startMonthIndex = start.year * 12 + (start.month - 1);
  const occMonthIndex = startMonthIndex + sequenceIndex * monthStep;
  const occYear = Math.floor(occMonthIndex / 12);
  const occMonth = (occMonthIndex % 12) + 1;
  const occDay = Math.min(start.day, daysInMonth(occYear, occMonth));

  return formatDate(occYear, occMonth, occDay);
}

/** 1回分の定期請求書インスタンス（発生日と、何回目の発生かを表すsequenceIndex） */
export interface RecurringInvoiceOccurrence {
  templateId: string;
  /** 0始まりの発生回次（開始日が属する回が0） */
  sequenceIndex: number;
  /** この回の請求書発行日（末日ロールオーバー考慮済み） */
  issueDate: string;
}

/** 発生日を計算する対象期間。start・endともに「この日を含む」（両端inclusive） */
export interface RecurringInvoiceDateRange {
  /** 範囲開始日（YYYY-MM-DD、この日を含む） */
  start: string;
  /** 範囲終了日（YYYY-MM-DD、この日を含む） */
  end: string;
}

/**
 * テンプレート1件について、指定した期間 [range.start, range.end]（両端を含む、inclusive）内に
 * 発生する請求書発行日を、開始日からの回次（sequenceIndex）とあわせて古い順に返す。
 *
 * 期間や日付が不正な場合、テンプレートが無効化（active: false）されている場合は空配列を返す
 * （例外は投げない）。
 *
 * 打ち切り条件:
 * - range.end の属する月を超えて発生日を計算する必要はない（発生日は月が進むごとに単調増加するため、
 *   月インデックスがrange.endの月インデックスを超えた時点で以降の回はすべてrange.endより後になる）。
 *   これにより、endDateが無期限（省略）のテンプレートでも無限ループにならず、
 *   range.start〜range.endの月数に比例した計算量で完了する。
 * - endDateが設定されている場合、発生日がendDateを超えた時点で打ち切る（以降の回は単調増加のため
 *   endDateを超え続ける）。
 */
export function computeRecurringInvoiceOccurrences(
  template: RecurringInvoiceTemplate,
  range: RecurringInvoiceDateRange
): RecurringInvoiceOccurrence[] {
  if (!template.active) return [];
  if (!isValidDateString(range.start) || !isValidDateString(range.end)) return [];
  if (range.start > range.end) return [];
  if (!isValidDateString(template.startDate)) return [];

  const start = parseDateParts(template.startDate);
  const startMonthIndex = start.year * 12 + (start.month - 1);
  const monthStep = RECURRING_INVOICE_INTERVAL_MONTH_STEP[template.interval];

  const rangeEndParts = parseDateParts(range.end);
  const rangeEndMonthIndex = rangeEndParts.year * 12 + (rangeEndParts.month - 1);

  // 発生日がrange.endの月インデックスを超えない最大の回次。負になる場合（テンプレート開始が
  // range.endより後）はループが一度も実行されない。
  const maxSequenceIndex = Math.floor((rangeEndMonthIndex - startMonthIndex) / monthStep);

  const validEndDate = isValidDateString(template.endDate ?? undefined) ? (template.endDate as string) : null;

  const occurrences: RecurringInvoiceOccurrence[] = [];
  for (let sequenceIndex = 0; sequenceIndex <= maxSequenceIndex; sequenceIndex++) {
    const date = resolveOccurrenceDate(template, sequenceIndex);
    if (!date) continue;

    if (validEndDate && date > validEndDate) break; // 以降の回も単調増加でendDateを超え続けるため打ち切る

    if (date < range.start || date > range.end) continue;

    occurrences.push({ templateId: template.id, sequenceIndex, issueDate: date });
  }

  return occurrences;
}

/** 複数テンプレートについて、指定期間内の発生インスタンスをまとめて計算し、発行日の昇順（同日ならテンプレート登録順）で返す */
export function computeRecurringInvoiceOccurrencesForTemplates(
  templates: RecurringInvoiceTemplate[],
  range: RecurringInvoiceDateRange
): RecurringInvoiceOccurrence[] {
  const all = templates.flatMap((template) => computeRecurringInvoiceOccurrences(template, range));
  return all.sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : 0));
}

/** テンプレートID + 発行日から決定的な発生インスタンスIDを生成する。重複生成防止の判定キー・UIのkeyとして使う */
export function buildRecurringInvoiceOccurrenceId(templateId: string, issueDate: string): string {
  return `recurring-invoice-${templateId}-${issueDate}`;
}

/**
 * 定期請求書テンプレートの1回分の発生インスタンスから、clientInvoice.ts の buildClientInvoice に
 * そのまま渡せる ClientInvoiceInput を組み立てる（数量1・単価テンプレートのamountの1明細請求書）。
 * 発行者情報（issuerName等）と請求書番号の採番用シーケンスは呼び出し側（UI）が管理する想定。
 */
export function buildRecurringInvoiceInput(
  template: RecurringInvoiceTemplate,
  occurrence: RecurringInvoiceOccurrence,
  options: { issuerName: string; issuerRegistrationNumber?: string | null; invoiceSequence: number }
): ClientInvoiceInput {
  const lineItems: ClientInvoiceLineItemInput[] = [
    {
      description: template.description,
      quantity: 1,
      unitPrice: template.amount,
      taxRate: template.taxRate,
    },
  ];

  return {
    invoiceNumber: formatInvoiceNumber(occurrence.issueDate, options.invoiceSequence),
    issuerName: options.issuerName,
    issuerRegistrationNumber: options.issuerRegistrationNumber ?? null,
    issueDate: occurrence.issueDate,
    transactionDate: occurrence.issueDate,
    clientName: template.clientName,
    lineItems,
  };
}
