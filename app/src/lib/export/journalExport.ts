// 記帳データ（仕訳）・税額概算サマリーを、税理士への受け渡しやご自身の記録用に
// CSV形式で書き出すための純粋関数群。
// 注意: これは「当社が申告した」ことを示す書類ではなく、あくまで記帳データの下書き・
// 概算試算のエクスポートです。最終的な申告内容はご自身または税理士等の専門家がご確認ください。

import { CategorizedTransaction, CategorySource } from "../categorize/engine";
import { IndividualEstimate } from "../tax/estimate";
import { CorporateEstimate } from "../tax/corporateEstimate";

// 他のCSVエクスポート機能（別表十六（一）等）からも再利用できるよう、
// 改行定数・CSVブロック組み立て関数はexportする。
export const CRLF = "\r\n";

export const EXPORT_DISCLAIMER =
  "本データはご自身の記録および税理士等の専門家によるご確認のための下書き・概算情報です。当社が申告や税務代理を行うものではありません。";

/**
 * RFC4180準拠のフィールドエスケープ。
 * カンマ・二重引用符・改行(CR/LF)のいずれかを含む場合のみダブルクォートで囲み、
 * フィールド内の二重引用符は二重化してエスケープする。
 */
function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}

export function buildCsvBlock(rows: (string | number)[][]): string {
  return rows.map(toCsvRow).join(CRLF);
}

const JOURNAL_SOURCE_LABELS: Record<CategorySource, string> = {
  rule: "ルール自動判定",
  ai: "AI自動判定",
  uncategorized: "未分類",
  manual: "手入力",
  generated: "自動生成（減価償却・借入金返済等）",
};

export const JOURNAL_ENTRY_CSV_HEADERS = [
  "日付",
  "摘要",
  "金額",
  "勘定科目",
  "消費税区分",
  "備考",
  "分類方法",
  "信頼度",
] as const;

/** 仕訳データ（CategorizedTransaction[]）をCSV文字列に変換する（ヘッダー行を含む） */
export function journalEntriesToCsv(entries: CategorizedTransaction[]): string {
  const rows: (string | number)[][] = [
    [...JOURNAL_ENTRY_CSV_HEADERS],
    ...entries.map((entry) => [
      entry.date,
      entry.description,
      entry.amount,
      entry.account,
      entry.taxCategory,
      entry.note ?? "",
      JOURNAL_SOURCE_LABELS[entry.source] ?? entry.source,
      entry.confidence,
    ]),
  ];
  return buildCsvBlock(rows);
}

export interface TaxEstimateSummaryRow {
  label: string;
  value: string;
}

export type TaxEstimateSummaryInput =
  | { kind: "individual"; estimate: IndividualEstimate }
  | { kind: "corporate"; estimate: CorporateEstimate };

function individualSummaryRows(estimate: IndividualEstimate): TaxEstimateSummaryRow[] {
  return [
    { label: "区分", value: "個人事業主（所得税・消費税の概算試算）" },
    { label: "総収入金額", value: String(estimate.totalIncome) },
    { label: "必要経費", value: String(estimate.totalExpense) },
    { label: "事業所得（収入-経費）", value: String(estimate.businessProfit) },
    { label: "社会保険料控除", value: String(estimate.socialInsuranceDeduction) },
    { label: "青色申告特別控除", value: String(estimate.blueReturnDeduction) },
    { label: "課税所得金額", value: String(estimate.taxableIncome) },
    {
      label: "所得税額（限界税率）",
      value: `${estimate.incomeTax.tax}円（${estimate.incomeTax.marginalRate}%）`,
    },
    { label: "復興特別所得税", value: String(estimate.reconstructionSurtax) },
    { label: "所得税・復興特別所得税 合計", value: String(estimate.totalIncomeTax) },
    { label: "消費税 納付見込額", value: String(estimate.consumptionTax.payable) },
    {
      label: "消費税免税事業者の可能性",
      value: estimate.consumptionTax.isLikelyExempt ? "あり" : "なし",
    },
    ...estimate.assumptions.map((note) => ({ label: "前提条件", value: note })),
  ];
}

function corporateSummaryRows(estimate: CorporateEstimate): TaxEstimateSummaryRow[] {
  return [
    { label: "区分", value: "マイクロ法人（法人税・消費税の概算試算）" },
    { label: "売上高", value: String(estimate.revenue) },
    { label: "経費", value: String(estimate.expenses) },
    { label: "課税所得金額", value: String(estimate.taxableIncome) },
    { label: "法人税額", value: String(estimate.corporateTax) },
    { label: "地方法人税額", value: String(estimate.localCorporateTax) },
    { label: "均等割（参考値）", value: String(estimate.perCapitaTaxReference) },
    { label: "国税合計（法人税+地方法人税）", value: String(estimate.totalNationalTax) },
    { label: "消費税 納付見込額", value: String(estimate.consumptionTax.payable) },
    {
      label: "消費税免税事業者の可能性",
      value: estimate.consumptionTax.isLikelyExempt ? "あり" : "なし",
    },
    ...estimate.assumptions.map((note) => ({ label: "前提条件", value: note })),
  ];
}

/** 個人事業主/マイクロ法人いずれかの税額概算サマリーを、ラベル・値の行データに正規化する */
export function taxEstimateSummaryRows(input: TaxEstimateSummaryInput): TaxEstimateSummaryRow[] {
  return input.kind === "individual" ? individualSummaryRows(input.estimate) : corporateSummaryRows(input.estimate);
}

/** 税額概算サマリーをCSV文字列に変換する（ヘッダー行を含む） */
export function taxEstimateSummaryToCsv(input: TaxEstimateSummaryInput): string {
  const rows: (string | number)[][] = [
    ["項目", "内容"],
    ...taxEstimateSummaryRows(input).map((row) => [row.label, row.value]),
  ];
  return buildCsvBlock(rows);
}

export interface JournalExportOptions {
  entries: CategorizedTransaction[];
  taxEstimate?: TaxEstimateSummaryInput;
  /** テスト・スナップショットの再現性のため注入可能。未指定時は現在時刻を使用する */
  generatedAt?: Date;
}

/**
 * 仕訳明細と（あれば）税額概算サマリーを1つのCSV文書にまとめる。
 * 税理士への受け渡しやご自身の保管を想定し、冒頭に免責文言・出力日時を含める。
 */
export function buildJournalExportCsv(options: JournalExportOptions): string {
  const generatedAt = options.generatedAt ?? new Date();
  const sections: string[] = [];

  sections.push(
    buildCsvBlock([
      ["決算書作成から税務申告までワンクリック スグル - 記帳データエクスポート"],
      [`出力日時: ${generatedAt.toISOString()}`],
      [EXPORT_DISCLAIMER],
    ])
  );

  sections.push(buildCsvBlock([["■ 仕訳明細"]]) + CRLF + journalEntriesToCsv(options.entries));

  if (options.taxEstimate) {
    sections.push(buildCsvBlock([["■ 税額概算サマリー"]]) + CRLF + taxEstimateSummaryToCsv(options.taxEstimate));
  }

  return sections.join(CRLF + CRLF) + CRLF;
}
