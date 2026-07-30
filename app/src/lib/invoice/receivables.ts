// ------------------------------------------------------------------
// 未収入金（Accounts Receivable）集計ロジック。
//
// フリーランス・マイクロ法人が既に発行済みの請求書（clientInvoice.ts で組み立てたもの）
// のうち、まだ入金が確認されていないものを「未収入金」として集計する純粋関数群。
//
// これはあくまで記帳・入金管理（誰にいくら請求していて、いくら未収か）を補助するツールであり、
// 税務代理・個別具体の税務相談・督促（債権回収）の助言は一切行わない
// （docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
// ------------------------------------------------------------------

/**
 * 未収入金集計の対象となる請求書1件分の入力。
 * ClientInvoice（clientInvoice.ts）が持つフィールドのうち、集計に必要なものだけを抜き出した形。
 */
export interface ReceivableInvoiceInput {
  invoiceNumber: string;
  clientName: string;
  /** 請求書発行日（ISO日付文字列） */
  issueDate: string;
  /** 支払期日（ISO日付文字列）。未入力の場合は issueDate を基準に経過日数を計算する */
  dueDate?: string | null;
  /** 請求金額合計（税込、円） */
  grandTotal: number;
  /** 入金日（ISO日付文字列）。未収の場合は未入力でよい */
  paidAt?: string | null;
  /**
   * 入金済み金額（円）。paidAt はあるが本項目が未入力の場合、grandTotal が全額入金されたものとして扱う。
   * paidAt が未入力の場合は無視される（未収金額は常に grandTotal 扱い）。
   */
  paidAmount?: number | null;
}

export type AgingBucketKey = "0-30" | "31-60" | "61-90" | "91+";

export interface AgingBucket {
  key: AgingBucketKey;
  /** 表示用ラベル（例: "未収 0-30日"） */
  label: string;
  /** バケットの下限日数（含む） */
  minDaysOverdue: number;
  /** バケットの上限日数（含む）。上限なしの場合は null */
  maxDaysOverdue: number | null;
  /** 当該バケットに該当する請求書の件数 */
  count: number;
  /** 当該バケットに該当する未収金額の合計（円） */
  amount: number;
}

export interface OverdueInvoice {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  /** 支払期日（未入力の場合は null。この場合 issueDate を基準に daysOverdue を計算している） */
  dueDate: string | null;
  /** 期日（なければ発行日）から asOfDate までの経過日数。1以上のみ「期日超過」として一覧に含める */
  daysOverdue: number;
  /** 当該請求書の未収金額（円） */
  outstandingAmount: number;
}

