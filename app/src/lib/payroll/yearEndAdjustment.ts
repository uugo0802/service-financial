// ------------------------------------------------------------------
// 免責: これはマイクロ法人の一人代表（役員）が自身に支払った1年分の役員報酬・給与
// （月々の給与＋賞与の合計）について、年末調整の「概算シミュレーション」を行うモジュールです。
//
// 実際の年末調整は、以下のような手順・書類（扶養控除等申告書、保険料控除申告書、
// 基礎控除申告書など）に基づく多数の所得控除を反映して、その年に納めるべき
// 正しい年間の所得税・復興特別所得税額を確定させ、その年の毎月・毎回の源泉徴収税額
// （withholding.ts・bonusWithholding.tsで概算した金額の合計）との差額を「徴収不足額」
// （追加で徴収・納付が必要な金額）または「過納額」（本人に還付すべき金額）として
// 清算する手続きです。
//
// このモジュールは、年末調整の全体像を体験できる最小限のシミュレーションとして、
// 以下の代表的な要素のみを対象にしています:
//   - 給与所得控除（給与等の総支給額から、国税庁公表の速算式で決まる法定の控除額を差し引く）
//   - 社会保険料控除（健康保険・厚生年金保険料等の年間合計額を全額控除）
//   - 基礎控除（合計所得金額2,400万円以下を前提に、一律48万円を適用）
//   - 扶養控除（扶養親族等の数に応じて、一律38万円/人を適用する簡略化）
//
// 【重要: 以下は対象外（本モジュールでは一切計算しません）】
//   - 生命保険料控除・地震保険料控除
//   - 住宅ローン控除（住宅借入金等特別控除。これは所得控除ではなく税額控除であり、
//     年末調整の枠組みが大きく異なるため特に対象外）
//   - ふるさと納税等の寄附金控除（ワンストップ特例を除き、通常は確定申告が必要）
//   - 医療費控除（原則、年末調整では反映できず確定申告が必要）
//   - 小規模企業共済等掛金控除（iDeCo・小規模企業共済等）
//   - 配偶者控除・配偶者特別控除の所得制限に応じた段階的な金額の違い（本モジュールでは
//     「扶養親族等の数」に含めて一律38万円/人として簡略化しています）
//   - 特定扶養親族（19歳以上23歳未満、63万円）・老人扶養親族（70歳以上、48万円/58万円）
//     など、扶養親族の年齢・同居区分による控除額の違い（すべて一律38万円/人として近似）
//   - 基礎控除の所得制限（合計所得金額2,400万円超で段階的に減額、2,500万円超で0円）
//   - 給与所得控除の実務上の1,000円未満の丸め処理・特定支出控除等の特例
//
// 上記のいずれかに該当する場合、本モジュールの計算結果は実際の年末調整額と
// 大きくずれる可能性があります。正式な年末調整の実施・法定調書（源泉徴収票等）の
// 作成にあたっては、必ず国税庁公表の最新の資料を確認し、必要に応じて税理士等の
// 専門家にご相談ください。
//
// このツールは年末調整の概算シミュレーションを示すのみであり、税理士法上の
// 税務代理・税務書類の作成・個別具体的な税務相談には該当しません。また、本モジュールは
// 実際の年末調整処理（法定調書の作成・提出、過不足額の実際の清算処理）を代行するもの
// ではありません。
// ------------------------------------------------------------------

const RECONSTRUCTION_SURTAX_RATE = 0.021; // 復興特別所得税＝基準所得税額×2.1%（estimate.tsと同じ考え方）

/** 基礎控除（合計所得金額2,400万円以下を前提とした一律額。高所得者の段階的減額は考慮しない） */
const BASIC_DEDUCTION = 480_000;

/**
 * 扶養控除（1人あたり、年額）。実際は扶養親族の年齢・同居区分により38万円/48万円/58万円/63万円と
 * 異なるが、本モジュールでは一般的な扶養親族の額（38万円）に一律近似する。
 */
const PER_DEPENDENT_ANNUAL_DEDUCTION = 380_000;

interface SalaryIncomeDeductionBracket {
  /** この給与等の総支給額（円）以下の場合に適用される区分 */
  upTo: number;
  /** 給与所得控除額を算出する式（国税庁公表の速算式、令和2年分以降） */
  calc: (grossCompensation: number) => number;
}

// 給与所得控除の速算表（令和2年分以降。国税庁公表の速算式をそのまま使用しており、
// この部分は「近似」ではなく法定の計算式そのもの）。
const SALARY_INCOME_DEDUCTION_BRACKETS: SalaryIncomeDeductionBracket[] = [
  { upTo: 1_625_000, calc: () => 550_000 },
  { upTo: 1_800_000, calc: (g) => g * 0.4 - 100_000 },
  { upTo: 3_600_000, calc: (g) => g * 0.3 + 80_000 },
  { upTo: 6_600_000, calc: (g) => g * 0.2 + 440_000 },
  { upTo: 8_500_000, calc: (g) => g * 0.1 + 1_100_000 },
  { upTo: Infinity, calc: () => 1_950_000 },
];

