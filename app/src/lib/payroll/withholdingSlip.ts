// ------------------------------------------------------------------
// 免責: このモジュールは、年末調整の計算結果（yearEndAdjustment.ts）から、
// 会社が年末調整後に発行しなければならない「給与所得の源泉徴収票」の
// 下書きデータを組み立てるものです。
//
// 源泉徴収票は、給与等の支払者（会社）が、その年の給与等の支払を受けた者
// （役員・従業員）に対して、翌年1月31日までに交付しなければならない法定の
// 書類です（所得税法226条）。あわせて、一定額を超える場合等は税務署へ、
// また市区町村へ「給与支払報告書」として提出する必要があります。
//
// このモジュールが生成するのは、あくまで yearEndAdjustment.ts（年末調整の
// 概算シミュレーション）の計算結果に基づく「下書き」です。yearEndAdjustment.ts
// が対象外としている生命保険料控除・地震保険料控除・住宅ローン控除（住宅借入金等
// 特別控除）・ふるさと納税等の寄附金控除・医療費控除・小規模企業共済等掛金控除・
// 所得金額調整控除は、このモジュールでも同様に反映しません（該当欄は空欄／0円の
// まま出力し、unsupportedFieldsに一覧します）。
//
// 【個人番号（マイナンバー）について】
// 本アプリはマイナンバー非保持の原則（docs/cto-tech-architecture.md 4.2節「データ
// セキュリティ最低要件」）に従い、個人番号を一切収集・保持しません。実務上も、
// 給与所得者に交付する源泉徴収票（本人交付用）には個人番号を記載しない取扱いのため、
// この省略は実際の運用とも整合します。税務署提出用・市区町村提出用（給与支払報告書等）
// に個人番号が必要な場合は、この下書きを基に、ご自身が別途管理する個人番号情報を
// 手作業で追記してください。
//
// このツールは源泉徴収票の下書きを機械的に組み立てるのみであり、税理士法上の
// 税務代理・税務書類の作成・個別具体的な税務相談には該当しません。正式な発行・
// 提出前には必ず内容をご自身でご確認ください。
// ------------------------------------------------------------------

import type { YearEndAdjustmentResult } from "./yearEndAdjustment";
import type { WithholdingResult } from "./withholding";
import type { BonusWithholdingResult } from "./bonusWithholding";

const MIN_FISCAL_YEAR = 2000;
const MAX_FISCAL_YEAR = 2100;

/** 令和元年（2019年）を基準に「令和◯年分」ラベルを組み立てる */
const REIWA_ERA_START_YEAR = 2019;

const DEFAULT_PAYMENT_KIND = "給与・賞与";

/**
 * このモジュールでは金額を計算せず、空欄／0円のまま出力している法定の欄の一覧。
 * 実際の源泉徴収票にはこれ以外にも細かい欄があるが、代表的なものに限定して列挙する。
 */
