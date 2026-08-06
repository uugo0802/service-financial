import type { PaymentReportCategory } from "./paymentReportForm";
import { PAYMENT_REPORT_CATEGORIES } from "./paymentReportForm";

// ------------------------------------------------------------------
// 法定調書合計表（給与所得の源泉徴収票等の法定調書合計表）の下書き生成。
//
// 「法定調書合計表」は、会社(法人)・個人事業主が、その年中に作成した個々の
// 法定調書(給与所得の源泉徴収票・退職所得の源泉徴収票・報酬,料金,契約金及び
// 賞金の支払調書・不動産の使用料等の支払調書 等)を集計し、区分ごとの
// 人員・支払金額・源泉徴収税額の合計を記載して税務署へ提出する、いわば
// 「表紙」に相当する書類である(所得税法225条、227条の2等)。
//
// このモジュールは、個々の法定調書そのもの(支払調書=paymentReportForm.ts、
// 源泉徴収票=payroll/withholdingSlip.ts)を新たに計算するものではなく、それら
// 既存モジュールがすでに生成した下書きデータ(またはそれと構造的に互換な入力)を
// 受け取り、区分ごとに合計するだけの読み取り専用の集計モジュールである
// (depreciationScheduleForm.tsが、資産ごとの計算結果を別表の行に
// マッピングするだけであるのと同じ位置づけ)。
//
// 対象範囲・簡略化している点(コメントとして明示):
// - 「給与所得の源泉徴収票合計表」は、本アプリのwithholdingSlip.tsが対象と
//   する「年末調整をした受給者」のみを対象とする。中途就職者・災害減免者等、
//   年末調整をしていない受給者の区分別内訳(正式な様式にある「年末調整を
//   しなかったもの」の各内訳欄)には対応しない。
// - 「退職所得の源泉徴収票合計表」「不動産の使用料等の支払調書合計表」は、
//   本アプリに退職所得の源泉徴収票・不動産の使用料等の支払調書を生成する
//   モジュールが存在しないため、常に人員0・金額0の空欄として出力する
//   (該当する支払がある場合は、ご自身でこの下書きに追記・修正してください)。
// - 「報酬、料金、契約金及び賞金の支払調書合計表」は、paymentReportForm.ts が
//   対応する5区分(原稿料・講演料等/弁護士・税理士等の報酬/デザイン料/
//   外注費/その他の報酬・料金)のみを対象とする。paymentReportForm.tsの
//   コメントのとおり、馬主が受ける競馬の賞金・ホステス等の報酬など
//   金額基準が異なる区分はこのモジュールの対象外である。
// - 各法定調書について、実際に税務署への個別提出が必要な金額基準(役員の
//   給与は150万円超、それ以外の給与は500万円超 等)は受給者の役職・雇用形態
//   によって細かく異なり、本アプリはその判定を行わない。このモジュールは、
//   呼び出し側が渡した入力行の reportRequired(支払調書側)が明示的に false で
//   ない限り、すべて集計対象に含める(「提出すべきものだけを渡す」判断は
//   利用者側に委ねる)。
// ------------------------------------------------------------------

export const STATUTORY_REPORT_FORM_LABEL = "法定調書合計表";
export const STATUTORY_REPORT_FORM_TITLE = "給与所得の源泉徴収票等の法定調書合計表";

/** 給与所得の源泉徴収票合計表における、本アプリが対応する唯一の区分(年末調整をした受給者)のラベル */
export const SALARY_ROW_LABEL = "給与所得（年末調整をしたもの）";

export type StatutoryReportSectionId =
  | "salary"
  | "retirement"
  | "paymentReport"
  | "realEstateRent";

/** 法定調書合計表を構成する4つの個別合計表(区分別)のタイトル。 */
export const STATUTORY_REPORT_SECTION_TITLES: Record<StatutoryReportSectionId, string> = {
  salary: "給与所得の源泉徴収票合計表",
  retirement: "退職所得の源泉徴収票合計表",
  paymentReport: "報酬、料金、契約金及び賞金の支払調書合計表",
  realEstateRent: "不動産の使用料等の支払調書合計表",
};

