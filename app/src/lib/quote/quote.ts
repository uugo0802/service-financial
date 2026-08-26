import { validateInvoiceRegistrationNumber } from "../categorize/invoiceRegistrationValidator";
import type { ClientInvoiceInput, ClientInvoiceLineItemInput, InvoiceTaxRate } from "../invoice/clientInvoice";
import { PrintableField, selectPrintVisibleFields } from "../export/printLayout";

// ------------------------------------------------------------------
// フリーランス・マイクロ法人が「自分の顧客」に対して発行する見積書（quotation/estimate）の
// 下書きを組み立てる純粋関数群。
//
// これはあくまで見積書データの下書き作成を補助するツールであり、税務代理・
// 個別具体の税務相談は行わない（docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
//
// src/lib/invoice/clientInvoice.ts（請求書）の明細行・税率区分・端数処理の考え方を
// そのまま踏襲する。見積書は「取引先に対する発注前の価格提示」であり、請求書と異なり
// 支払期日（dueDate）の代わりに「有効期限（validUntil = issueDate + validityPeriodDays）」を持つ。
// 見積書が承認（accepted）された後に、そのまま請求書（ClientInvoice）へ変換できるよう、
// 明細行の型は ClientInvoiceLineItemInput とフィールドレベルで完全互換にしてある
// （import type のみで clientInvoice.ts 自体は一切変更しない）。
//
// 端数処理: clientInvoice.ts と同様、「1つの見積書につき、税率ごとに1回」だけ切り捨てる
// （明細行ごとには丸めない）。
// ------------------------------------------------------------------

export type QuoteTaxRate = InvoiceTaxRate;

export const QUOTE_TAX_RATES: QuoteTaxRate[] = [10, 8, 0];

export const QUOTE_TAX_RATE_LABELS: Record<QuoteTaxRate, string> = {
  10: "標準税率10%",
  8: "軽減税率8%",
  0: "非課税・不課税・免税(0%)",
};

/** 見積書のステータス。時系列で draft → sent → accepted → converted_to_invoice と進むのが典型的な流れ。 */
export type QuoteStatus = "draft" | "sent" | "accepted" | "expired" | "converted_to_invoice";

export const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "expired", "converted_to_invoice"];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "下書き",
  sent: "送付済み",
  accepted: "承認済み（先方が合意）",
  expired: "有効期限切れ",
  converted_to_invoice: "請求書に変換済み",
};

/** 有効期限（validityPeriodDays）が未入力・不正な場合に使う既定日数（見積書の慣行として一般的な30日）。 */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

export interface QuoteLineItemInput {
  /** 品目・役務内容 */
  description: string;
  /** 数量（時間単位など小数も許容） */
  quantity: number;
  /** 単価（税抜、円） */
  unitPrice: number;
  /** 適用税率 */
  taxRate: QuoteTaxRate;
}

export interface QuoteInput {
  /** 見積書番号。省略時は formatQuoteNumber 等で別途採番する */
  quoteNumber?: string;
  /** 発行者（見積もる側＝自分）の氏名または屋号・法人名 */
  issuerName: string;
  /** 発行者の適格請求書発行事業者登録番号（"T"+13桁）。未登録の場合は未入力でよい（見積書自体は発行できる） */
  issuerRegistrationNumber?: string | null;
  /** 見積書発行日 */
  issueDate: string;
  /**
   * 有効期限の日数（発行日からの経過日数、この日数が過ぎると失効）。
   * 未入力・0以下・非数値の場合は DEFAULT_QUOTE_VALIDITY_DAYS（30日）を用いる。
   */
  validityPeriodDays?: number;
  /** 見積先（提示を受ける者）の氏名または名称 */
  clientName: string;
  lineItems: QuoteLineItemInput[];
  /** 見積書のステータス。省略時は "draft"（下書き） */
  status?: QuoteStatus;
  /** 備考（納期・支払条件など自由記述、任意） */
  note?: string | null;
}

export interface QuoteLineItemComputed extends QuoteLineItemInput {
  /** 税抜金額（数量×単価、円未満切り捨て） */
  lineAmountExcludingTax: number;
}

