// 別表十六（一）減価償却明細（DepreciationScheduleForm）をCSV形式で書き出すための純粋関数。
// CSVのエスケープ・行組み立てはlib/export/journalExport.tsの共通ロジック（buildCsvBlock・CRLF・
// EXPORT_DISCLAIMER）を再利用し、ここでは別表十六（一）固有の列構成・セクション組み立てのみを行う。

import { DepreciationScheduleForm, DepreciationScheduleRow } from "@/lib/tax/depreciationScheduleForm";
import { CRLF, EXPORT_DISCLAIMER, buildCsvBlock } from "./journalExport";

export const DEPRECIATION_SCHEDULE_CSV_HEADERS = [
  "種類・名称",
  "取得年月",
  "事業供用年月",
  "耐用年数",
  "取得価額",
  "差引取得価額",
  "償却の基礎になる金額",
  "償却方法",
  "償却率",
  "事業供用月数",
  "本年分の普通償却限度額",
  "本年分の償却費",
  "差引期末帳簿価額",
  "摘要",
] as const;

function rowToCsvFields(row: DepreciationScheduleRow): (string | number)[] {
  return [
    row.assetName,
    row.acquisitionDate,
    row.serviceStartDate,
    row.usefulLifeYears,
    row.acquisitionCost,
    row.netAcquisitionCost,
    row.depreciationBase,
    "定額法",
    row.depreciationRate.toFixed(3),
    row.monthsInService,
    row.ordinaryDepreciationLimit,
    row.currentYearDepreciationExpense,
    row.endingBookValue,
    row.remarks.join(" "),
  ];
}

/** 別表十六（一）の資産明細（合計行を含む）をCSV文字列に変換する（ヘッダー行を含む） */
export function depreciationScheduleRowsToCsv(form: DepreciationScheduleForm): string {
  const rows: (string | number)[][] = [
    [...DEPRECIATION_SCHEDULE_CSV_HEADERS],
    ...form.rows.map(rowToCsvFields),
    [
      "合計",
      "",
      "",
      "",
      form.totals.acquisitionCostTotal,
      form.totals.netAcquisitionCostTotal,
      form.totals.depreciationBaseTotal,
      "",
      "",
      "",
      form.totals.ordinaryDepreciationLimitTotal,
      form.totals.currentYearDepreciationExpenseTotal,
      form.totals.endingBookValueTotal,
      "",
    ],
  ];
  return buildCsvBlock(rows);
}

export interface DepreciationScheduleCsvOptions {
  form: DepreciationScheduleForm;
  entityName: string;
  /** テスト・スナップショットの再現性のため注入可能。未指定時は現在時刻を使用する */
  generatedAt?: Date;
}

/**
 * 別表十六（一）の下書き（タイトル・出力日時・免責文言・法人名・対象期間・資産明細・注記）を
 * 1つのCSV文書にまとめる。税理士への受け渡しやご自身の保管を想定している。
 */
export function buildDepreciationScheduleExportCsv(options: DepreciationScheduleCsvOptions): string {
  const { form, entityName } = options;
  const generatedAt = options.generatedAt ?? new Date();
  const sections: string[] = [];

  sections.push(
    buildCsvBlock([
      ["決算書作成から税務申告までワンクリック スグル - 別表十六（一）減価償却明細エクスポート"],
      [`出力日時: ${generatedAt.toISOString()}`],
      ["法人名（屋号）", entityName],
      ["対象期間", `${form.fiscalPeriod.start} 〜 ${form.fiscalPeriod.end}`],
      [EXPORT_DISCLAIMER],
    ])
  );

  sections.push(buildCsvBlock([["■ 資産明細（別表十六（一）・定額法）"]]) + CRLF + depreciationScheduleRowsToCsv(form));

  if (form.notes.length > 0) {
    sections.push(buildCsvBlock([["■ 注記"], ...form.notes.map((note) => [note])]));
  }

  return sections.join(CRLF + CRLF) + CRLF;
}
