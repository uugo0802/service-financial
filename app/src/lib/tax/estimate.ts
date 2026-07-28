import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 免責: これは確定申告書の正式な計算ではなく、概算シミュレーションです。
// 実際の申告にあたっては必ずご自身（または税理士）の確認を経てください。
// ------------------------------------------------------------------

const BLUE_RETURN_DEDUCTION = 650_000; // 青色申告特別控除（e-Tax提出・複式簿記を仮定した最大額）
const BASIC_DEDUCTION = 480_000; // 基礎控除（合計所得金額2,400万円以下）
const RECONSTRUCTION_SURTAX_RATE = 0.021; // 復興特別所得税＝基準所得税額×2.1%

interface IncomeTaxBracket {
  upTo: number; // この金額以下
  rate: number; // %
  deduction: number; // 円
}

// 所得税 速算表（住民税は含まない、国税庁公表の速算表ベース）
const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, rate: 5, deduction: 0 },
  { upTo: 3_300_000, rate: 10, deduction: 97_500 },
  { upTo: 6_950_000, rate: 20, deduction: 427_500 },
  { upTo: 9_000_000, rate: 23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 40, deduction: 2_796_000 },
  { upTo: Infinity, rate: 45, deduction: 4_796_000 },
];

function calcIncomeTax(taxableIncome: number): { tax: number; rate: number } {
  if (taxableIncome <= 0) return { tax: 0, rate: 0 };
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo)!;
  const tax = Math.floor(Math.max(0, taxableIncome * (bracket.rate / 100) - bracket.deduction));
  return { tax, rate: bracket.rate };
}

/** 税込金額から消費税額を抜き出す（総額表示前提） */
function extractTax(amountInclusive: number, ratePercent: number): number {
  return Math.round((amountInclusive * ratePercent) / (100 + ratePercent));
}

const SOCIAL_INSURANCE_ACCOUNT = "社会保険料(個人)";
const LIFE_INSURANCE_ACCOUNT = "生命保険料(個人)";

export interface IndividualEstimate {
  totalIncome: number;
  totalExpense: number; // 事業の必要経費のみ（社会保険料・生命保険料等の個人的な支払いは含まない）
  businessProfit: number; // 収入 - 必要経費
  socialInsuranceDeduction: number; // 社会保険料控除（国民健康保険・国民年金など、全額控除）
  lifeInsurancePaidInfo: number; // 生命保険料の年間支払額（参考表示のみ。控除額の上限計算は未対応）
  taxableIncome: number; // 事業所得 - 青色控除 - 社会保険料控除 - 基礎控除（他の所得控除は考慮しない）
  incomeTax: { tax: number; marginalRate: number };
  reconstructionSurtax: number; // 復興特別所得税（所得税額×2.1%）
  totalIncomeTax: number; // 所得税及び復興特別所得税の額
  consumptionTax: {
    isLikelyExempt: boolean;
    salesTax: number;
    purchaseTax: number;
    payable: number;
  };
  assumptions: string[];
}

export function estimateForIndividual(rows: CategorizedTransaction[]): IndividualEstimate {
  // 借入金の実行・出資の払込等（nonRevenue）は入金でも事業収入ではないため除外する
  const income = rows.filter((r) => r.amount > 0 && !r.nonRevenue);
  const allExpense = rows.filter((r) => r.amount < 0);
  const businessExpense = allExpense.filter((r) => !r.personalDeductionOnly);

  const totalIncome = income.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = businessExpense.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const businessProfit = totalIncome - totalExpense;

  const socialInsuranceDeduction = allExpense
    .filter((r) => r.account === SOCIAL_INSURANCE_ACCOUNT)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const lifeInsurancePaidInfo = allExpense
    .filter((r) => r.account === LIFE_INSURANCE_ACCOUNT)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);

  const taxableIncome = Math.max(
    0,
    Math.floor((businessProfit - BLUE_RETURN_DEDUCTION - socialInsuranceDeduction - BASIC_DEDUCTION) / 1000) * 1000
  );
  const { tax, rate } = calcIncomeTax(taxableIncome);
  const reconstructionSurtax = Math.floor(tax * RECONSTRUCTION_SURTAX_RATE);

  const salesTax10 = income
    .filter((r) => r.taxCategory === "課税売上10%")
    .reduce((sum, r) => sum + extractTax(r.amount, 10), 0);

  const purchaseTax10 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入10%")
    .reduce((sum, r) => sum + extractTax(Math.abs(r.amount), 10), 0);
  const purchaseTax8 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入8%(軽減)")
    .reduce((sum, r) => sum + extractTax(Math.abs(r.amount), 8), 0);

  const isLikelyExempt = totalIncome <= 10_000_000;

  return {
    totalIncome,
    totalExpense,
    businessProfit,
    socialInsuranceDeduction,
    lifeInsurancePaidInfo,
    taxableIncome,
    incomeTax: { tax, marginalRate: rate },
    reconstructionSurtax,
    totalIncomeTax: tax + reconstructionSurtax,
    consumptionTax: {
      isLikelyExempt,
      salesTax: salesTax10,
      purchaseTax: purchaseTax10 + purchaseTax8,
      payable: Math.max(0, salesTax10 - (purchaseTax10 + purchaseTax8)),
    },
    assumptions: [
      "青色申告特別控除65万円（e-Tax提出・複式簿記を満たす前提）を一律適用しています",
      "社会保険料控除（国民健康保険・国民年金等の全額）と基礎控除48万円のみ考慮し、生命保険料控除・扶養控除等の他の所得控除は含みません",
      "生命保険料の支払いは参考表示のみで、生命保険料控除額（上限あり）の自動計算は行っていません",
      "消費税は金額を税込として扱い、税率から逆算した概算です（簡易課税は考慮していません）",
      "課税売上高が1,000万円以下の場合、基準期間の実績次第で免税事業者となる可能性があります",
      "住民税・事業税は含まれていません",
    ],
  };
}