export interface QuoteTaxRateSubtotal {
  taxRate: QuoteTaxRate;
  /** 当該税率の税抜合計金額 */
  taxableBase: number;
  /** 当該税率の消費税額等（税抜合計に対して1回だけ端数処理） */
  taxAmount: number;
  /** 当該税率の税込合計（taxableBase + taxAmount） */
  taxInclusiveTotal: number;
}

export interface Quote {
  quoteNumber: string;
  issuerName: string;
  issuerRegistrationNumber: string | null;
  issueDate: string;
  /** 有効期限の日数（発行日からの経過日数） */
  validityPeriodDays: number;
  /** 有効期限日（issueDate + validityPeriodDays）。issueDateが不正な場合は null */
  validUntil: string | null;
  clientName: string;
  lineItems: QuoteLineItemComputed[];
  /** 税率ごとの内訳（10%→8%→0%の順） */
  taxRateSubtotals: QuoteTaxRateSubtotal[];
  /** 税抜合計（全税率合計） */
  subtotalExcludingTax: number;
  /** 消費税額等の合計（全税率合計） */
  totalTax: number;
  /** 見積金額合計（税込） */
  grandTotal: number;
  status: QuoteStatus;
  note: string | null;
}

export interface BuildQuoteResult {
  quote: Quote;
  /** 記載事項の不足など、対応が必要な問題 */
  errors: string[];
  /** ブロックはしないが利用者に伝えるべき注意事項（登録番号未入力など） */
  warnings: string[];
  /** errors が0件かどうか */
  isValid: boolean;
}

function roundDownToYen(n: number): number {
  return Math.floor(n);
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function isValidIsoDate(value: string | null | undefined): boolean {
  const parsed = parseIsoDate(value);
  if (!parsed) return false;
  // new Date(Date.UTC(...))のロールオーバー（例: 2月30日→3月2日）を利用して、実在する日付かどうかを検証する
  // （journal/recurringEntries.ts, invoice/recurringInvoice.ts と同じ考え方）。
  const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  return d.getUTCFullYear() === parsed.y && d.getUTCMonth() === parsed.m - 1 && d.getUTCDate() === parsed.d;
}

/**
 * ISO日付文字列に日数を加算する（タイムゾーンに依存しないよう、UTC基準のDateで計算する）。
 * dateIsoが不正な形式・存在しない日付の場合、またはdaysが整数でない場合は null を返す。
 */
export function addDaysToIsoDate(dateIso: string, days: number): string | null {
  const parsed = parseIsoDate(dateIso);
  if (!parsed || !isValidIsoDate(dateIso)) return null;
  if (!Number.isFinite(days) || !Number.isInteger(days)) return null;

  const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  d.setUTCDate(d.getUTCDate() + days);

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 有効期限の日数を正規化する。未入力・0以下・非数値・非整数の場合は既定値（30日）にフォールバックする。
 */
function normalizeValidityPeriodDays(days: number | undefined): number {
  if (!Number.isFinite(days) || days === undefined || days <= 0) {
    return DEFAULT_QUOTE_VALIDITY_DAYS;
  }
  return Math.floor(days);
}

/**
 * 見積書番号を組み立てる（例: issueDate "2026-07-29", sequence 3 → "EST-20260729-0003"）。
 * サーバー側の連番管理は行わない、純粋なフォーマット関数（formatInvoiceNumberと同じ考え方）。
 */
export function formatQuoteNumber(issueDate: string, sequence: number): string {
  const compactDate = /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate.replaceAll("-", "") : "00000000";
  const safeSequence = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `EST-${compactDate}-${String(safeSequence).padStart(4, "0")}`;
}

/**
 * 明細行1件を税抜金額に変換する（数量×単価、円未満切り捨て）。
 */
function computeLineAmount(item: QuoteLineItemInput): number {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return roundDownToYen(quantity * unitPrice);
}

/**
 * 入力内容を検証し、エラー（必須事項の不足）と警告（登録番号未入力など）を分けて返す。
 * 例外は投げない — 呼び出し側（UI）が errors を見て送信可否を判断する。
 */
export function validateQuoteInput(input: QuoteInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isBlank(input.issuerName)) {
    errors.push("発行者名（あなたの氏名または屋号・法人名）を入力してください。");
  }
  if (isBlank(input.clientName)) {
    errors.push("見積先（取引先）の名称を入力してください。");
  }
  if (isBlank(input.issueDate)) {
    errors.push("見積書発行日を入力してください。");
  } else if (!isValidIsoDate(input.issueDate)) {
    errors.push("見積書発行日はYYYY-MM-DD形式の実在する日付を入力してください。");
  }

  if (
    input.validityPeriodDays !== undefined &&
    Number.isFinite(input.validityPeriodDays) &&
    input.validityPeriodDays <= 0
  ) {
    warnings.push(
      `有効期限の日数（${input.validityPeriodDays}日）が0以下のため、既定の${DEFAULT_QUOTE_VALIDITY_DAYS}日として扱います。`
    );
  }

  if (!input.lineItems || input.lineItems.length === 0) {
    errors.push("明細行が1件もありません。品目を1件以上追加してください。");
  } else {
    input.lineItems.forEach((item, index) => {
      const rowLabel = `明細${index + 1}行目`;
      if (isBlank(item.description)) {
        errors.push(`${rowLabel}: 品目・内容を入力してください。`);
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        errors.push(`${rowLabel}: 数量は0より大きい数値で入力してください。`);
      }
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        errors.push(`${rowLabel}: 単価は0以上の数値で入力してください。`);
      }
      if (![0, 8, 10].includes(item.taxRate)) {
        errors.push(`${rowLabel}: 税率は0%・8%・10%のいずれかを指定してください。`);
      }
    });
  }

  // 登録番号は未入力でも見積書作成自体はブロックしない（見積の時点では免税事業者・未登録事業者でもよい）。
  if (isBlank(input.issuerRegistrationNumber)) {
    warnings.push(
      "適格請求書発行事業者の登録番号が未入力です。この見積書から請求書を作成する際、登録番号が未入力のままだと区分記載請求書としての発行になります（登録事業者でない場合はそのままで問題ありません）。"
    );
  } else {
    const validation = validateInvoiceRegistrationNumber(input.issuerRegistrationNumber!);
    if (!validation.valid) {
      warnings.push(
        `入力された登録番号の形式に誤りがある可能性があります: ${validation.message} 登録番号をご確認ください。`
      );
    }
  }

  return { errors, warnings };
}

