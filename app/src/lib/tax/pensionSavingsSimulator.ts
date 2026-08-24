// ------------------------------------------------------------------
// 小規模企業共済 / iDeCo 掛金シミュレーター（小規模企業共済等掛金控除）
//
// 小規模企業共済（独立行政法人 中小企業基盤整備機構が運営）およびiDeCo（個人型確定拠出
// 年金）の掛金は、いずれも所得税法上「小規模企業共済等掛金控除」として、上限なく
// 掛金の全額が所得控除の対象となる（所得税法第75条）。この控除は個人事業主・フリーランス
// にとって数少ない「自分でコントロールできる」節税レバーの一つとして知られている。
//
// このモジュールは、税理士法第2条（税務相談は税理士の独占業務）に抵触しないよう、
// 「仮にX円多く拠出した場合、税額はおおよそY円変わる」という一般的なシミュレーションの
// 提供に留める。特定の掛金額での拠出を推奨・助言するものではない（詳細は
// PENSION_SAVINGS_SIMULATOR_DISCLAIMER を参照）。
//
// 【重要】このファイルは app/src/lib/tax/estimate.ts に依存しない、完全に自己完結した
// モジュールとして実装している。estimate.ts は別エージェントが並行して itemized-deduction
// （本控除を含む）対応を追加中のため、依存すると競合・破壊的変更のリスクがある。
// 所得税の速算表（下記 INCOME_TAX_BRACKETS）は estimate.ts のものとは独立に、国税庁が
// 公表している「所得税の速算表」を本ファイル内に直接ハードコードしている。
// 出典: 国税庁タックスアンサー No.2260「所得税の税率」
//   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
// （2024年分以降の税率・控除額。復興特別所得税(基準所得税額×2.1%)は含まない、
//   課税総所得金額に対する国税＝所得税本体の税率表）
// ------------------------------------------------------------------

export interface IncomeTaxBracket {
  /** この金額（円）以下であればこのブラケットが適用される。最上位はInfinity */
  upTo: number;
  /** 税率（%） */
  ratePercent: number;
  /** 速算控除額（円） */
  deduction: number;
}

/**
 * 所得税の速算表（2024年分以降、5%〜45%の7段階）。
 * 税制改正により将来変更される可能性があるため、実際の申告時には必ず国税庁の最新の
 * 発表内容と照合すること。
 */
export const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, ratePercent: 5, deduction: 0 },
  { upTo: 3_300_000, ratePercent: 10, deduction: 97_500 },
  { upTo: 6_950_000, ratePercent: 20, deduction: 427_500 },
  { upTo: 9_000_000, ratePercent: 23, deduction: 636_000 },
  { upTo: 18_000_000, ratePercent: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, ratePercent: 40, deduction: 2_796_000 },
  { upTo: Infinity, ratePercent: 45, deduction: 4_796_000 },
];

/**
 * 住民税（所得割）の概算税率。ほとんどの自治体で標準税率10%（道府県民税4%＋
 * 市町村民税6%、政令指定都市は内訳が異なるが合計は概ね10%）が採用されているため、
 * この簡易シミュレーションでは一律10%で近似する。均等割（定額部分、年5,000円前後が
 * 一般的）や、自治体独自の超過課税・森林環境税（国税、別枠）等は考慮していない概算値。
 */
export const RESIDENT_TAX_APPROX_RATE = 0.1;

/**
 * 小規模企業共済の年間掛金上限（参考値）。月額1,000円〜70,000円（500円単位）、
 * 年額換算で最大840,000円（中小企業基盤整備機構の規定による）。
 * 制度改正により変わり得るため、必ず中小機構の最新の公表情報で再確認すること
 * （本値は実装時点＝2026年時点の目安）。
 */
export const SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP = 840_000;

/**
 * iDeCo（個人型確定拠出年金）の年間掛金上限（参考値）。第1号被保険者（自営業者・
 * フリーランスで、他の企業年金等に加入していない場合）は月額68,000円が上限
 * （国民年金基金の掛金または国民年金付加保険料との合算枠）、年額換算で最大816,000円。
 * 制度改正により変わり得るため、必ずiDeCo公式サイト（国民年金基金連合会）・
 * 財務省(MOF)の最新の公表情報で再確認すること（本値は実装時点＝2026年時点の目安）。
 */
export const IDECO_SOLE_PROPRIETOR_ANNUAL_CAP = 816_000;

