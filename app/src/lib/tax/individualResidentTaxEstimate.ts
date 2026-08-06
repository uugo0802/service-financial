// ------------------------------------------------------------------
// 個人住民税（道府県民税・市町村民税）概算試算シミュレーター
//
// estimate.ts（個人事業主の所得税概算）は、その assumptions で明示しているとおり
// 「住民税・事業税は含まれていません」。住民税は前年（1月1日〜12月31日）の所得に対して、
// その年の1月1日時点（賦課期日）に住所を有する市区町村・都道府県が翌年度に課税する
// 地方税であり、所得税とは税率・控除額・端数処理などのルールが異なる（地方税法第4条・
// 第294条等）。本モジュールは、確定申告データから求めた所得税の課税所得金額を入力すると、
// 翌年度に課税される見込みの個人住民税額を概算するための、estimate.ts に依存しない
// 自己完結モジュール（furusatoNozeiSimulator.ts と同じ設計方針）である。
//
// 【この試算に含まれる要素】
//   1. 所得割: 課税所得金額 × 10%（道府県民税4% + 市町村民税6%、標準税率。政令指定都市
//      （道府県4%相当分が市民税8%・道府県民税2%に配分される）は対象外の一般的なケース）。
//   2. 均等割: 標準額 年5,000円（道府県民税1,500円 + 市町村民税3,500円）に加え、
//      2024年度から均等割とあわせて徴収されている森林環境税（国税、市区町村が賦課徴収）
//      年1,000円を合算した年6,000円（内訳を明示する）。
//   3. ふるさと納税等の寄附金税額控除（基本控除分 + 特例控除分）。入力を省略した場合は
//      控除を計算しない（0円）。
//
// 【この試算に含まれない・簡略化している要素（必ず assumptions/disclaimer を確認）】
//   - 調整控除（所得税と住民税の人的控除の差に基づく税額控除、地方税法附則3条の3等）は
//     対象外としている。合計所得金額や控除の内訳によって金額が変わり複雑になるため、
//     本シミュレーターでは考慮せず、その旨を明示する（結果はやや過大になる可能性がある）。
//   - 住民税独自の所得控除額（基礎控除43万円、配偶者控除・扶養控除等の住民税側の金額）を
//     用いた住民税の課税所得金額の再計算は行わない。入力された所得税の課税所得金額を
//     そのまま住民税の課税所得金額の概算として用いる（本来は住民税の方がやや課税所得が
//     大きくなる）。
//   - 寄附金控除の基本控除分にある「総所得金額等の30%」という上限は考慮しない（一般的な
//     家計収入の水準ではこの上限が先に効くことは稀なため）。
//   - ふるさと納税以外の寄附金（住民税の対象外の寄附金、自治体が条例で指定していない
//     寄附金等）は区別せず、入力された寄附金額はすべて住民税の対象寄附金として扱う。
//   - 均等割の金額は標準税率（多くの市区町村で採用）の前提であり、自治体によっては
//     超過課税（森林保全・防災等の独自目的で均等割に数百円〜1,000円程度を上乗せする
//     条例）により実際の金額がこれと異なる場合がある。
//
// このツールは一般的な税制・標準税率に基づく簡易シミュレーションであり、税理士法第2条に
// いう個別具体的な税務相談・助言には該当しない（詳細は RESIDENT_TAX_ESTIMATE_DISCLAIMER を参照）。
// ------------------------------------------------------------------

/** 所得割の標準税率（道府県民税4% + 市町村民税6%、政令指定都市を除く一般的なケース） */
export const RESIDENT_TAX_PREFECTURAL_INCOME_LEVY_RATE = 0.04;
export const RESIDENT_TAX_MUNICIPAL_INCOME_LEVY_RATE = 0.06;
export const RESIDENT_TAX_INCOME_LEVY_RATE =
  RESIDENT_TAX_PREFECTURAL_INCOME_LEVY_RATE + RESIDENT_TAX_MUNICIPAL_INCOME_LEVY_RATE;

/** 均等割の標準額（円/年）。道府県民税分・市町村民税分・森林環境税（国税、均等割とあわせて徴収）の内訳 */
export const RESIDENT_TAX_PREFECTURAL_PER_CAPITA_LEVY = 1_500;
export const RESIDENT_TAX_MUNICIPAL_PER_CAPITA_LEVY = 3_500;
export const FOREST_ENVIRONMENT_TAX_PER_CAPITA_LEVY = 1_000;
export const RESIDENT_TAX_PER_CAPITA_LEVY_TOTAL =
  RESIDENT_TAX_PREFECTURAL_PER_CAPITA_LEVY +
  RESIDENT_TAX_MUNICIPAL_PER_CAPITA_LEVY +
  FOREST_ENVIRONMENT_TAX_PER_CAPITA_LEVY;