/**
 * 見積書データを組み立てる。必須項目が不足していてもエラーは投げず、
 * 分かっている範囲でベストエフォートに計算した quote と、errors/warnings を返す
 * （UIでプレビューしながらエラーを解消していける想定）。
 */
export function buildQuote(input: QuoteInput): BuildQuoteResult {
  const { errors, warnings } = validateQuoteInput(input);

  const lineItems: QuoteLineItemComputed[] = (input.lineItems ?? []).map((item) => ({
    ...item,
    lineAmountExcludingTax: computeLineAmount(item),
  }));

  // 税率ごとに明細を合計してから1回だけ端数処理する（明細行ごとには丸めない）。clientInvoice.tsと同一方針。
  const nonZeroSubtotals: QuoteTaxRateSubtotal[] = QUOTE_TAX_RATES.map((rate) => {
    const taxableBase = lineItems
      .filter((item) => item.taxRate === rate)
      .reduce((sum, item) => sum + item.lineAmountExcludingTax, 0);
    const taxAmount = rate === 0 ? 0 : roundDownToYen((taxableBase * rate) / 100);
    return {
      taxRate: rate,
      taxableBase,
      taxAmount,
      taxInclusiveTotal: taxableBase + taxAmount,
    };
  }).filter((s) => s.taxableBase !== 0);

  const subtotalExcludingTax = nonZeroSubtotals.reduce((sum, s) => sum + s.taxableBase, 0);
  const totalTax = nonZeroSubtotals.reduce((sum, s) => sum + s.taxAmount, 0);

  const registrationNumberInput = input.issuerRegistrationNumber ?? null;
  const registrationValidation = isBlank(registrationNumberInput)
    ? null
    : validateInvoiceRegistrationNumber(registrationNumberInput!);

  const validityPeriodDays = normalizeValidityPeriodDays(input.validityPeriodDays);
  const validUntil = isValidIsoDate(input.issueDate) ? addDaysToIsoDate(input.issueDate, validityPeriodDays) : null;

  const quote: Quote = {
    quoteNumber: input.quoteNumber?.trim() || formatQuoteNumber(input.issueDate, 1),
    issuerName: input.issuerName?.trim() ?? "",
    issuerRegistrationNumber: isBlank(registrationNumberInput) ? null : registrationValidation!.normalized ?? registrationNumberInput!.trim(),
    issueDate: input.issueDate ?? "",
    validityPeriodDays,
    validUntil,
    clientName: input.clientName?.trim() ?? "",
    lineItems,
    taxRateSubtotals: nonZeroSubtotals,
    subtotalExcludingTax,
    totalTax,
    grandTotal: subtotalExcludingTax + totalTax,
    status: input.status ?? "draft",
    note: isBlank(input.note) ? null : input.note!.trim(),
  };

  return {
    quote,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

/**
 * 指定した基準日（asOfDateIso、省略時は判定不能として false）時点で、見積書が有効期限切れかどうかを判定する。
 * validUntilが未算出（null）の場合は判定できないため false を返す（未確定の見積書を誤って失効扱いしない）。
 * validUntil当日はまだ有効（inclusive）とし、その翌日以降を期限切れとする。
 */
export function isQuoteExpired(quote: Pick<Quote, "validUntil">, asOfDateIso: string): boolean {
  if (!quote.validUntil || !isValidIsoDate(asOfDateIso)) return false;
  return asOfDateIso > quote.validUntil;
}

/**
 * 見積書の「実効ステータス」を計算する。
 * accepted / converted_to_invoice は先方の意思決定・実際の変換操作が確定した終端状態のため、
 * 有効期限が過ぎていても自動的には変えない。draft / sent は有効期限が過ぎていれば "expired" とみなす。
 * すでに明示的に "expired" が設定されている場合もそのまま維持する。
 */
export function resolveQuoteEffectiveStatus(quote: Quote, asOfDateIso: string): QuoteStatus {
  if (quote.status === "accepted" || quote.status === "converted_to_invoice") {
    return quote.status;
  }
  if (isQuoteExpired(quote, asOfDateIso)) {
    return "expired";
  }
  return quote.status;
}

/** 見積書が「承認済み」の実効ステータスであり、請求書へ変換してよい状態かどうか。 */
export function isQuoteAcceptedForConversion(quote: Quote, asOfDateIso: string): boolean {
  return resolveQuoteEffectiveStatus(quote, asOfDateIso) === "accepted";
}

export interface ConvertQuoteToInvoiceOptions {
  /** 変換後の請求書の発行日（省略時は見積書の発行日をそのまま使う） */
  invoiceIssueDate?: string;
  /** 請求書番号（省略時はclientInvoice.ts側のformatInvoiceNumber等で別途採番する想定） */
  invoiceNumber?: string;
  /** 取引年月日（省略時はinvoiceIssueDateと同じ日を使う） */
  transactionDate?: string | null;
  transactionPeriodStart?: string | null;
  transactionPeriodEnd?: string | null;
}

/**
 * 承認済み（accepted）の見積書から、clientInvoice.ts の buildClientInvoice にそのまま渡せる
 * ClientInvoiceInput を組み立てる純粋関数。
 *
 * 明細（description/quantity/unitPrice/taxRate）・発行者情報・見積先名をそのまま引き継ぎ、
 * 見積書固有の有効期限（validityPeriodDays/validUntil）・ステータスは請求書には存在しないため引き継がない
 * （請求書側は支払期日 dueDate を別途、必要なら呼び出し側がUIで入力する）。
 * 変換の可否（見積書が実際にacceptedかどうか）はUI側の責務とする
 * （isQuoteAcceptedForConversion を使って呼び出し側で判定できる）。例外は投げない。
 */
export function convertQuoteToClientInvoiceInput(
  quote: Quote,
  options: ConvertQuoteToInvoiceOptions = {}
): ClientInvoiceInput {
  const issueDate = options.invoiceIssueDate ?? quote.issueDate;

  const lineItems: ClientInvoiceLineItemInput[] = quote.lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
  }));

  return {
    invoiceNumber: options.invoiceNumber,
    issuerName: quote.issuerName,
    issuerRegistrationNumber: quote.issuerRegistrationNumber,
    issueDate,
    transactionDate: options.transactionPeriodStart || options.transactionPeriodEnd ? null : options.transactionDate ?? issueDate,
    transactionPeriodStart: options.transactionPeriodStart ?? null,
    transactionPeriodEnd: options.transactionPeriodEnd ?? null,
    clientName: quote.clientName,
    lineItems,
  };
}

