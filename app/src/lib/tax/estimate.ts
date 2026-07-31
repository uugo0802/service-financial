import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 免責: これは確定申告書の正式な計算ではなく、概算シミュレーションです。
// 実際の申告にあたっては必ずご自身（または税理士）の確認を経てください。
// ------------------------------------------------------------------

const BASIC_DEDUCTION = 480_000; // 基礎控除（合計所得金額2,400万円以下）
const RECONSTRUCTION_SURTAX_RATE = 0.021; // 復興特別所得税＝基準所得税額×2.1%

/** 記帳方法: 複式簿記（貸借対照表を作成） or 簡易簿記（単式簿記） */
export type BookkeepingMethod = "double" | "simple";
/** 申告方法: e-Tax電子申告 / 優良な電子帳簿保存 / 書面提出 */
export type FilingMethod = "eTax" | "electronicBooks" | "paper";

export interface BlueReturnDeductionOptions {
  /** 記帳方法。未指定の場合は複式簿記（"double"）を仮定します（最大控除額を保証するものではありません） */
  bookkeepingMethod?: BookkeepingMethod;
  /** 申告方法。未指定の場合は書面提出（"paper"）を仮定します（65万円の要件を満たすとは仮定しません） */
  filingMethod?: FilingMethod;
}

interface BlueReturnDeductionResult {
  amount: number;
  note: string;
}

/**
 * 青色申告特別控除額を、実際の記帳方法・申告方法に基づいて決定します。
 * - 65万円: 複式簿記 かつ（e-Tax提出 または 優良な電子帳簿保存）、貸借対照表添付
 * - 55万円: 複式簿記だが、書面提出（e-Tax・電子帳簿保存の要件を満たさない）
 * - 10万円: 簡易簿記（申告方法によらず）
 *
 * オプション未指定時は、65万円を一律適用しないよう保守的に「複式簿記・書面提出＝55万円」を既定値とします。
 */
export function resolveBlueReturnDeduction(options?: BlueReturnDeductionOptions): BlueReturnDeductionResult {
  const bookkeepingMethod = options?.bookkeepingMethod ?? "double";
  const filingMethod = options?.filingMethod ?? "paper";

  if (bookkeepingMethod === "simple") {
    return {
      amount: 100_000,
      note: "青色申告特別控除10万円（簡易簿記を選択されているため）を適用しています",
    };
  }

  if (filingMethod === "eTax" || filingMethod === "electronicBooks") {
    return {
      amount: 650_000,
      note:
        filingMethod === "eTax"
          ? "青色申告特別控除65万円（複式簿記・貸借対照表添付・e-Tax提出の要件を満たす前提）を適用しています"
          : "青色申告特別控除65万円（複式簿記・貸借対照表添付・優良な電子帳簿保存の要件を満たす前提）を適用しています",
    };
  }

  return {
    amount: 550_000,
    note: "青色申告特別控除55万円（複式簿記・貸借対照表添付だが、e-Tax提出/優良な電子帳簿保存の要件は満たさない書面提出を仮定）を適用しています",
  };
}

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

/**
 * 税込金額から消費税額を抜き出す（総額表示前提）。
 * 消費税額の端数処理は円未満切り捨てが原則のため、Math.round ではなく Math.floor を用いる。
 */
function extractTax(amountInclusive: number, ratePercent: number): number {
  return Math.floor((amountInclusive * ratePercent) / (100 + ratePercent));
}

const SOCIAL_INSURANCE_ACCOUNT = "社会保険料(個人)";
const LIFE_INSURANCE_ACCOUNT = "生命保険料(個人)";