export interface ReceivablesSummary {
  /** 集計の基準日（ISO日付文字列） */
  asOfDate: string;
  /** 未収入金の総額（円）。期日前でまだ未収の請求書も含む */
  totalOutstanding: number;
  /** 未収の請求書件数（期日前を含む） */
  totalOutstandingCount: number;
  /** 期日超過（daysOverdue >= 1）の請求書に基づく年齢別集計。0-30日→31-60日→61-90日→91日以上の順 */
  agingBuckets: AgingBucket[];
  /** 期日超過の請求書一覧（daysOverdue 降順） */
  overdueInvoices: OverdueInvoice[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AGING_BUCKET_DEFINITIONS: { key: AgingBucketKey; label: string; minDaysOverdue: number; maxDaysOverdue: number | null }[] = [
  { key: "0-30", label: "未収 0-30日", minDaysOverdue: 1, maxDaysOverdue: 30 },
  { key: "31-60", label: "未収 31-60日", minDaysOverdue: 31, maxDaysOverdue: 60 },
  { key: "61-90", label: "未収 61-90日", minDaysOverdue: 61, maxDaysOverdue: 90 },
  { key: "91+", label: "未収 91日以上", minDaysOverdue: 91, maxDaysOverdue: null },
];

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * ISO日付文字列（"YYYY-MM-DD"）をUTC深夜0時のタイムスタンプに変換する。
 * 不正な日付の場合は NaN を返す（呼び出し側でガードする）。
 */
function toUTCDateMs(isoDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return NaN;
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * 基準日（referenceDate）から asOfDate までの経過日数（切り捨て、整数）を計算する。
 * 不正な日付の場合は NaN を返す。
 */
function daysBetween(asOfDate: string, referenceDate: string): number {
  const asOfMs = toUTCDateMs(asOfDate);
  const referenceMs = toUTCDateMs(referenceDate);
  if (Number.isNaN(asOfMs) || Number.isNaN(referenceMs)) return NaN;
  return Math.floor((asOfMs - referenceMs) / MS_PER_DAY);
}

/**
 * 請求書1件の未収金額（円）を計算する。
 * - paidAt が未入力 → grandTotal 全額が未収
 * - paidAt があり paidAmount も入力されている → grandTotal - paidAmount（下限0円）
 * - paidAt があるが paidAmount が未入力 → 全額入金されたとみなし未収0円
 */
export function outstandingAmountOf(invoice: ReceivableInvoiceInput): number {
  if (isBlank(invoice.paidAt)) {
    return Math.max(0, invoice.grandTotal);
  }
  const paidAmount = typeof invoice.paidAmount === "number" && Number.isFinite(invoice.paidAmount)
    ? invoice.paidAmount
    : invoice.grandTotal;
  return Math.max(0, invoice.grandTotal - paidAmount);
}

/**
 * 経過日数の基準日として使う日付（支払期日があればそれ、なければ発行日）を返す。
 */
function referenceDateOf(invoice: ReceivableInvoiceInput): string {
  return isBlank(invoice.dueDate) ? invoice.issueDate : invoice.dueDate!;
}

/**
 * 発行済み請求書一覧と基準日（asOfDate）から、未収入金の総額・年齢別集計（aging）・
 * 期日超過の請求書一覧を計算する。
 *
 * 例外は投げない。日付が不正な請求書（issueDate/dueDate が "YYYY-MM-DD" 形式でない等）は
 * 経過日数が計算できないため、年齢別集計・期日超過一覧からは除外するが、
 * 未収であれば totalOutstanding / totalOutstandingCount には含める（記帳上の未収金額を過小報告しないため）。
 */
export function computeReceivablesSummary(
  invoices: ReceivableInvoiceInput[],
  asOfDate: string
): ReceivablesSummary {
  const buckets: AgingBucket[] = AGING_BUCKET_DEFINITIONS.map((def) => ({ ...def, count: 0, amount: 0 }));

  let totalOutstanding = 0;
  let totalOutstandingCount = 0;
  const overdueInvoices: OverdueInvoice[] = [];

  for (const invoice of invoices ?? []) {
    const outstanding = outstandingAmountOf(invoice);
    if (outstanding <= 0) continue;

    totalOutstanding += outstanding;
    totalOutstandingCount += 1;

    const referenceDate = referenceDateOf(invoice);
    const daysOverdue = daysBetween(asOfDate, referenceDate);
    if (Number.isNaN(daysOverdue) || daysOverdue < 1) continue; // 期日未到来、または日付不正のためaging対象外

    const bucket = buckets.find(
      (b) => daysOverdue >= b.minDaysOverdue && (b.maxDaysOverdue === null || daysOverdue <= b.maxDaysOverdue)
    );
    if (bucket) {
      bucket.count += 1;
      bucket.amount += outstanding;
    }

    overdueInvoices.push({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      issueDate: invoice.issueDate,
      dueDate: isBlank(invoice.dueDate) ? null : invoice.dueDate!,
      daysOverdue,
      outstandingAmount: outstanding,
    });
  }

  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    asOfDate,
    totalOutstanding,
    totalOutstandingCount,
    agingBuckets: buckets,
    overdueInvoices,
  };
}
