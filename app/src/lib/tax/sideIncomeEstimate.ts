import { calcIncomeTax } from "./estimate";

// ------------------------------------------------------------------
// 免責: これは給与所得（本業の勤務先からの給与収入）と事業所得（副業・個人事業）を
// 合算して総合課税で申告する場合の所得税額の「概算シミュレーション」です。
// 正式な確定申告書の計算ではなく、個別具体の税務相談・助言でもありません。
// 実際の申告にあたっては必ずご自身（または税理士）の確認を経てください。
//
// 対象ユーザー: 給与所得者（会社員等）が副業・個人事業（フリーランス収入）を
// 持つケース（いわゆる「副業」ユーザー）。給与所得と事業所得はいずれも総合課税の
// 対象であり、同一の超過累進税率表に基づき合算して所得税額を計算する（所得税法21条）。
// ------------------------------------------------------------------

/**
 * 基礎控除（合計所得金額2,400万円以下の場合、令和2年分以降）。
 * estimate.ts の同名の定数と同じ値・同じ前提（2,400万円超で逓減・消失する点は
 * このツールでは考慮していない）。estimate.ts はこの定数をexportしていないため、
 * ここでは値のみを重複定義している（速算表そのものの重複実装ではないため許容）。
 */
const BASIC_DEDUCTION = 480_000;

/** 復興特別所得税＝基準所得税額×2.1%（estimate.ts と同じ税率。2037年分まで課される時限税） */
const RECONSTRUCTION_SURTAX_RATE = 0.021;

interface EmploymentIncomeDeductionBracket {
  upTo: number; // 給与収入がこの金額以下の場合に適用
  rate: number; // 収入金額に乗じる率
  addend: number; // 加算（または減算、マイナス値）する定数
}

/**
 * 給与所得控除額の速算表（令和2年分以降、2020年度税制改正後の基準）。
 *
 * 出典/前提: 国税庁が公表している給与所得控除額の速算表に基づく（例:
 * 国税庁タックスアンサー No.1410「給与所得控除」）。
 *   - 収入金額 550,999円以下: 控除額 550,000円（実務上は収入金額が55万円未満の場合、
 *     控除額は収入金額そのものが上限になるが、本ツールでは0円未満にならないよう
 *     給与所得の計算時にMath.maxで下限0円に補正するのみとし、この速算表自体は
 *     国税庁公表の帯（〜162.5万円）をそのまま採用する）
 *   - 1,625,000円以下: 550,000円（一律）
 *   - 1,625,000円超 1,800,000円以下: 収入金額×40% − 100,000円
 *   - 1,800,000円超 3,600,000円以下: 収入金額×30% + 80,000円
 *   - 3,600,000円超 6,600,000円以下: 収入金額×20% + 440,000円
 *   - 6,600,000円超 8,500,000円以下: 収入金額×10% + 1,100,000円
 *   - 8,500,000円超: 1,950,000円（上限。所得金額調整控除は別制度のためこのツールでは未対応）
 *
 * 【重要な限定事項】
 * 給与収入が660万円以下の場合、本来は国税庁が定める「給与所得控除後の給与等の金額の
 * 速算表」（収入金額を4,000円刻みの帯に区切った早見表）を用いるのが正式な計算方法であり、
 * ここでの連続的な数式による近似値とは、帯の境界付近で数百円程度ずれる場合がある
 * （実務上の影響は軽微だが、正確な金額は源泉徴収票や国税庁の早見表で確認すること）。
 * 各帯の境界値ではこの数式は連続になるよう設計されているため、660万円超の部分（法令上も
 * 数式で計算する部分）との整合性は保たれている。
 */
const EMPLOYMENT_INCOME_DEDUCTION_BRACKETS: EmploymentIncomeDeductionBracket[] = [
  { upTo: 1_625_000, rate: 0, addend: 550_000 },
  { upTo: 1_800_000, rate: 0.4, addend: -100_000 },
  { upTo: 3_600_000, rate: 0.3, addend: 80_000 },
  { upTo: 6_600_000, rate: 0.2, addend: 440_000 },
  { upTo: 8_500_000, rate: 0.1, addend: 1_100_000 },
  { upTo: Infinity, rate: 0, addend: 1_950_000 },
];

/**
 * 給与収入（年間の給与等の収入金額、源泉徴収前の額面）から給与所得控除額を計算する。
 * 収入金額が0円以下の場合は0円を返す。
 */
export function calcEmploymentIncomeDeduction(salaryRevenue: number): number {
  if (salaryRevenue <= 0) return 0;
  const bracket = EMPLOYMENT_INCOME_DEDUCTION_BRACKETS.find((b) => salaryRevenue <= b.upTo)!;
  return Math.floor(salaryRevenue * bracket.rate + bracket.addend);
}

/**
 * 給与収入から給与所得（給与収入 − 給与所得控除額）を計算する。
 * 給与所得控除額が収入金額を上回ることはない前提の速算表だが、念のため0円を下限とする。
 */
export function calcSalaryIncome(salaryRevenue: number): { salaryIncome: number; employmentIncomeDeduction: number } {
  const revenue = Math.max(0, salaryRevenue);
  const employmentIncomeDeduction = calcEmploymentIncomeDeduction(revenue);
  return {
    salaryIncome: Math.max(0, revenue - employmentIncomeDeduction),
    employmentIncomeDeduction,
  };
}