/** ふるさと納税の自己負担額（特例控除枠内であれば、寄附額の多寡によらず一律この金額） */
export const RESIDENT_TAX_DONATION_SELF_PAY_AMOUNT = 2_000;

/** ふるさと納税の特例控除額の上限とされる、住民税所得割額（税額控除前）に対する割合（20%） */
export const RESIDENT_TAX_DONATION_SPECIAL_DEDUCTION_LIMIT_RATE = 0.2;

/** 復興特別所得税を加味した実効所得税率を求めるための係数（基準所得税額×2.1%） */
export const RECONSTRUCTION_SURTAX_MULTIPLIER = 1.021;

/** 住民税額の端数処理単位（円未満切り捨て、地方税法20条の4の2） */
export const RESIDENT_TAX_ROUNDING_UNIT = 100;

/**
 * 所得税の速算表（2024年分以降、5%〜45%の7段階）。ふるさと納税の特例控除額の計算にのみ
 * 用いる（税額自体の計算には用いない）。他モジュール（furusatoNozeiSimulator.ts 等）と
 * 同様、estimate.ts に依存しない自己完結モジュールとするため、ここに直接ハードコードしている。
 * 出典: 国税庁タックスアンサー No.2260「所得税の税率」
 */
interface IncomeTaxBracket {
  upTo: number;
  ratePercent: number;
}

const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, ratePercent: 5 },
  { upTo: 3_300_000, ratePercent: 10 },
  { upTo: 6_950_000, ratePercent: 20 },
  { upTo: 9_000_000, ratePercent: 23 },
  { upTo: 18_000_000, ratePercent: 33 },
  { upTo: 40_000_000, ratePercent: 40 },
  { upTo: Infinity, ratePercent: 45 },
];

function findMarginalIncomeTaxRatePercent(taxableIncome: number): number {
  const income = Math.max(0, taxableIncome);
  const bracket = INCOME_TAX_BRACKETS.find((b) => income <= b.upTo) ?? INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
  return bracket.ratePercent;
}

export const RESIDENT_TAX_ESTIMATE_DISCLAIMER =
  "これは標準税率・一般的な制度に基づく簡易な参考試算（シミュレーション）であり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。実際の住民税額は、翌年度にお住まいの市区町村から届く住民税決定通知書（特別徴収税額決定通知書・普通徴収の納税通知書）に記載された金額が正式なものであり、本ツールが概算した金額とは異なる場合があります。調整控除は考慮していないほか、均等割の金額は自治体の超過課税（独自の上乗せ）により異なる場合があります。表示された金額はあくまで目安であり、実際の納税額の確認や申告手続きは、必ずご自身の判断で行うか、税理士等の専門家にご確認ください。";

export interface IndividualResidentTaxEstimateInput {
  /**
   * 所得税の課税所得金額（円）。確定申告で計算した「課税される所得金額」を、住民税独自の
   * 所得控除額（基礎控除43万円等）による再計算を行わず、そのまま住民税の課税所得金額の
   * 概算として用いる。0以上の数値を指定する。
   */
  taxableIncome: number;
  /**
   * ふるさと納税等、地方自治体に対する年間寄附金の合計額（円）。省略時・0円の場合は
   * 寄附金税額控除を計算しない。
   */
  furusatoNozeiDonationAmount?: number;
}

export interface ResidentTaxDonationCreditBreakdown {
  /** 寄附金税額控除の基本控除分（(寄附金額-2,000円)×10%相当）。総所得金額等の30%上限は考慮していない */
  basic: number;
  /** 寄附金税額控除の特例控除分（ふるさと納税のみ、自己負担2,000円に近づける分）。所得割額（税額控除前）の20%が上限 */
  special: number;
  /** basic + special */
  total: number;
}

export interface ResidentTaxIncomeLevyBreakdown {
  /** 道府県民税所得割の概算（課税所得金額×4%、円未満切り捨て） */
  prefectural: number;
  /** 市町村民税所得割の概算（課税所得金額×6%、円未満切り捨て） */
  municipal: number;
  /** 税額控除前の所得割合計（prefectural + municipal） */
  beforeCredit: number;
  /** ふるさと納税等の寄附金税額控除 */
  donationCredit: ResidentTaxDonationCreditBreakdown;
  /** 税額控除後・100円未満切り捨て後の所得割額（最終的な所得割の見込み額） */
  afterCredit: number;
}

