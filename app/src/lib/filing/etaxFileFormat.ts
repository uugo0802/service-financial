// e-Tax（国税）向け「下書きデータファイル」生成ロジック。
//
// 重要（税理士法対応・実装時点の制約。docs/cto-tech-architecture.md §1.1 参照）:
// - 国税庁が公開する、e-Taxソフト（WEB版）が実際にインポートできる正式フォーマット（拡張子 .xtx）の
//   生成仕様は、「e-Tax仕様書一覧」からのダウンロード申請が必要で、本実装時点ではまだ取得できていない
//   （アーキテクチャ文書 §1.1「要調査（今週中）」）。
// - そのため本モジュールは、正式なxtx/XMLスキーマの代替として、当社独自に定義した
//   「e-Tax向け下書きCSVスキーマ」（ETAX_DRAFT_SCHEMA_VERSION参照）を出力する。ユーザーはこのCSVの
//   内容を見ながら、e-Taxソフト（WEB版）へ内容を入力・突き合わせるための「参考下書きファイル」として
//   利用することを想定しており、e-Taxソフトへの自動インポートを保証するものではない。
//   正式なxtx仕様が確保でき次第、本モジュールの出力形式を置き換える前提とする。
// - 出力ファイルは常に「下書き・概算試算」であることを明記し、当社が申告書を作成・提出したことを
//   示すものではない。送信は必ずご本人がe-Taxソフト上で電子署名・送信する
//   （submissionSteps.ts の ETAX_SUBMISSION_STEPS を参照）。

import { IndividualEstimate } from "../tax/estimate";
import { CorporateEstimate } from "../tax/corporateEstimate";

const CRLF = "\r\n";

/**
 * 本モジュールが出力する下書きCSVスキーマのバージョン識別子。
 * 正式なxtx仕様に対応する際、この値を更新して互換性のない変更を明示すること。
 */
export const ETAX_DRAFT_SCHEMA_VERSION = "etax-draft-csv-v1";

export const ETAX_DRAFT_DISCLAIMER =
  "本データは所得税確定申告・法人税及び消費税の「下書き・概算試算」です。正式な申告書ではなく、当社が申告や税務代理を行うものではありません。" +
  "内容を必ずご自身で確認のうえ、e-Taxソフト（WEB版）等へご本人の権限で読み込み・電子署名・送信してください。";

/** RFC4180準拠のフィールドエスケープ（カンマ・二重引用符・改行を含む場合のみダブルクォートで囲む） */
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

function buildCsvBlock(rows: (string | number)[][]): string {
  return rows.map(toCsvRow).join(CRLF);
}

export const ETAX_DRAFT_FIELD_HEADERS = ["項目キー", "項目名", "値", "備考"] as const;

export interface EtaxDraftField {
  /** 将来の正式スキーマ移行時にも安定して参照できるよう付与した、本サービス独自のフィールド識別子 */
  key: string;
  label: string;
  value: string | number;
  note?: string;
}

export interface EtaxDraftFileMeta {
  /** 対象年分（個人）または事業年度末の西暦年（法人） */
  taxYear: number;
  /** 氏名（個人）または法人名。未指定の場合は空欄で出力し、本人が後から補記する想定 */
  taxpayerName?: string;
  /** テスト・スナップショットの再現性のため注入可能。未指定時は現在時刻を使用する */
  generatedAt?: Date;
}

export type EtaxDraftFileInput =
  | ({ taxpayerKind: "individual"; estimate: IndividualEstimate } & EtaxDraftFileMeta)
  | ({ taxpayerKind: "corporate"; estimate: CorporateEstimate } & EtaxDraftFileMeta);

function yesNo(value: boolean): string {
  return value ? "該当する可能性あり" : "該当なし";
}