/** 給与等の総支給額から、給与所得控除額（法定の速算式）を計算する */
function calcSalaryIncomeDeduction(grossCompensation: number): number {
  const bracket = SALARY_INCOME_DEDUCTION_BRACKETS.find((b) => grossCompensation <= b.upTo)!;
  return Math.max(0, Math.min(grossCompensation, Math.floor(bracket.calc(grossCompensation))));
}

interface IncomeTaxBracket {
  upTo: number; // この金額以下
  rate: number; // %
  deduction: number; // 円
}

// 所得税の速算表（住民税は含まない、国税庁公表の速算表ベース。estimate.tsのINCOME_TAX_BRACKETSと同じ値）
const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, rate: 5, deduction: 0 },
  { upTo: 3_300_000, rate: 10, deduction: 97_500 },
  { upTo: 6_950_000, rate: 20, deduction: 427_500 },
  { upTo: 9_000_000, rate: 23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 40, deduction: 2_796_000 },
  { upTo: Infinity, rate: 45, deduction: 4_796_000 },
];

function calcIncomeTax(taxableIncome: number): { tax: number; marginalRatePercent: number } {
  if (taxableIncome <= 0) return { tax: 0, marginalRatePercent: 0 };
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo)!;
  const tax = Math.floor(Math.max(0, taxableIncome * (bracket.rate / 100) - bracket.deduction));
  return { tax, marginalRatePercent: bracket.rate };
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/** number または number[] を受け取り、合計値（円）を返す。配列の各要素も検証する */
function resolveWithheldTotal(value: number | number[]): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, v, i) => {
      assertFiniteNonNegative(v, `毎月の源泉徴収税額（${i + 1}件目）`);
      return sum + v;
    }, 0);
  }
  assertFiniteNonNegative(value, "年間の源泉徴収税額の合計");
  return value;
}

export interface YearEndAdjustmentInput {
  /** その年の給与等の総支給額（月々の役員報酬・給与＋賞与の合計、円） */
  annualGrossCompensation: number;
  /** その年に控除した健康保険・厚生年金保険料等（社会保険料）の年間合計額（円） */
  annualSocialInsurancePremium: number;
  /** 扶養親族等の数（0以上の整数） */
  dependentCount: number;
  /**
   * その年にすでに源泉徴収した所得税額（月々の給与・賞与分の合計）。
   * 合計済みの数値（number）で渡してもよいし、月別・回別の配列（number[]）を渡して
   * このモジュール側で合計してもよい。
   */
  monthlyWithholdingTotal: number | number[];
}

export type YearEndAdjustmentOutcome = "shortfall" | "refund" | "exact";

export interface YearEndAdjustmentResult {
  annualGrossCompensation: number;
  /** 給与所得控除額（法定の速算式による） */
  salaryIncomeDeduction: number;
  /** 給与所得（総支給額 - 給与所得控除） */
  salaryIncome: number;
  annualSocialInsurancePremium: number;
  /** 基礎控除（一律48万円として適用） */
  basicDeduction: number;
  dependentCount: number;
  /** 扶養控除相当額（1人38万円として一律近似） */
  dependentDeduction: number;
  /** 課税所得（1,000円未満切り捨て） */
  taxableIncome: number;
  /** 年間の所得税額（速算表による） */
  incomeTax: number;
  /** 所得税の最高適用税率（%） */
  marginalRatePercent: number;
  /** 復興特別所得税額（所得税額×2.1%） */
  reconstructionSurtax: number;
  /** 年間の所得税及び復興特別所得税の確定額（概算） */
  totalAnnualTaxDue: number;
  /** その年にすでに源泉徴収された税額の合計 */
  alreadyWithheld: number;
  /**
   * 年末調整による差額（totalAnnualTaxDue - alreadyWithheld）。
   * 正の値＝徴収不足（追加で徴収・納付が必要）、負の値＝過納（本人へ還付すべき金額）
   */
  difference: number;
  outcome: YearEndAdjustmentOutcome;
  assumptions: string[];
}

/**
 * 年間の給与等の総支給額・社会保険料・扶養親族等の数・すでに源泉徴収した税額から、
 * 年末調整による過不足額（徴収不足額 または 過納還付額）の概算値を計算する。
 *
 * 一人社長のマイクロ法人が自分自身に支払う役員報酬・給与について、年末（通常は
 * 最後の給与を支払う際）に会社側が行う年末調整の目安を示す。この関数は
 * 生命保険料控除・住宅ローン控除・ふるさと納税等の反映は行わない（ファイル冒頭の
 * コメント参照）ため、これらを利用している場合は必ず確定申告等での別途対応が必要になる。
 *
 * @throws 入力が数値でない、0未満、扶養親族等の数が整数でない、または社会保険料が
 *   総支給額を超える場合
 */