export interface SideIncomeEstimateInput {
  /** 給与収入（年間、源泉徴収前の額面。源泉徴収票の「支払金額」相当） */
  salaryRevenue: number;
  /**
   * 事業所得（副業・個人事業の収入 − 必要経費 − 青色申告特別控除等を適用済みの金額）。
   * estimate.ts の estimateForIndividual が返す businessProfit（青色控除適用前）ではなく、
   * 青色申告特別控除等を適用した後の「事業所得」金額を渡すことを想定している。
   * 赤字（マイナス）の場合、給与所得（経常所得）と損益通算されるため、そのままマイナス値で渡してよい。
   */
  businessProfit: number;
  /**
   * 基礎控除額（円）。省略時は48万円（合計所得金額2,400万円以下の前提）を適用する。
   * 社会保険料控除・生命保険料控除等その他の所得控除はこのツールでは考慮していない
   * （estimate.ts 側の事業所得のみの概算と異なり、給与所得側の社会保険料等は源泉徴収票の
   * 情報がないと正確に把握できないため、Phase 1では意図的にスコープ外としている）。
   */
  basicDeduction?: number;
}

export interface SideIncomeEstimateResult {
  salaryRevenue: number;
  employmentIncomeDeduction: number;
  salaryIncome: number;
  businessProfit: number;
  /** 合計所得金額（給与所得 + 事業所得。事業所得が赤字の場合は給与所得と通算した後の金額） */
  totalIncome: number;
  /** 課税所得金額（合計所得金額 − 基礎控除、1,000円未満切り捨て、0円未満は0円） */
  taxableIncome: number;
  incomeTax: { tax: number; marginalRate: number };
  /** 復興特別所得税（所得税額×2.1%） */
  reconstructionSurtax: number;
  /** 所得税及び復興特別所得税の額 */
  totalIncomeTax: number;
  assumptions: string[];
}

/**
 * 給与所得と事業所得（副業）を合算した総合課税の所得税額を概算する。
 *
 * 対象: 給与所得者が副業・個人事業（フリーランス収入）を持つケース。給与所得・事業所得は
 * いずれも総合課税の対象で、同一の超過累進税率表（速算表）に基づき合算して税額を計算する。
 * 所得税額の計算自体は estimate.ts の calcIncomeTax（速算表）をそのまま再利用しており、
 * このモジュールで新たに実装しているのは (a) 給与所得控除の計算 と (b) 給与所得と
 * 事業所得の合算処理のみ。
 */
export function estimateCombinedSalaryAndBusinessIncomeTax(
  input: SideIncomeEstimateInput
): SideIncomeEstimateResult {
  const { salaryIncome, employmentIncomeDeduction } = calcSalaryIncome(input.salaryRevenue);
  const businessProfit = input.businessProfit;
  const basicDeduction = input.basicDeduction ?? BASIC_DEDUCTION;

  const totalIncome = salaryIncome + businessProfit;

  const taxableIncome = Math.max(0, Math.floor(Math.max(0, totalIncome - basicDeduction) / 1000) * 1000);

  const { tax, rate } = calcIncomeTax(taxableIncome);
  const reconstructionSurtax = Math.floor(tax * RECONSTRUCTION_SURTAX_RATE);

  return {
    salaryRevenue: Math.max(0, input.salaryRevenue),
    employmentIncomeDeduction,
    salaryIncome,
    businessProfit,
    totalIncome,
    taxableIncome,
    incomeTax: { tax, marginalRate: rate },
    reconstructionSurtax,
    totalIncomeTax: tax + reconstructionSurtax,
    assumptions: [
      "これは給与所得と事業所得（副業）を合算した総合課税の所得税額の概算シミュレーションであり、正式な確定申告書の計算ではありません。個別具体の税務相談・助言にはあたらないため、実際の申告にあたっては必ずご自身（または税理士）の確認を経てください。",
      "給与所得控除は、令和2年分以降の速算表（数式）による近似値です。給与収入が660万円以下の場合、国税庁が定める4,000円刻みの早見表とは境界付近で数百円程度ずれる場合があります。所得金額調整控除（子育て・介護世帯や給与収入850万円超で一定の要件を満たす場合の追加控除）は考慮していません。",
      "基礎控除48万円のみを考慮しており、社会保険料控除・生命保険料控除・配偶者控除・扶養控除など、給与所得側・事業所得側いずれについてもその他の所得控除は含まれていません（源泉徴収票等の追加情報が必要なため、Phase 1では意図的にスコープ外としています）。",
      "住民税・事業税、および給与から源泉徴収されている所得税額との過不足精算（年末調整との関係）は含まれていません。",
      "事業所得が赤字の場合は給与所得と損益通算した金額を合計所得金額としていますが、事業的規模でない場合の損益通算の可否や、他の所得区分（雑所得等）に該当しないかどうかの判定は行っていません。副業の所得が事業所得ではなく雑所得に区分される可能性がある点も含め、区分の判断は個別の事情によるため、必ずご自身（または税理士）にご確認ください。",
    ],
  };
}