function individualFields(estimate: IndividualEstimate): EtaxDraftField[] {
  return [
    { key: "tax_item", label: "税目", value: "所得税及び復興特別所得税（確定申告）" },
    { key: "total_income", label: "総収入金額", value: estimate.totalIncome },
    { key: "necessary_expenses", label: "必要経費", value: estimate.totalExpense },
    { key: "business_profit", label: "事業所得金額（総収入金額－必要経費）", value: estimate.businessProfit },
    { key: "blue_return_deduction", label: "青色申告特別控除額", value: estimate.blueReturnDeduction },
    { key: "social_insurance_deduction", label: "社会保険料控除額", value: estimate.socialInsuranceDeduction },
    {
      key: "life_insurance_paid_info",
      label: "生命保険料 年間支払額（参考）",
      value: estimate.lifeInsurancePaidInfo,
      note: "生命保険料控除額そのものではなく、年間支払額の参考表示です（控除額の上限計算は未対応）",
    },
    { key: "taxable_income", label: "課税される所得金額", value: estimate.taxableIncome },
    {
      key: "income_tax",
      label: "所得税額",
      value: estimate.incomeTax.tax,
      note: `適用税率（限界税率） ${estimate.incomeTax.marginalRate}%`,
    },
    { key: "reconstruction_surtax", label: "復興特別所得税額", value: estimate.reconstructionSurtax },
    {
      key: "total_income_tax",
      label: "申告納税額（所得税及び復興特別所得税の合計）",
      value: estimate.totalIncomeTax,
    },
    { key: "consumption_tax_sales", label: "消費税 課税売上に係る税額", value: estimate.consumptionTax.salesTax },
    {
      key: "consumption_tax_purchase",
      label: "消費税 課税仕入に係る税額",
      value: estimate.consumptionTax.purchaseTax,
    },
    {
      key: "consumption_tax_payable",
      label: "消費税及び地方消費税の合計（納付税額の概算）",
      value: estimate.consumptionTax.payable,
    },
    {
      key: "consumption_tax_exempt_likely",
      label: "消費税免税事業者に該当する可能性",
      value: yesNo(estimate.consumptionTax.isLikelyExempt),
    },
    ...estimate.assumptions.map((note, i) => ({ key: `assumption_${i + 1}`, label: "前提条件", value: note })),
  ];
}

function corporateFields(estimate: CorporateEstimate): EtaxDraftField[] {
  return [
    { key: "tax_item", label: "税目", value: "法人税・地方法人税・消費税（概算試算）" },
    { key: "revenue", label: "売上高（益金）", value: estimate.revenue },
    { key: "expenses", label: "経費（損金）", value: estimate.expenses },
    { key: "taxable_income", label: "所得金額", value: estimate.taxableIncome },
    { key: "corporate_tax", label: "法人税額", value: estimate.corporateTax },
    { key: "local_corporate_tax", label: "地方法人税額", value: estimate.localCorporateTax },
    { key: "total_national_tax", label: "国税合計（法人税＋地方法人税）", value: estimate.totalNationalTax },
    {
      key: "per_capita_tax_reference",
      label: "均等割（参考値）",
      value: estimate.perCapitaTaxReference,
      note: "e-Tax（国税）ではなくeLTAX（地方税）側で申告する項目です。参考表示のみで、この下書きファイルの提出対象には含まれません",
    },
    { key: "consumption_tax_sales", label: "消費税 課税売上に係る税額", value: estimate.consumptionTax.salesTax },
    {
      key: "consumption_tax_purchase",
      label: "消費税 課税仕入に係る税額",
      value: estimate.consumptionTax.purchaseTax,
    },
    {
      key: "consumption_tax_payable",
      label: "消費税及び地方消費税の合計（納付税額の概算）",
      value: estimate.consumptionTax.payable,
    },
    {
      key: "consumption_tax_exempt_likely",
      label: "消費税免税事業者に該当する可能性",
      value: yesNo(estimate.consumptionTax.isLikelyExempt),
    },
    ...estimate.assumptions.map((note, i) => ({ key: `assumption_${i + 1}`, label: "前提条件", value: note })),
  ];
}

/** 個人/法人いずれかのe-Tax下書きデータを、フィールドキー・項目名・値・備考の行データに正規化する */
export function etaxDraftFields(input: EtaxDraftFileInput): EtaxDraftField[] {
  return input.taxpayerKind === "individual" ? individualFields(input.estimate) : corporateFields(input.estimate);
}

/** e-Tax下書きデータのフィールド部分のみをCSV文字列に変換する（ヘッダー行を含む） */
export function etaxDraftFieldsToCsv(input: EtaxDraftFileInput): string {
  const rows: (string | number)[][] = [
    [...ETAX_DRAFT_FIELD_HEADERS],
    ...etaxDraftFields(input).map((f) => [f.key, f.label, f.value, f.note ?? ""]),
  ];
  return buildCsvBlock(rows);
}

/**
 * e-Tax（国税）向けの下書きデータファイルをCSV文字列として組み立てる。
 * 冒頭に免責文言・スキーマバージョン・生成日時・対象年分・氏名/名称を含め、
 * ダウンロード後もこれが「下書き」であることが常に分かるようにする。
 */
export function buildEtaxDraftCsv(input: EtaxDraftFileInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const sections: string[] = [];

  sections.push(
    buildCsvBlock([
      ["決算書作成から税務申告までワンクリック スグル - e-Tax 下書きデータファイル"],
      [`スキーマバージョン: ${ETAX_DRAFT_SCHEMA_VERSION}`],
      [`出力日時: ${generatedAt.toISOString()}`],
      [`対象年分/事業年度: ${input.taxYear}`],
      [`氏名/名称: ${input.taxpayerName ?? ""}`],
      [ETAX_DRAFT_DISCLAIMER],
    ])
  );

  sections.push(buildCsvBlock([["■ 下書きデータ"]]) + CRLF + etaxDraftFieldsToCsv(input));

  return sections.join(CRLF + CRLF) + CRLF;
}