export const PENSION_SAVINGS_SIMULATOR_DISCLAIMER =
  "これは一般的な制度に基づく試算（シミュレーション）であり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。実際の税額は、他の所得控除・税額控除の適用状況、社会保険料の負担、翌年度以降の所得の変動など、このツールが考慮していない要素によって変動します。特定の金額での拠出を推奨するものではなく、小規模企業共済・iDeCoへの加入や掛金額の決定はご自身の資金繰り・将来設計を踏まえたうえでご判断ください。最終的な判断に迷う場合は、税理士等の専門家にご相談ください。";

export interface PensionSavingsSimulatorInput {
  /** この掛金控除を差し引く前の課税所得（円）。他の所得控除まで適用した後の金額を想定 */
  taxableIncomeBeforeDeduction: number;
  /** 小規模企業共済の年間想定拠出額（円） */
  smallBusinessMutualAidAnnualContribution: number;
  /** iDeCoの年間想定拠出額（円） */
  idecoAnnualContribution: number;
}

export interface ContributionBreakdown {
  smallBusinessMutualAid: number;
  ideco: number;
  total: number;
}

export interface PensionSavingsSimulatorResult {
  taxableIncomeBeforeDeduction: number;
  /** 拠出前の課税所得が該当する所得税の限界税率のブラケット */
  marginalBracket: { ratePercent: number; upTo: number };
  /** 入力された（法定上限を適用する前の）想定拠出額 */
  requestedContribution: ContributionBreakdown;
  /** 法定上限でキャップした後の、実際に所得控除の対象となる拠出額 */
  deductibleContribution: ContributionBreakdown;
  /** 入力額が法定上限を超えていた場合の注意文（超えていなければ空配列） */
  capWarnings: string[];
  taxableIncomeAfterDeduction: number;
  /** 控除前の所得税額（概算、速算表による。復興特別所得税は含まない） */
  incomeTaxBefore: number;
  /** 控除後の所得税額（概算） */
  incomeTaxAfter: number;
  /** 所得税の減少額（概算） = incomeTaxBefore - incomeTaxAfter。ブラケット跨ぎがあれば正しく反映される */
  incomeTaxReduction: number;
  /** 住民税の減少額（概算） = 控除対象拠出額 × 10%（近似） */
  residentTaxReduction: number;
  /** 所得税・住民税の減少額の合計（概算） */
  totalTaxReduction: number;
  /**
   * 実際に支払う拠出額（requestedContribution.total、法定上限超過分も含む）に対する
   * 節税額の割合。「実質的な割引率」の目安。拠出額が0の場合は0を返す。
   */
  effectiveDiscountRate: number;
  caps: { smallBusinessMutualAid: number; ideco: number };
  disclaimer: string;
  assumptions: string[];
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/**
 * 課税所得に対する所得税額を、速算表を用いて概算計算する（復興特別所得税は含まない）。
 */
function calcProgressiveIncomeTax(taxableIncome: number): number {
  const income = Math.max(0, taxableIncome);
  if (income === 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((b) => income <= b.upTo)!;
  return Math.floor(Math.max(0, income * (bracket.ratePercent / 100) - bracket.deduction));
}

/** 課税所得が該当する速算表のブラケットを返す（マイナスは0として扱う） */
function findMarginalBracket(taxableIncome: number): IncomeTaxBracket {
  const income = Math.max(0, taxableIncome);
  return INCOME_TAX_BRACKETS.find((b) => income <= b.upTo) ?? INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
}

/**
 * 小規模企業共済・iDeCoの年間想定拠出額から、小規模企業共済等掛金控除による
 * 所得税・住民税の減少額を概算するシミュレーション。
 *
 * 所得税の減少額は「拠出額 × 拠出前の限界税率」という単純計算ではなく、控除前・控除後
 * それぞれの課税所得について速算表で正しく所得税額を計算し、その差分として求める。
 * これにより、拠出によって課税所得が下位のブラケットに跨って下がるケース（ブラケット
 * 跨ぎ）でも、正しい減少額が算出される。
 *
 * 入力額が法定上限（SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP / IDECO_SOLE_PROPRIETOR_ANNUAL_CAP）
 * を超える場合は、控除対象額を上限でキャップし、capWarnings に注意文を追加する
 * （上限を超えた分は所得控除の対象にならないため、無制限に控除できるわけではない）。
 */
export function simulatePensionSavings(input: PensionSavingsSimulatorInput): PensionSavingsSimulatorResult {
  const { taxableIncomeBeforeDeduction, smallBusinessMutualAidAnnualContribution, idecoAnnualContribution } = input;

  assertFiniteNonNegative(taxableIncomeBeforeDeduction, "控除前の課税所得");
  assertFiniteNonNegative(smallBusinessMutualAidAnnualContribution, "小規模企業共済の年間掛金");
  assertFiniteNonNegative(idecoAnnualContribution, "iDeCoの年間掛金");

  const requestedContribution: ContributionBreakdown = {
    smallBusinessMutualAid: smallBusinessMutualAidAnnualContribution,
    ideco: idecoAnnualContribution,
    total: smallBusinessMutualAidAnnualContribution + idecoAnnualContribution,
  };

  const capWarnings: string[] = [];
  const cappedSmallBusinessMutualAid = Math.min(
    smallBusinessMutualAidAnnualContribution,
    SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP
  );
  if (smallBusinessMutualAidAnnualContribution > SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP) {
    capWarnings.push(
      `小規模企業共済の年間掛金上限（${SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP.toLocaleString(
        "ja-JP"
      )}円）を超える金額が入力されています。上限を超える部分は小規模企業共済等掛金控除の対象にならないため、控除対象額は上限でキャップして試算しています。`
    );
  }

  const cappedIdeco = Math.min(idecoAnnualContribution, IDECO_SOLE_PROPRIETOR_ANNUAL_CAP);
  if (idecoAnnualContribution > IDECO_SOLE_PROPRIETOR_ANNUAL_CAP) {
    capWarnings.push(
      `iDeCoの年間掛金上限（第1号被保険者の目安、${IDECO_SOLE_PROPRIETOR_ANNUAL_CAP.toLocaleString(
        "ja-JP"
      )}円＝月額68,000円）を超える金額が入力されています。上限は国民年金基金・国民年金付加保険料との合算枠であり、加入状況によって実際の上限は異なります。上限を超える部分は控除対象にならないため、控除対象額は上限でキャップして試算しています。`
    );
  }

  const deductibleContribution: ContributionBreakdown = {
    smallBusinessMutualAid: cappedSmallBusinessMutualAid,
    ideco: cappedIdeco,
    total: cappedSmallBusinessMutualAid + cappedIdeco,
  };

  const marginalBracketDef = findMarginalBracket(taxableIncomeBeforeDeduction);
  const taxableIncomeAfterDeduction = Math.max(0, taxableIncomeBeforeDeduction - deductibleContribution.total);

  const incomeTaxBefore = calcProgressiveIncomeTax(taxableIncomeBeforeDeduction);
  const incomeTaxAfter = calcProgressiveIncomeTax(taxableIncomeAfterDeduction);
  const incomeTaxReduction = incomeTaxBefore - incomeTaxAfter;

  const residentTaxReduction = Math.floor(deductibleContribution.total * RESIDENT_TAX_APPROX_RATE);
  const totalTaxReduction = incomeTaxReduction + residentTaxReduction;

  const effectiveDiscountRate = requestedContribution.total > 0 ? totalTaxReduction / requestedContribution.total : 0;

  return {
    taxableIncomeBeforeDeduction: Math.max(0, taxableIncomeBeforeDeduction),
    marginalBracket: { ratePercent: marginalBracketDef.ratePercent, upTo: marginalBracketDef.upTo },
    requestedContribution,
    deductibleContribution,
    capWarnings,
    taxableIncomeAfterDeduction,
    incomeTaxBefore,
    incomeTaxAfter,
    incomeTaxReduction,
    residentTaxReduction,
    totalTaxReduction,
    effectiveDiscountRate,
    caps: {
      smallBusinessMutualAid: SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP,
      ideco: IDECO_SOLE_PROPRIETOR_ANNUAL_CAP,
    },
    disclaimer: PENSION_SAVINGS_SIMULATOR_DISCLAIMER,
    assumptions: [
      "所得税額は、国税庁公表の所得税の速算表（2024年分以降、5%〜45%の7段階）を用いた概算です。復興特別所得税（基準所得税額×2.1%）は含みません。",
      "住民税（所得割）は、標準税率10%（道府県民税4%＋市町村民税6%相当）で一律に近似しています。均等割（定額部分）や自治体独自の超過課税は考慮していません。",
      "小規模企業共済・iDeCoの年間掛金上限は、いずれも本ツール実装時点の一般的な目安（小規模企業共済840,000円/年、iDeCo・第1号被保険者816,000円/年）です。制度改正や個人の加入状況（国民年金基金・付加保険料との合算等）により実際の上限は異なる場合があるため、最新情報を必ず確認してください。",
      "本試算は、拠出前の課税所得が他の所得控除等をすべて適用した後の金額であることを前提としています。実際の申告における課税所得・税額とは異なる場合があります。",
    ],
  };
}
