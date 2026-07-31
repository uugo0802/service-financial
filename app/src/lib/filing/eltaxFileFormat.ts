// eLTAX（地方税）向け「下書きデータファイル」生成ロジック。
//
// 重要（税理士法対応・実装時点の制約。docs/cto-tech-architecture.md §1.2 参照）:
// - 地方税共同機構が提供するeLTAX対応ソフトウェア向けの送受信モジュール・電子署名モジュール・
//   仕様書は著作権保護対象であり、利用には地方税共同機構への開発者登録・審査が必要で、
//   本実装時点ではまだ登録・取得できていない。
// - そのため本モジュールは、正式仕様の代替として当社独自に定義した「eLTAX向け下書きCSVスキーマ」
//   （ELTAX_DRAFT_SCHEMA_VERSION参照）を出力する。ユーザーはこのCSVの内容を見ながら、
//   「PCdesk」（Web版/インストール版）へ内容を入力・突き合わせるための「参考下書きファイル」として
//   利用することを想定しており、PCdeskへの自動インポートを保証するものではない。
//   正式仕様が確保でき次第、本モジュールの出力形式を置き換える前提とする。
// - 出力ファイルは常に「下書き・参考情報」であることを明記し、当社が申告書を作成・提出したことを
//   示すものではない。送信は必ずご本人がPCdesk上で電子署名・送信する
//   （submissionSteps.ts の ELTAX_SUBMISSION_STEPS を参照）。
// - eLTAXは都道府県・市区町村ごとに提出先・税率が異なり、所得割額の按分計算は自治体により
//   大きく異なるため、本モジュールでは均等割の参考値および国税と共通の所得金額の参考値のみを
//   出力し、所得割額そのものの計算は行わない（tax/corporateEstimate.tsの前提と同じ）。

import { IndividualEstimate } from "../tax/estimate";
import { CorporateEstimate } from "../tax/corporateEstimate";

const CRLF = "\r\n";

/**
 * 本モジュールが出力する下書きCSVスキーマのバージョン識別子。
 * 正式なeLTAX送受信仕様に対応する際、この値を更新して互換性のない変更を明示すること。
 */
export const ELTAX_DRAFT_SCHEMA_VERSION = "eltax-draft-csv-v1";

export const ELTAX_DRAFT_DISCLAIMER =
  "本データは法人住民税・法人事業税（または個人事業税）の「下書き・参考情報」です。正式な申告書ではなく、当社が申告や税務代理を行うものではありません。" +
  "所得割額の按分計算は含んでいません。提出先自治体・税率をご自身でご確認のうえ、PCdesk等へご本人の権限で読み込み・電子署名・送信してください。";

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

export const ELTAX_DRAFT_FIELD_HEADERS = ["項目キー", "項目名", "値", "備考"] as const;

export interface EltaxDraftField {
  /** 将来の正式スキーマ移行時にも安定して参照できるよう付与した、本サービス独自のフィールド識別子 */
  key: string;
  label: string;
  value: string | number;
  note?: string;
}

export interface EltaxDraftFileMeta {
  /** 対象年分（個人）または事業年度末の西暦年（法人） */
  taxYear: number;
  /** 氏名（個人）または法人名。未指定の場合は空欄で出力し、本人が後から補記する想定 */
  taxpayerName?: string;
  /** 提出先の都道府県・市区町村。未指定の場合は空欄で出力し、PCdesk上で本人が選択する想定 */
  municipality?: string;
  /** テスト・スナップショットの再現性のため注入可能。未指定時は現在時刻を使用する */
  generatedAt?: Date;
}

export type EltaxDraftFileInput =
  | ({ taxpayerKind: "individual"; estimate: IndividualEstimate } & EltaxDraftFileMeta)
  | ({ taxpayerKind: "corporate"; estimate: CorporateEstimate } & EltaxDraftFileMeta);

