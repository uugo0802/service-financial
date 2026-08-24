import { ClientInvoice } from "./clientInvoice";
import { PrintableField, selectPrintVisibleFields } from "../export/printLayout";

// ------------------------------------------------------------------
// 発行済み請求書（ClientInvoice）を印刷／PDF保存用レイアウト
// （InvoicePrintLayout.tsx）で表示するための純粋関数・定数群。
//
// 決算書類向けの src/lib/export/printLayout.ts と同じ「window.print()に頼った
// ブラウザ標準の印刷/PDF保存」方式に合わせ、新規PDFライブラリへの依存を増やさない
// （docs/cto-tech-architecture.md 2章の低ランニングコスト方針に準拠）。
//
// 【法的に重要（printLayout.tsとの違い）】決算書類（PrintableStatementLayout）は
// 申告のための「下書き・シミュレーション」であり、それと誤認されないよう透かし・注記を
// 必ず付与している。一方この請求書は、取引先へ実際に交付する書類そのもの（本アプリの
// 正規の成果物）であり「下書き」ではないため、同じ透かし表示は行わない。
// ただし、当社が税務代理・税務書類の作成・個別具体的な税務相談を行うものではないこと、
// および適格請求書として使用する場合の登録番号の実在確認は発行者自身の責任であることは
// 印刷書面のフッターに常時明記する（docs/business-plan.md 2.「法的ポジショニング」の方針に
// 準拠）。文言は本ファイルの INVOICE_PRINT_NOTICE を唯一の出典とし、
// コンポーネント側での書き換え・弱化は禁止する。
// ------------------------------------------------------------------

/** 印刷書面のフッターに常時表示する注記文。 */
export const INVOICE_PRINT_NOTICE =
  "本書類は「税務申告AI（ジャービス）」で作成した請求書です。適格請求書として使用する場合、登録番号の実在確認（国税庁「適格請求書発行事業者公表サイト」）は発行者ご自身の責任で行ってください。" +
  "当社が税務代理・税務書類の作成・個別具体的な税務相談を行うものではありません。";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // "YYYY-MM-DD"の形式に一致していても、実在しない日付（例: 2月30日）である可能性があるため、
  // ロールオーバーを利用して実在する暦日かどうかを検証する（quote.tsのisValidIsoDateと同じ考え方）。
  // これを行わないと、例えば"2026-02-30"のような不正な日付がそのまま「2026年2月30日」と
  // 表示されてしまい、本関数のドキュメントコメントが約束する「不正な日付の場合は『未設定』を返す」
  // という契約に反する。
  const rollover = new Date(Date.UTC(y, m - 1, d));
  if (rollover.getUTCFullYear() !== y || rollover.getUTCMonth() !== m - 1 || rollover.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/**
 * ISO日付文字列（"YYYY-MM-DD"）を「YYYY年M月D日」の表示用ラベルに変換する。
 * 未入力・不正な日付の場合は「未設定」を返す（タイムゾーン依存の挙動を避けるため
 * Date型ではなく文字列を直接パースする。formatFiscalYearRangeと同じ方針）。
 */
export function formatInvoiceDateLabel(dateIso: string | null | undefined): string {
  const parsed = parseIsoDate(dateIso);
  if (!parsed) return "未設定";
  return `${parsed.y}年${parsed.m}月${parsed.d}日`;
}

/**
 * 請求書の取引年月日欄に表示するラベルを組み立てる。
 * 単発の取引日（transactionDate）があればそれを、なければ取引期間
 * （transactionPeriodStart〜transactionPeriodEnd）を「YYYY年M月D日〜M月D日」
 * （年をまたぐ場合は終了日にも年を表示）の形式で返す。どちらも未入力の場合は「未設定」。
 */
export function formatInvoiceTransactionLabel(invoice: ClientInvoice): string {
  if (invoice.transactionDate) {
    return formatInvoiceDateLabel(invoice.transactionDate);
  }

  const start = parseIsoDate(invoice.transactionPeriodStart);
  const end = parseIsoDate(invoice.transactionPeriodEnd);
  if (start && end) {
    const startLabel = `${start.y}年${start.m}月${start.d}日`;
    const endLabel = start.y === end.y ? `${end.m}月${end.d}日` : `${end.y}年${end.m}月${end.d}日`;
    return `${startLabel}〜${endLabel}`;
  }

  return "未設定";
}

/**
 * 適格請求書発行事業者登録番号の印刷用ラベル。未登録の場合はその旨を明示する
 * （区分記載請求書としての発行自体は妨げないため、単なる空欄にはしない）。
 */
export function formatIssuerRegistrationLabel(invoice: ClientInvoice): string {
  return invoice.issuerRegistrationNumber ?? "登録番号未登録（免税事業者・未登録事業者等）";
}

/**
 * 適格請求書としての記載事項充足状況の印刷用ラベル。
 * InvoiceNumberBadge.tsxと同様、形式・チェックデジットが有効な場合でも
 * 「実在確認済み」であるかのような表現は避ける。
 */
export function formatQualifiedInvoiceStatusLabel(invoice: ClientInvoice): string {
  return invoice.isQualifiedInvoice
    ? "適格請求書（インボイス）の記載事項を満たしています（登録番号の実在確認は別途必要です）"
    : "区分記載請求書相当です（登録番号が未入力または未確認のため、適格請求書の記載事項は満たしません）";
}

/**
 * ClientInvoice から、印刷レイアウトのヘッダーに表示するフィールド一覧を組み立てる。
 * 消費税法57条の4第1項が適格請求書に求める記載事項（発行者の氏名・登録番号、取引年月日、
 * 交付を受ける者の氏名等）のうち、明細行・税率区分ごとの内訳・合計額を除いたヘッダー相当分。
 * 明細行・税率ごとの内訳・合計額は ClientInvoice.lineItems / taxRateSubtotals /
 * grandTotal をコンポーネント側で直接表示する（financial-statementsページの
 * PrintableStatementLayoutと同じく、表形式の本文はコンポーネント側の責務とする）。
 */
export function buildInvoicePrintHeaderFields(invoice: ClientInvoice): PrintableField[] {
  return selectPrintVisibleFields([
    { key: "invoiceNumber", label: "請求書番号", value: invoice.invoiceNumber || "未採番" },
    { key: "issueDate", label: "発行日", value: formatInvoiceDateLabel(invoice.issueDate) },
    { key: "transactionDate", label: "取引年月日", value: formatInvoiceTransactionLabel(invoice) },
    { key: "issuerName", label: "発行者", value: invoice.issuerName || "（未入力）" },
    { key: "issuerRegistrationNumber", label: "登録番号", value: formatIssuerRegistrationLabel(invoice) },
    { key: "clientName", label: "請求先", value: invoice.clientName || "（未入力）" },
  ]);
}