/** 見積書のステータスを「請求書に変換済み」へ更新した新しいQuoteを返す（イミュータブルな更新）。 */
export function markQuoteAsConvertedToInvoice(quote: Quote): Quote {
  return { ...quote, status: "converted_to_invoice" };
}

// ------------------------------------------------------------------
// 印刷／PDF保存レイアウト（QuotePrintLayout.tsx）向けの表示用ヘルパー。
// invoice/invoicePrintLayout.ts と同じ考え方（window.print()に頼るブラウザ標準の
// 印刷/PDF保存、新規PDFライブラリへの依存を増やさない）に揃える。
// ------------------------------------------------------------------

/** 印刷書面のフッターに常時表示する注記文。 */
export const QUOTE_PRINT_NOTICE =
  "本書類は「決算書作成から税務申告までワンクリック（スグル）」で作成した見積書です。これは価格提示のための書類であり、正式な契約成立や請求を意味しません。" +
  "当社が税務代理・税務書類の作成・個別具体的な税務相談を行うものではありません。";

/**
 * ISO日付文字列（"YYYY-MM-DD"）を「YYYY年M月D日」の表示用ラベルに変換する。
 * 未入力・不正な日付の場合は「未設定」を返す。
 */
export function formatQuoteDateLabel(dateIso: string | null | undefined): string {
  if (!isValidIsoDate(dateIso)) return "未設定";
  const parsed = parseIsoDate(dateIso)!;
  return `${parsed.y}年${parsed.m}月${parsed.d}日`;
}

