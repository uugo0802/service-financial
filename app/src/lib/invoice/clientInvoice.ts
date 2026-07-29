import { validateInvoiceRegistrationNumber } from "../categorize/invoiceRegistrationValidator";

// ------------------------------------------------------------------
// フリーランス・マイクロ法人が「自分の顧客」に対して発行する請求書（適格請求書/
// 区分記載請求書）の下書きを組み立てる純粋関数群。
//
// これはあくまで請求書データの下書き作成を補助するツールであり、税務代理・
// 個別具体の税務相談は行わない（docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
//
// 適格請求書等保存方式（インボイス制度）で請求書に記載が必要な事項（消費税法57条の4第1項）:
//   1. 発行者の氏名または名称、および登録番号
//   2. 取引年月日
//   3. 取引内容（軽減税率対象の場合はその旨）
//   4. 税率ごとに区分した合計対価の額（税抜または税込）および適用税率
//   5. 税率ごとに区分した消費税額等
//   6. 交付を受ける者（取引先）の氏名または名称
//
// 登録番号が未入力・無効の場合でも、免税事業者や登録前の事業者が「区分記載請求書」として
// 請求書を発行すること自体は可能（適格請求書の要件を満たさないだけ）。そのため、登録番号の
// 不備は請求書作成をブロックするエラーにはせず、警告（warnings）として返す。
//
// 端数処理: 国税庁の消費税軽減税率制度Q&A等に基づき、消費税額の端数処理は
// 「1つの請求書につき、税率ごとに1回」が原則（明細行ごとに丸めない）。本モジュールも
// 税率ごとの課税標準額の合計に対して1回だけ端数処理を行う。既存コード
// （app/src/lib/tax/estimate.ts, consumptionTaxForm.ts）にならい、円未満は切り捨てで統一する。
// ------------------------------------------------------------------

export type InvoiceTaxRate = 0 | 8 | 10;

export const INVOICE_TAX_RATES: InvoiceTaxRate[] = [10, 8, 0];

export const INVOICE_TAX_RATE_LABELS: Record<InvoiceTaxRate, string> = {
  10: "標準税率10%",
  8: "軽減税率8%",
  0: "非課税・不課税・免税(0%)",
};

export interface ClientInvoiceLineItemInput {
  /** 品目・役務内容 */
  description: string;
  /** 数量（時間単位など小数も許容） */
  quantity: number;
  /** 単価（税抜、円） */
  unitPrice: number;
  /** 適用税率 */
  taxRate: InvoiceTaxRate;
}

export interface ClientInvoiceInput {
  /** 請求書番号。省略時は formatInvoiceNumber 等で別途採番する */
  invoiceNumber?: string;
  /** 発行者（請求する側＝自分）の氏名または屋号・法人名 */
  issuerName: string;
  /** 発行者の適格請求書発行事業者登録番号（"T"+13桁）。未登録の場合は未入力でよい */
  issuerRegistrationNumber?: string | null;
  /** 請求書発行日 */
  issueDate: string;
  /** 取引年月日（単発の場合） */
  transactionDate?: string | null;
  /** 取引期間（期間内の複数取引をまとめて請求する場合）の開始日 */
  transactionPeriodStart?: string | null;
  /** 取引期間の終了日 */
  transactionPeriodEnd?: string | null;
  /** 請求先（交付を受ける者）の氏名または名称 */
  clientName: string;
  lineItems: ClientInvoiceLineItemInput[];
}

export interface ClientInvoiceLineItemComputed extends ClientInvoiceLineItemInput {
  /** 税抜金額（数量×単価、円未満切り捨て） */
  lineAmountExcludingTax: number;
}

export interface InvoiceTaxRateSubtotal {
  taxRate: InvoiceTaxRate;
  /** 当該税率の税抜合計対価の額 */
  taxableBase: number;
  /** 当該税率の消費税額等（税抜合計に対して1回だけ端数処理） */
  taxAmount: number;
  /** 当該税率の税込合計（taxableBase + taxAmount） */
  taxInclusiveTotal: number;
}

export interface ClientInvoice {
  invoiceNumber: string;
  issuerName: string;
  issuerRegistrationNumber: string | null;
  /**
   * 登録番号が入力され、かつ形式・チェックデジットが有効な場合のみ true。
   * true であっても国税庁「適格請求書発行事業者公表サイト」での実在確認は別途必要
   * （invoiceRegistrationValidator.ts の validateInvoiceRegistrationNumber 参照）。
   */
  isQualifiedInvoice: boolean;
  issueDate: string;
  transactionDate: string | null;
  transactionPeriodStart: string | null;
  transactionPeriodEnd: string | null;
  clientName: string;
  lineItems: ClientInvoiceLineItemComputed[];
  /** 税率ごとの内訳（10%→8%→0%の順） */
  taxRateSubtotals: InvoiceTaxRateSubtotal[];
  /** 税抜合計（全税率合計） */
  subtotalExcludingTax: number;
  /** 消費税額等の合計（全税率合計） */
  totalTax: number;
  /** 請求金額合計（税込） */
  grandTotal: number;
}