const MIN_FISCAL_YEAR = 2000;
const MAX_FISCAL_YEAR = 2100;

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}を入力してください。`);
  }
}

// ------------------------------------------------------------------
// 入力型。
//
// paymentReportForm.ts の PaymentReportLine、payroll/withholdingSlip.ts の
// WithholdingSlipResult をそのまま渡せるよう、構造的に互換な最小限のフィールドを
// ここで定義する(この2ファイルは編集しない。型のみ import して利用する)。
// ------------------------------------------------------------------

/**
 * withholdingSlip.ts の buildWithholdingSlip が返す WithholdingSlipResult と
 * 構造的に互換な、給与所得の源泉徴収票の下書き1件分の最小入力。
 * WithholdingSlipResultをそのまま渡すことも、同じ形の別データを渡すこともできる。
 */
export interface StatutoryReportWithholdingSlipInput {
  employee: { name: string };
  /** 支払金額(年間の給与等の総支給額) */
  paymentAmount: number;
  /** 源泉徴収税額 */
  withholdingTaxAmount: number;
  /** 対象の年(西暦)。省略時は fiscalYear によるフィルタ対象にせず常に含める。 */
  fiscalYear?: number;
}

/**
 * paymentReportForm.ts の buildPaymentReportLines/buildPaymentReportFromTransactions が
 * 返す PaymentReportLine と構造的に互換な、支払調書の下書き1行分(支払先×区分)の最小入力。
 */
export interface StatutoryReportPaymentReportInput {
  payeeName: string;
  category: PaymentReportCategory;
  /** 支払金額(源泉徴収前の年間合計) */
  grossAmount: number;
  /** 源泉徴収税額(年間合計) */
  withholdingTax: number;
  /**
   * この行について、支払調書の提出が必要と判定されているか
   * (PaymentReportLine.reportRequiredをそのまま渡せる)。
   * 明示的に false の行のみ集計から除外する。省略時(true扱い)・未指定の場合は
   * 集計対象に含める(「提出対象のみを渡す」運用を許容するため)。
   */
  reportRequired?: boolean;
}

/** 提出者(会社・個人事業主)情報。withholdingSlip.ts の WithholdingSlipPayerInfo と同じ形。 */
export interface StatutoryReportSubmitterInfo {
  /** 提出者の名称(会社名または個人事業主の氏名・屋号) */
  name: string;
  /** 提出者の住所(所在地、任意) */
  address?: string;
  /** 法人番号(13桁、個人事業主の場合は省略可) */
  corporateNumber?: string;
  /** 代表者氏名(任意) */
  representativeName?: string;
  /** 提出先税務署名(任意) */
  taxOfficeName?: string;
}

export interface BuildStatutoryReportSummaryInput {
  /** 対象の年(西暦、例: 2026) */
  fiscalYear: number;
  submitter: StatutoryReportSubmitterInfo;
}

// ------------------------------------------------------------------
// 出力型。
// ------------------------------------------------------------------

/** 法定調書合計表の1区分あたりの集計行(正式な様式の「区分」「人員」「支払金額」「源泉徴収税額」欄に相当)。 */
export interface StatutoryReportCategoryRow {
  category: string;
  /** 人員(件数)。この区分に該当する法定調書(受給者・支払先)の数。 */
  personCount: number;
  /** 支払金額の合計(円) */
  paymentAmount: number;
  /** 源泉徴収税額の合計(円) */
  withholdingTaxAmount: number;
}

export interface StatutoryReportSection {
  id: StatutoryReportSectionId;
  title: string;
  /** この区分別合計表を本アプリが実データから集計できるか(false の場合、常に空欄)。 */
  supported: boolean;
  /** 区分ごとの集計行(該当データがない区分の行は含めない)。 */
  rows: StatutoryReportCategoryRow[];
  /** rows の合計(この個別合計表全体の小計)。 */
  subtotal: StatutoryReportCategoryRow;
  /** この個別合計表に関する注記。 */
  notes: string[];
}

export interface StatutoryReportOverallTotals {
  /** 全区分を通じた提出枚数(人員)の合計。 */
  totalDocumentCount: number;
  /** 全区分を通じた支払金額の合計。 */
  totalPaymentAmount: number;
  /** 全区分を通じた源泉徴収税額の合計。 */
  totalWithholdingTaxAmount: number;
}

export interface StatutoryReportSummaryForm {
  fiscalYear: number;
  fiscalYearLabel: string;
  submitter: StatutoryReportSubmitterInfo;
  formLabel: typeof STATUTORY_REPORT_FORM_LABEL;
  formTitle: typeof STATUTORY_REPORT_FORM_TITLE;
  sections: StatutoryReportSection[];
  overallTotals: StatutoryReportOverallTotals;
  /** この下書きに関する注記(免責事項・対象外区分の案内等)。 */
  assumptions: string[];
}

// ------------------------------------------------------------------
// 集計ロジック。
// ------------------------------------------------------------------

function emptyRow(category: string): StatutoryReportCategoryRow {
  return { category, personCount: 0, paymentAmount: 0, withholdingTaxAmount: 0 };
}

function addRow(acc: StatutoryReportCategoryRow, row: StatutoryReportCategoryRow): StatutoryReportCategoryRow {
  return {
    category: acc.category,
    personCount: acc.personCount + row.personCount,
    paymentAmount: acc.paymentAmount + row.paymentAmount,
    withholdingTaxAmount: acc.withholdingTaxAmount + row.withholdingTaxAmount,
  };
}

function sumCategoryRows(rows: StatutoryReportCategoryRow[], subtotalLabel = "小計"): StatutoryReportCategoryRow {
  return rows.reduce((acc, row) => addRow(acc, row), emptyRow(subtotalLabel));
}

function filterByFiscalYear<T extends { fiscalYear?: number }>(records: T[], fiscalYear: number): T[] {
  return records.filter((r) => r.fiscalYear == null || r.fiscalYear === fiscalYear);
}

function filterReportRequired(
  records: StatutoryReportPaymentReportInput[]
): StatutoryReportPaymentReportInput[] {
  return records.filter((r) => r.reportRequired !== false);
}

function buildSalarySection(
  records: StatutoryReportWithholdingSlipInput[],
  fiscalYear: number
): StatutoryReportSection {
  const filtered = filterByFiscalYear(records, fiscalYear);

  const rows: StatutoryReportCategoryRow[] =
    filtered.length === 0
      ? []
      : [
          filtered.reduce(
            (acc, r) =>
              addRow(acc, {
                category: SALARY_ROW_LABEL,
                personCount: 1,
                paymentAmount: r.paymentAmount,
                withholdingTaxAmount: r.withholdingTaxAmount,
              }),
            emptyRow(SALARY_ROW_LABEL)
          ),
        ];

  const notes = [
    "年末調整をした受給者のみを対象としています(本アプリのpayroll/withholdingSlip.tsが対象とする範囲と同じ)。中途就職者・災害減免者等、年末調整をしなかった受給者の内訳には対応していません。",
  ];

  return {
    id: "salary",
    title: STATUTORY_REPORT_SECTION_TITLES.salary,
    supported: true,
    rows,
    subtotal: sumCategoryRows(rows, "合計"),
    notes,
  };
}

function buildRetirementSection(): StatutoryReportSection {
  return {
    id: "retirement",
    title: STATUTORY_REPORT_SECTION_TITLES.retirement,
    supported: false,
    rows: [],
    subtotal: emptyRow("合計"),
    notes: [
      "本アプリには退職所得の源泉徴収票の下書きを作成する機能がまだないため、この区分は常に0件として出力しています。退職金の支払がある場合は、ご自身で人員・支払金額・源泉徴収税額を確認のうえ、この下書きに追記してください。",
    ],
  };
}

function buildPaymentReportSection(
  records: StatutoryReportPaymentReportInput[]
): StatutoryReportSection {
  const eligible = filterReportRequired(records);

  const byCategory = new Map<PaymentReportCategory, StatutoryReportCategoryRow>();
  for (const category of PAYMENT_REPORT_CATEGORIES) {
    byCategory.set(category, emptyRow(category));
  }
  for (const r of eligible) {
    const current = byCategory.get(r.category);
    if (!current) continue;
    byCategory.set(
      r.category,
      addRow(current, {
        category: r.category,
        personCount: 1,
        paymentAmount: r.grossAmount,
        withholdingTaxAmount: r.withholdingTax,
      })
    );
  }

  const rows = PAYMENT_REPORT_CATEGORIES.map((category) => byCategory.get(category)!).filter(
    (row) => row.personCount > 0
  );

  return {
    id: "paymentReport",
    title: STATUTORY_REPORT_SECTION_TITLES.paymentReport,
    supported: true,
    rows,
    subtotal: sumCategoryRows(rows, "合計"),
    notes: [
      "paymentReportForm.ts が対応する5区分(原稿料・講演料等/弁護士・税理士等の報酬/デザイン料/外注費/その他の報酬・料金)のみを対象としています。馬主が受ける競馬の賞金・ホステス等の報酬など、金額基準や計算方法が異なる区分はこの下書きの対象外です。",
      "各行に reportRequired: false が明示された入力は、提出不要と判定済みのものとして集計から除外しています。",
    ],
  };
}

function buildRealEstateRentSection(): StatutoryReportSection {
  return {
    id: "realEstateRent",
    title: STATUTORY_REPORT_SECTION_TITLES.realEstateRent,
    supported: false,
    rows: [],
    subtotal: emptyRow("合計"),
    notes: [
      "本アプリには不動産の使用料等の支払調書の下書きを作成する機能がまだないため、この区分は常に0件として出力しています。事務所・駐車場等の賃借料の支払がある場合は、ご自身で人員・支払金額を確認のうえ、この下書きに追記してください。",
    ],
  };
}

/** 画面・帳票下部に表示する前提・注意事項。 */
export const STATUTORY_REPORT_SUMMARY_ASSUMPTIONS: string[] = [
  "この一覧は「法定調書合計表」の下書きデータです。正式な法定調書ではなく、税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。下書きです。提出はご自身の責任で行ってください。",
  "この帳票は、本アプリの他の機能(支払調書の下書き・源泉徴収票の下書き)がすでに作成した集計結果を区分ごとに合計するだけの機能であり、新たな税務判定は行いません。個々の法定調書の内容(氏名・金額・提出要否等)は、それぞれの下書き画面でご確認ください。",
  "退職所得の源泉徴収票合計表・不動産の使用料等の支払調書合計表は、対応する下書き作成機能が本アプリにまだないため、常に0件で出力されます。該当する支払がある場合は、ご自身で内容を確認のうえ追記してください。",
  "実際の提出(e-Tax等)は、この画面では行いません。下書きの内容を確認のうえ、ご自身で提出手続きを行ってください。",
];

/**
 * 支払調書の下書き集計(paymentReportForm.ts由来)と源泉徴収票の下書き(withholdingSlip.ts由来)から、
 * 法定調書合計表の下書きを組み立てる。
 *
 * このモジュール自体は金額の計算を一切行わず、渡された入力を区分ごとに合計するだけの
 * 純粋関数である。
 *
 * @param paymentReportRecords 支払調書(報酬,料金,契約金及び賞金)の下書き行の配列。
 *   paymentReportForm.ts の buildPaymentReportLines/buildPaymentReportFromTransactions の
 *   戻り値(PaymentReportLine[])をそのまま渡せる。
 * @param withholdingSlipRecords 給与所得の源泉徴収票の下書きの配列。
 *   payroll/withholdingSlip.ts の buildWithholdingSlip の戻り値(WithholdingSlipResult)を
 *   要素とする配列をそのまま渡せる。
 * @param meta 対象の年・提出者情報。
 * @throws 対象の年が整数でない・範囲外、提出者名称が未入力の場合
 */
export function buildStatutoryReportSummaryForm(
  paymentReportRecords: StatutoryReportPaymentReportInput[],
  withholdingSlipRecords: StatutoryReportWithholdingSlipInput[],
  meta: BuildStatutoryReportSummaryInput
): StatutoryReportSummaryForm {
  const { fiscalYear, submitter } = meta;

  if (!Number.isInteger(fiscalYear) || fiscalYear < MIN_FISCAL_YEAR || fiscalYear > MAX_FISCAL_YEAR) {
    throw new Error(`対象の年は${MIN_FISCAL_YEAR}〜${MAX_FISCAL_YEAR}の範囲の西暦(整数)で入力してください。`);
  }
  assertNonEmptyString(submitter?.name, "提出者の名称");

  const sections: StatutoryReportSection[] = [
    buildSalarySection(withholdingSlipRecords, fiscalYear),
    buildRetirementSection(),
    buildPaymentReportSection(paymentReportRecords),
    buildRealEstateRentSection(),
  ];

  const overallTotals = sections.reduce<StatutoryReportOverallTotals>(
    (acc, section) => ({
      totalDocumentCount: acc.totalDocumentCount + section.subtotal.personCount,
      totalPaymentAmount: acc.totalPaymentAmount + section.subtotal.paymentAmount,
      totalWithholdingTaxAmount: acc.totalWithholdingTaxAmount + section.subtotal.withholdingTaxAmount,
    }),
    { totalDocumentCount: 0, totalPaymentAmount: 0, totalWithholdingTaxAmount: 0 }
  );

  return {
    fiscalYear,
    fiscalYearLabel: `${fiscalYear}年分`,
    submitter,
    formLabel: STATUTORY_REPORT_FORM_LABEL,
    formTitle: STATUTORY_REPORT_FORM_TITLE,
    sections,
    overallTotals,
    assumptions: [...STATUTORY_REPORT_SUMMARY_ASSUMPTIONS],
  };
}