/** 見積書の登録番号欄に表示するラベル（未登録の場合はその旨を明示する）。 */
export function formatQuoteIssuerRegistrationLabel(quote: Quote): string {
  return quote.issuerRegistrationNumber ?? "登録番号未登録（免税事業者・未登録事業者等）";
}

/** 見積書のステータスの表示用ラベル。有効期限切れの場合は実効ステータス（expired）を優先して表示する。 */
export function formatQuoteStatusLabel(quote: Quote, asOfDateIso: string): string {
  return QUOTE_STATUS_LABELS[resolveQuoteEffectiveStatus(quote, asOfDateIso)];
}

/**
 * Quote から、印刷レイアウトのヘッダーに表示するフィールド一覧を組み立てる。
 * 明細行・税率ごとの内訳・合計額は Quote.lineItems / taxRateSubtotals / grandTotal を
 * コンポーネント側で直接表示する（invoicePrintLayout.ts と同じ役割分担）。
 */
export function buildQuotePrintHeaderFields(quote: Quote): PrintableField[] {
  return selectPrintVisibleFields([
    { key: "quoteNumber", label: "見積書番号", value: quote.quoteNumber || "未採番" },
    { key: "issueDate", label: "発行日", value: formatQuoteDateLabel(quote.issueDate) },
    { key: "validUntil", label: "有効期限", value: formatQuoteDateLabel(quote.validUntil) },
    { key: "issuerName", label: "発行者", value: quote.issuerName || "（未入力）" },
    { key: "issuerRegistrationNumber", label: "登録番号", value: formatQuoteIssuerRegistrationLabel(quote) },
    { key: "clientName", label: "見積先", value: quote.clientName || "（未入力）" },
  ]);
}