export function calculateYearEndAdjustment(input: YearEndAdjustmentInput): YearEndAdjustmentResult {
  const { annualGrossCompensation, annualSocialInsurancePremium, dependentCount, monthlyWithholdingTotal } = input;

  assertFiniteNonNegative(annualGrossCompensation, "年間の給与等の総支給額");
  assertFiniteNonNegative(annualSocialInsurancePremium, "年間の社会保険料");
  assertFiniteNonNegative(dependentCount, "扶養親族等の数");
  if (!Number.isInteger(dependentCount)) {
    throw new Error("扶養親族等の数は整数で入力してください。");
  }
  if (annualSocialInsurancePremium > annualGrossCompensation) {
    throw new Error("年間の社会保険料は年間の給与等の総支給額を超えることはできません。");
  }

  const alreadyWithheld = resolveWithheldTotal(monthlyWithholdingTotal);

  const salaryIncomeDeduction = calcSalaryIncomeDeduction(annualGrossCompensation);
  const salaryIncome = Math.max(0, annualGrossCompensation - salaryIncomeDeduction);

  const dependentDeduction = dependentCount * PER_DEPENDENT_ANNUAL_DEDUCTION;

  const taxableIncome =
    Math.max(
      0,
      Math.floor(
        (salaryIncome - annualSocialInsurancePremium - BASIC_DEDUCTION - dependentDeduction) / 1000
      )
    ) * 1000;

  const { tax: incomeTax, marginalRatePercent } = calcIncomeTax(taxableIncome);
  const reconstructionSurtax = Math.floor(incomeTax * RECONSTRUCTION_SURTAX_RATE);
  const totalAnnualTaxDue = incomeTax + reconstructionSurtax;

  const difference = totalAnnualTaxDue - alreadyWithheld;
  const outcome: YearEndAdjustmentOutcome = difference > 0 ? "shortfall" : difference < 0 ? "refund" : "exact";

  return {
    annualGrossCompensation,
    salaryIncomeDeduction,
    salaryIncome,
    annualSocialInsurancePremium,
    basicDeduction: BASIC_DEDUCTION,
    dependentCount,
    dependentDeduction,
    taxableIncome,
    incomeTax,
    marginalRatePercent,
    reconstructionSurtax,
    totalAnnualTaxDue,
    alreadyWithheld,
    difference,
    outcome,
    assumptions: [
      "給与所得控除は国税庁公表の速算式（令和2年分以降）で計算しています（この部分は近似ではなく法定の計算式そのものです。実務上の1,000円未満の丸め特例は反映していません）",
      "社会保険料控除は入力された年間合計額をそのまま全額控除しています",
      "基礎控除は合計所得金額2,400万円以下を前提に一律48万円を適用しています。合計所得金額が2,400万円を超える場合は基礎控除が段階的に減額・消失しますが、本モジュールでは考慮していません",
      `扶養控除は扶養親族等の数×${PER_DEPENDENT_ANNUAL_DEDUCTION.toLocaleString("ja-JP")}円（一般の控除対象扶養親族の額）として一律近似しています。特定扶養親族（19歳以上23歳未満）・老人扶養親族（70歳以上）等による控除額の違い、配偶者控除・配偶者特別控除の所得制限による段階的な金額の違いは考慮していません`,
      "生命保険料控除・地震保険料控除、住宅ローン控除（住宅借入金等特別控除）、ふるさと納税等の寄附金控除、医療費控除、小規模企業共済等掛金控除（iDeCo等）は対象外です。これらを利用している場合、本モジュールの計算結果と実際の年末調整・確定申告の結果は大きく異なります",
      "住宅ローン控除は所得控除ではなく税額控除であり、通常の年末調整の所得控除ロジックとは別枠で計算・反映される必要があるため、特に対象外としています",
      "医療費控除・ふるさと納税（ワンストップ特例を除く）は原則として年末調整では反映できず、別途確定申告が必要です",
      "住民税は含まれていません（住民税は前年の所得を基に翌年度に別途計算・徴収されます）",
      "difference（差額）が正の値の場合は徴収不足（追加で徴収・納付が必要な金額）、負の値の場合は過納（本人へ還付すべき金額）です",
      "この計算結果は年末調整の概算シミュレーションであり、法定調書（源泉徴収票等）の作成・提出や実際の過不足額の清算処理を代行するものではありません。税務代理・税務書類の作成・個別具体的な税務相談にも該当しません。正式な年末調整の実施にあたっては、必ず国税庁公表の最新の資料を確認し、必要に応じて税理士等の専門家にご相談ください",
    ],
  };
}