const UNSUPPORTED_FIELDS = [
  "生命保険料の控除額",
  "地震保険料の控除額",
  "住宅借入金等特別控除の額",
  "所得金額調整控除額",
  "（源泉・特別）控除対象配偶者の区分・配偶者特別控除の額",
  "国民年金保険料等の金額（社会保険料の内訳）",
  "旧生命保険料・介護医療保険料・旧個人年金保険料の内訳",
];

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}を入力してください。`);
  }
}

/**
 * 西暦年（例: 2026）から「令和◯年分（2026年）」形式の表示ラベルを作る。
 * 令和元年（2019年）より前の年は、和暦への変換を行わず西暦のみのラベルを返す
 * （このモジュールが想定する用途では令和以降の年のみを扱うため）。
 */
export function formatFiscalYearLabel(fiscalYear: number): string {
  if (!Number.isInteger(fiscalYear) || fiscalYear < REIWA_ERA_START_YEAR) {
    return `${fiscalYear}年分`;
  }
  const reiwaYear = fiscalYear - REIWA_ERA_START_YEAR + 1;
  const eraNumber = reiwaYear === 1 ? "元" : String(reiwaYear);
  return `令和${eraNumber}年分（${fiscalYear}年）`;
}

export interface WithholdingSlipEmployeeInfo {
  /** 支払を受ける者（従業員・役員）の氏名 */
  name: string;
  /** 支払を受ける者の住所又は居所（任意） */
  address?: string;
  /** 社内管理用の受給者番号など（任意）。個人番号（マイナンバー）はここでは扱わない。 */
  employeeNumber?: string;
}

export interface WithholdingSlipPayerInfo {
  /** 支払者（会社）の名称 */
  companyName: string;
  /** 支払者の住所（所在地、任意） */
  address?: string;
  /** 法人番号（13桁、任意） */
  corporateNumber?: string;
  /** 代表者氏名（任意。役員のみの法人等で記載する場合） */
  representativeName?: string;
}

export interface WithholdingSlipInput {
  /** 対象の年（西暦、例: 2026） */
  fiscalYear: number;
  employee: WithholdingSlipEmployeeInfo;
  payer: WithholdingSlipPayerInfo;
  /** yearEndAdjustment.ts（calculateYearEndAdjustment）で計算した、その年の年末調整結果 */
  yearEndAdjustment: YearEndAdjustmentResult;
  /** 種別（「給与・賞与」等）。省略時は既定値（"給与・賞与"）を使用する。 */
  paymentKind?: string;
}

export interface WithholdingSlipResult {
  fiscalYear: number;
  fiscalYearLabel: string;
  employee: WithholdingSlipEmployeeInfo;
  payer: WithholdingSlipPayerInfo;
  paymentKind: string;
  /** 支払金額（年間の給与等の総支給額） */
  paymentAmount: number;
  /** 給与所得控除後の金額（調整控除後。本ツールは所得金額調整控除には未対応） */
  amountAfterSalaryIncomeDeduction: number;
  /** 所得控除の額の合計額（社会保険料控除＋基礎控除＋扶養控除の概算合計） */
  totalIncomeDeductions: number;
  /** 源泉徴収税額（年間の所得税及び復興特別所得税の確定額） */
  withholdingTaxAmount: number;
  /** 社会保険料等の金額 */
  socialInsurancePremiumAmount: number;
  /** 控除対象扶養親族の数（人。本ツールでの一律近似） */
  dependentCount: number;
  /** 参考情報: その年にすでに源泉徴収済みの合計額（月次給与・賞与分の合計） */
  alreadyWithheld: number;
  /** 参考情報: 年末調整による差額（正=追加徴収が必要、負=還付） */
  yearEndAdjustmentDifference: number;
  yearEndAdjustmentOutcome: YearEndAdjustmentResult["outcome"];
  /** このツールでは金額を計算せず、空欄／0円のまま出力している法定の欄の一覧 */
  unsupportedFields: string[];
  assumptions: string[];
}

/**
 * yearEndAdjustment.ts の計算結果（年間の給与所得控除・所得控除・年間税額の確定額）と、
 * 支払者・受給者の識別情報から、給与所得の源泉徴収票の下書きデータを組み立てる。
 *
 * 実際の計算（給与所得控除・所得税額の算出など）は一切行わず、yearEndAdjustment.ts の
 * 出力をそのまま源泉徴収票の様式にマッピングするだけの純粋関数である。
 *
 * @throws 対象の年が整数でない・範囲外、氏名や会社名が未入力、年末調整結果が
 *   指定されていない場合
 */
export function buildWithholdingSlip(input: WithholdingSlipInput): WithholdingSlipResult {
  const { fiscalYear, employee, payer, yearEndAdjustment, paymentKind } = input;

  if (!Number.isInteger(fiscalYear) || fiscalYear < MIN_FISCAL_YEAR || fiscalYear > MAX_FISCAL_YEAR) {
    throw new Error(`対象の年は${MIN_FISCAL_YEAR}〜${MAX_FISCAL_YEAR}の範囲の西暦（整数）で入力してください。`);
  }
  if (!yearEndAdjustment) {
    throw new Error("年末調整の計算結果（yearEndAdjustment.tsの出力）を指定してください。");
  }
  assertNonEmptyString(employee?.name, "支払を受ける者の氏名");
  assertNonEmptyString(payer?.companyName, "支払者（会社）の名称");

  const totalIncomeDeductions =
    yearEndAdjustment.annualSocialInsurancePremium +
    yearEndAdjustment.basicDeduction +
    yearEndAdjustment.dependentDeduction;

  return {
    fiscalYear,
    fiscalYearLabel: formatFiscalYearLabel(fiscalYear),
    employee,
    payer,
    paymentKind: paymentKind?.trim() || DEFAULT_PAYMENT_KIND,
    paymentAmount: yearEndAdjustment.annualGrossCompensation,
    amountAfterSalaryIncomeDeduction: yearEndAdjustment.salaryIncome,
    totalIncomeDeductions,
    withholdingTaxAmount: yearEndAdjustment.totalAnnualTaxDue,
    socialInsurancePremiumAmount: yearEndAdjustment.annualSocialInsurancePremium,
    dependentCount: yearEndAdjustment.dependentCount,
    alreadyWithheld: yearEndAdjustment.alreadyWithheld,
    yearEndAdjustmentDifference: yearEndAdjustment.difference,
    yearEndAdjustmentOutcome: yearEndAdjustment.outcome,
    unsupportedFields: [...UNSUPPORTED_FIELDS],
    assumptions: [
      ...yearEndAdjustment.assumptions,
      "個人番号（マイナンバー）は収集・保持していません。本人交付用の源泉徴収票には法令上も個人番号の記載は不要ですが、税務署・市区町村提出用（給与支払報告書等）に個人番号が必要な場合は、ご自身で別途対応してください。",
      "所得金額調整控除、配偶者控除・配偶者特別控除の区分別金額、生命保険料・地震保険料控除、住宅借入金等特別控除などは計算しておらず、該当欄は空欄のまま出力しています（unsupportedFieldsを参照してください）。該当する場合は必ず手動で確認・追記してください。",
      "この書類は源泉徴収票の下書きであり、正式な法定調書ではありません。交付・提出前に記載内容（氏名・住所・支払金額等）を必ずご自身でご確認ください。税務代理・税務書類の作成・個別具体的な税務相談には該当しません。",
    ],
  };
}

/**
 * withholding.ts（月々の源泉徴収）・bonusWithholding.ts（賞与の源泉徴収）の計算結果の
 * 配列から、源泉徴収税額（withholdingTax）の合計を求める。
 *
 * yearEndAdjustment.ts の monthlyWithholdingTotal（number | number[]）へそのまま渡す
 * 数値、または源泉徴収票の下書き作成前に「その年にすでに源泉徴収した税額の合計」を
 * 確認する用途を想定している。
 */
export function sumWithheldTax(
  records: Array<Pick<WithholdingResult, "withholdingTax"> | Pick<BonusWithholdingResult, "withholdingTax">>
): number {
  return records.reduce((sum, r) => sum + r.withholdingTax, 0);
}