export interface IndividualEstimate {
  totalIncome: number;
  totalExpense: number; // 事業の必要経費のみ（社会保険料・生命保険料等の個人的な支払いは含まない）
  businessProfit: number; // 収入 - 必要経費
  socialInsuranceDeduction: number; // 社会保険料控除（国民健康保険・国民年金など、全額控除）
  lifeInsurancePaidInfo: number; // 生命保険料の年間支払額（参考表示のみ。控除額の上限計算は未対応）
  blueReturnDeduction: number; // 青色申告特別控除額（記帳方法・申告方法に応じて65万/55万/10万円）
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

export function estimateForIndividual(
  rows: CategorizedTransaction[],
  options?: BlueReturnDeductionOptions
): IndividualEstimate {
  const { amount: blueReturnDeduction, note: blueReturnDeductionNote } = resolveBlueReturnDeduction(options);

  const income = rows.filter((r) => r.amount > 0);
  const allExpense = rows.filter((r) => r.amount < 0);
  const businessExpense = allExpense.filter((r) => !r.personalDeductionOnly);

  // 借入金の実行・出資の払込み等（excludeFromIncome）は負債・純資産の増加であり、事業の
  // 収入金額ではないため、収入合計・事業所得・免税判定のいずれからも除外する。
  const businessIncome = income.filter((r) => !r.excludeFromIncome);
  const totalIncome = businessIncome.reduce((sum, r) => sum + r.amount, 0);
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
    Math.floor((businessProfit - blueReturnDeduction - socialInsuranceDeduction - BASIC_DEDUCTION) / 1000) * 1000
  );
  const { tax, rate } = calcIncomeTax(taxableIncome);
  const reconstructionSurtax = Math.floor(tax * RECONSTRUCTION_SURTAX_RATE);

  // excludeFromIncome（借入金の実行・出資の払込み等）は事業の売上ではないため、
  // taxCategoryの値に関わらず消費税の課税売上高からも除外する。ルールベース辞書では
  // excludeFromIncomeな科目は常にtaxCategory「対象外」になるため通常は影響しないが、
  // AI分類（aiEscalate.ts）はaccount名からexcludeFromIncomeを再引当てする一方でtaxCategory自体は
  // LLMの出力をそのまま使うため、両者が食い違う結果（account="借入金"だがtaxCategory="課税売上10%"等）
  // を返す可能性がある。businessIncome（excludeFromIncomeを除外済み）を使うことで、
  // そのような食い違いがあっても借入金・出資を課税売上として扱わないようにする。
  //
  // 消費税額は取引ごとに端数処理してから合算するのではなく、税率区分ごとに税込金額を
  // まず合計し、その合計額に対して1回だけ端数処理（円未満切り捨て）する（consumptionTaxForm.ts の
  // 「割戻し計算」と同じ考え方）。取引ごとに端数処理してから合算すると、個々の端数処理誤差が
  // 積み重なり、本来の税額からずれてしまう（例: 105円・115円の売上2件は取引ごとの切り捨てだと
  // 9円+10円=19円になるが、合計220円を1回だけ切り捨てると正しくは20円になる）。
  const salesInclusive10 = businessIncome
    .filter((r) => r.taxCategory === "課税売上10%")
    .reduce((sum, r) => sum + r.amount, 0);
  const salesTax10 = extractTax(salesInclusive10, 10);

  const purchaseInclusive10 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入10%")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax10 = extractTax(purchaseInclusive10, 10);
  const purchaseInclusive8 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入8%(軽減)")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax8 = extractTax(purchaseInclusive8, 8);

  const isLikelyExempt = totalIncome <= 10_000_000;

  return {
    totalIncome,
    totalExpense,
    businessProfit,
    socialInsuranceDeduction,
    lifeInsurancePaidInfo,
    blueReturnDeduction,
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
      blueReturnDeductionNote,
      "社会保険料控除（国民健康保険・国民年金等の全額）と基礎控除48万円のみ考慮し、生命保険料控除・扶養控除等の他の所得控除は含みません",
      "生命保険料の支払いは参考表示のみで、生命保険料控除額（上限あり）の自動計算は行っていません",
      "消費税は金額を税込として扱い、税率から逆算した概算です（簡易課税は考慮していません）",
      "課税売上高が1,000万円以下の場合、基準期間の実績次第で免税事業者となる可能性があります",
      "住民税・事業税は含まれていません",
    ],
  };
}