export interface BuildClientInvoiceResult {
  invoice: ClientInvoice;
  /** 適格請求書/区分記載請求書としての必須記載事項の不足など、対応が必要な問題 */
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

/**
 * 請求書番号を組み立てる（例: issueDate "2026-07-29", sequence 3 → "INV-20260729-0003"）。
 * サーバー側の連番管理は行わない、純粋なフォーマット関数。
 */
export function formatInvoiceNumber(issueDate: string, sequence: number): string {
  const compactDate = /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate.replaceAll("-", "") : "00000000";
  const safeSequence = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `INV-${compactDate}-${String(safeSequence).padStart(4, "0")}`;
}

/**
 * 明細行1件を税抜金額に変換する（数量×単価、円未満切り捨て）。
 */
function computeLineAmount(item: ClientInvoiceLineItemInput): number {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return roundDownToYen(quantity * unitPrice);
}

/**
 * 入力内容を検証し、エラー（必須事項の不足）と警告（登録番号未入力など）を分けて返す。
 * 例外は投げない — 呼び出し側（UI）が errors を見て送信可否を判断する。
 */
export function validateClientInvoiceInput(input: ClientInvoiceInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isBlank(input.issuerName)) {
    errors.push("発行者名（あなたの氏名または屋号・法人名）を入力してください。");
  }
  if (isBlank(input.clientName)) {
    errors.push("請求先（取引先）の名称を入力してください。");
  }
  if (isBlank(input.issueDate)) {
    errors.push("請求書発行日を入力してください。");
  }
  if (isBlank(input.transactionDate) && isBlank(input.transactionPeriodStart) && isBlank(input.transactionPeriodEnd)) {
    errors.push("取引年月日、または取引期間（開始日・終了日）のいずれかを入力してください。");
  }
  if (
    !isBlank(input.transactionPeriodStart) &&
    !isBlank(input.transactionPeriodEnd) &&
    input.transactionPeriodStart! > input.transactionPeriodEnd!
  ) {
    errors.push("取引期間の開始日が終了日より後になっています。");
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

  // 登録番号は未入力でも請求書作成自体はブロックしない（区分記載請求書としては発行可能）。
  if (isBlank(input.issuerRegistrationNumber)) {
    warnings.push(
      "適格請求書発行事業者の登録番号が未入力です。このままでは「適格請求書」の要件を満たさず、区分記載請求書としての発行になります（登録事業者でない場合はそのままで問題ありません）。"
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
 * 請求書データを組み立てる。必須項目が不足していてもエラーは投げず、
 * 分かっている範囲でベストエフォートに計算した invoice と、errors/warnings を返す
 * （UIでプレビューしながらエラーを解消していける想定）。
 */
export function buildClientInvoice(input: ClientInvoiceInput): BuildClientInvoiceResult {
  const { errors, warnings } = validateClientInvoiceInput(input);

  const lineItems: ClientInvoiceLineItemComputed[] = (input.lineItems ?? []).map((item) => ({
    ...item,
    lineAmountExcludingTax: computeLineAmount(item),
  }));

  // 税率ごとに明細を合計してから1回だけ端数処理する（明細行ごとには丸めない）。
  // 課税標準額が0円の税率は内訳に表示する意味がないため除外する。
  const nonZeroSubtotals: InvoiceTaxRateSubtotal[] = INVOICE_TAX_RATES.map((rate) => {
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

  const invoice: ClientInvoice = {
    invoiceNumber: input.invoiceNumber?.trim() || formatInvoiceNumber(input.issueDate, 1),
    issuerName: input.issuerName?.trim() ?? "",
    issuerRegistrationNumber: isBlank(registrationNumberInput) ? null : registrationValidation!.normalized ?? registrationNumberInput!.trim(),
    isQualifiedInvoice: Boolean(registrationValidation?.valid),
    issueDate: input.issueDate ?? "",
    transactionDate: isBlank(input.transactionDate) ? null : input.transactionDate!,
    transactionPeriodStart: isBlank(input.transactionPeriodStart) ? null : input.transactionPeriodStart!,
    transactionPeriodEnd: isBlank(input.transactionPeriodEnd) ? null : input.transactionPeriodEnd!,
    clientName: input.clientName?.trim() ?? "",
    lineItems,
    taxRateSubtotals: nonZeroSubtotals,
    subtotalExcludingTax,
    totalTax,
    grandTotal: subtotalExcludingTax + totalTax,
  };

  return {
    invoice,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}