export interface ResidentTaxPerCapitaLevyBreakdown {
  /** 道府県民税均等割（標準額） */
  prefectural: number;
  /** 市町村民税均等割（標準額） */
  municipal: number;
  /** 森林環境税（国税、均等割とあわせて市区町村が徴収） */
  forestEnvironmentTax: number;
  /** prefectural + municipal + forestEnvironmentTax */
  total: number;
}

export interface IndividualResidentTaxEstimateResult {
  /** 入力された課税所得金額（0以上に丸めた値） */
  taxableIncome: number;
  incomeLevy: ResidentTaxIncomeLevyBreakdown;
  perCapitaLevy: ResidentTaxPerCapitaLevyBreakdown;
  /** 翌年度に課税される見込みの個人住民税額の合計（所得割の最終額 + 均等割合計） */
  totalEstimatedResidentTax: number;
  assumptions: string[];
  disclaimer: string;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/** 住民税額の端数処理（円未満切り捨て後、さらに100円未満を切り捨てる） */
function roundDownToResidentTaxUnit(amount: number): number {
  return Math.floor(Math.max(0, amount) / RESIDENT_TAX_ROUNDING_UNIT) * RESIDENT_TAX_ROUNDING_UNIT;
}

/**
 * ふるさと納税等の寄附金税額控除（基本控除分・特例控除分）を計算する。
 * - 基本控除分 = (寄附金額 − 2,000円) × 10%（道府県4%+市町村6%相当）。総所得金額等の
 *   30%上限は簡易化のため考慮しない。
 * - 特例控除分 = (寄附金額 − 2,000円) × (90% − 所得税の限界税率 × 1.021)。所得割額
 *   （税額控除前）の20%を上限とする（地方税法37条の2等）。
 */
function calcDonationCredit(
  donationAmount: number,
  taxableIncome: number,
  incomeLevyBeforeCredit: number
): ResidentTaxDonationCreditBreakdown {
  const netDonation = Math.max(0, donationAmount - RESIDENT_TAX_DONATION_SELF_PAY_AMOUNT);
  if (netDonation <= 0) {
    return { basic: 0, special: 0, total: 0 };
  }

  const basic = Math.floor(netDonation * RESIDENT_TAX_INCOME_LEVY_RATE);

  const marginalRatePercent = findMarginalIncomeTaxRatePercent(taxableIncome);
  const effectiveIncomeTaxRate = (marginalRatePercent / 100) * RECONSTRUCTION_SURTAX_MULTIPLIER;
  const specialRaw = Math.floor(netDonation * Math.max(0, 0.9 - effectiveIncomeTaxRate));
  const specialCap = Math.floor(incomeLevyBeforeCredit * RESIDENT_TAX_DONATION_SPECIAL_DEDUCTION_LIMIT_RATE);
  const special = Math.max(0, Math.min(specialRaw, specialCap));

  return { basic, special, total: basic + special };
}

/**
 * 個人住民税（道府県民税・市町村民税）の概算試算。
 *
 * 所得税の課税所得金額（およびオプションでふるさと納税等の年間寄附金額）を入力すると、
 * 所得割（標準税率10%）・均等割（標準額6,000円、森林環境税を含む）・ふるさと納税の
 * 寄附金税額控除の概算を計算し、翌年度に課税される見込みの個人住民税額の合計を返す。
 * 調整控除は簡易化のため考慮しない（assumptions・disclaimerで明示）。
 */
export function estimateIndividualResidentTax(
  input: IndividualResidentTaxEstimateInput
): IndividualResidentTaxEstimateResult {
  const taxableIncome = Math.max(0, input.taxableIncome ?? 0);
  assertFiniteNonNegative(input.taxableIncome, "課税所得金額");

  const furusatoNozeiDonationAmount = input.furusatoNozeiDonationAmount ?? 0;
  assertFiniteNonNegative(furusatoNozeiDonationAmount, "寄附金額");

  const prefecturalIncomeLevy = Math.floor(taxableIncome * RESIDENT_TAX_PREFECTURAL_INCOME_LEVY_RATE);
  const municipalIncomeLevy = Math.floor(taxableIncome * RESIDENT_TAX_MUNICIPAL_INCOME_LEVY_RATE);
  const incomeLevyBeforeCredit = prefecturalIncomeLevy + municipalIncomeLevy;

  const donationCredit = calcDonationCredit(furusatoNozeiDonationAmount, taxableIncome, incomeLevyBeforeCredit);

  const incomeLevyAfterCredit = roundDownToResidentTaxUnit(
    Math.max(0, incomeLevyBeforeCredit - donationCredit.total)
  );

  const perCapitaLevy: ResidentTaxPerCapitaLevyBreakdown = {
    prefectural: RESIDENT_TAX_PREFECTURAL_PER_CAPITA_LEVY,
    municipal: RESIDENT_TAX_MUNICIPAL_PER_CAPITA_LEVY,
    forestEnvironmentTax: FOREST_ENVIRONMENT_TAX_PER_CAPITA_LEVY,
    total: RESIDENT_TAX_PER_CAPITA_LEVY_TOTAL,
  };

  const totalEstimatedResidentTax = incomeLevyAfterCredit + perCapitaLevy.total;

  return {
    taxableIncome,
    incomeLevy: {
      prefectural: prefecturalIncomeLevy,
      municipal: municipalIncomeLevy,
      beforeCredit: incomeLevyBeforeCredit,
      donationCredit,
      afterCredit: incomeLevyAfterCredit,
    },
    perCapitaLevy,
    totalEstimatedResidentTax,
    disclaimer: RESIDENT_TAX_ESTIMATE_DISCLAIMER,
    assumptions: [
      "住民税は前年（1月1日〜12月31日）の所得に対して、その年の1月1日時点（賦課期日）に住所を有する市区町村・都道府県が翌年度に課税する地方税です。この試算は、確定申告データから求めた所得税の課税所得金額を用いて、翌年度に課税される見込みの住民税額を概算するものです。",
      "所得割は、入力された所得税の課税所得金額をそのまま住民税の課税所得金額の概算として用い、標準税率10%（道府県民税4%＋市町村民税6%、政令指定都市を除く一般的なケース）を掛けて計算しています。住民税独自の所得控除額（基礎控除43万円等、所得税の48万円より少ない）を用いた住民税の課税所得金額の再計算は行っていないため、実際の所得割額はこの概算よりやや大きくなる場合があります。",
      "調整控除（所得税と住民税の人的控除の差に基づく税額控除）は、計算が複雑になるため本シミュレーターでは考慮していません。調整控除が適用される場合、実際の所得割額はこの概算より少なくなります。",
      `均等割は標準税率に基づく年${RESIDENT_TAX_PER_CAPITA_LEVY_TOTAL.toLocaleString("ja-JP")}円（道府県民税${RESIDENT_TAX_PREFECTURAL_PER_CAPITA_LEVY.toLocaleString("ja-JP")}円＋市町村民税${RESIDENT_TAX_MUNICIPAL_PER_CAPITA_LEVY.toLocaleString("ja-JP")}円＋森林環境税${FOREST_ENVIRONMENT_TAX_PER_CAPITA_LEVY.toLocaleString("ja-JP")}円）です。森林環境税は国税ですが、2024年度から均等割とあわせて市区町村が徴収しています。自治体によっては独自の超過課税により均等割の金額がこれと異なる場合があります。`,
      furusatoNozeiDonationAmount > 0
        ? `ふるさと納税等の寄附金税額控除として、基本控除分${donationCredit.basic.toLocaleString("ja-JP")}円と特例控除分${donationCredit.special.toLocaleString("ja-JP")}円（所得割額の20%が上限）の合計${donationCredit.total.toLocaleString("ja-JP")}円を所得割額から控除しています。寄附金控除の基本控除分にある「総所得金額等の30%」という上限は考慮していません。ワンストップ特例を利用しない場合、所得税側の還付分は別途、所得税の確定申告で処理されます。`
        : "ふるさと納税等の寄附金税額控除は入力されていないため考慮していません。",
      "住民税額（所得割額・合計額）は100円未満を切り捨てて表示しています（地方税法20条の4の2）。実際の端数処理は自治体・税目ごとの取扱いに従うため、正式な金額は住民税決定通知書でご確認ください。",
      "本ツールは個人（フリーランス・給与所得者等）を対象としています。マイクロ法人（法人）には法人住民税（均等割・法人税割）という別の制度が適用され、本ツールの対象外です。",
    ],
  };
}