function individualFields(estimate: IndividualEstimate): EltaxDraftField[] {
  return [
    {
      key: "tax_item",
      label: "税目",
      value: "個人住民税・個人事業税（参考）",
      note:
        "個人の住民税は通常、所得税確定申告データが税務署から自治体へ連携されるため、別途eLTAX申告は不要な場合がほとんどです。" +
        "事業税の申告が必要かはご自身の状況（業種・所得水準等）により異なります",
    },
    { key: "business_profit_reference", label: "事業所得金額（参考、所得税確定申告と同一の概算値）", value: estimate.businessProfit },
    { key: "taxable_income_reference", label: "課税される所得金額（参考、所得税確定申告と同一の概算値）", value: estimate.taxableIncome },
    {
      key: "note_individual_business_tax",
      label: "備考（個人事業税）",
      value:
        "個人事業税の税率・事業主控除・非課税業種の判定は本サービスでは行っていません。申告要否・金額はご自身または税理士等の専門家にご確認ください。",
    },
    ...estimate.assumptions.map((note, i) => ({ key: `assumption_${i + 1}`, label: "前提条件", value: note })),
  ];
}

function corporateFields(estimate: CorporateEstimate): EltaxDraftField[] {
  return [
    { key: "tax_item", label: "税目", value: "法人住民税・法人事業税（概算試算）" },
    { key: "revenue_reference", label: "売上高（参考、法人税と同一の概算値）", value: estimate.revenue },
    { key: "expenses_reference", label: "経費（参考、法人税と同一の概算値）", value: estimate.expenses },
    { key: "taxable_income_reference", label: "所得金額（参考、法人税と同一の概算値）", value: estimate.taxableIncome },
    {
      key: "per_capita_tax",
      label: "均等割額（参考値）",
      value: estimate.perCapitaTaxReference,
      note: "資本金1,000万円以下・従業者数50人以下・東京都23区内を仮定した参考値です。実際の金額は自治体・資本金・従業者数により異なります",
    },
    {
      key: "note_income_levy",
      label: "備考（所得割）",
      value:
        "法人住民税・法人事業税の所得割額は自治体・税率により変動するため、本サービスでは計算していません。提出先自治体の税率をご自身でご確認ください。",
    },
    ...estimate.assumptions.map((note, i) => ({ key: `assumption_${i + 1}`, label: "前提条件", value: note })),
  ];
}

/** 個人/法人いずれかのeLTAX下書きデータを、フィールドキー・項目名・値・備考の行データに正規化する */
export function eltaxDraftFields(input: EltaxDraftFileInput): EltaxDraftField[] {
  return input.taxpayerKind === "individual" ? individualFields(input.estimate) : corporateFields(input.estimate);
}

/** eLTAX下書きデータのフィールド部分のみをCSV文字列に変換する（ヘッダー行を含む） */
export function eltaxDraftFieldsToCsv(input: EltaxDraftFileInput): string {
  const rows: (string | number)[][] = [
    [...ELTAX_DRAFT_FIELD_HEADERS],
    ...eltaxDraftFields(input).map((f) => [f.key, f.label, f.value, f.note ?? ""]),
  ];
  return buildCsvBlock(rows);
}

/**
 * eLTAX（地方税）向けの下書きデータファイルをCSV文字列として組み立てる。
 * 冒頭に免責文言・スキーマバージョン・生成日時・対象年分・氏名/名称・提出先自治体を含め、
 * ダウンロード後もこれが「下書き」であることが常に分かるようにする。
 */
export function buildEltaxDraftCsv(input: EltaxDraftFileInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const sections: string[] = [];

  sections.push(
    buildCsvBlock([
      ["税務申告AI ジャービス - eLTAX 下書きデータファイル"],
      [`スキーマバージョン: ${ELTAX_DRAFT_SCHEMA_VERSION}`],
      [`出力日時: ${generatedAt.toISOString()}`],
      [`対象年分/事業年度: ${input.taxYear}`],
      [`氏名/名称: ${input.taxpayerName ?? ""}`],
      [`提出先自治体: ${input.municipality ?? "（未選択。PCdesk上でご選択ください）"}`],
      [ELTAX_DRAFT_DISCLAIMER],
    ])
  );

  sections.push(buildCsvBlock([["■ 下書きデータ"]]) + CRLF + eltaxDraftFieldsToCsv(input));

  return sections.join(CRLF + CRLF) + CRLF;
}
