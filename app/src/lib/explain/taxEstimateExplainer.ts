import { IndividualEstimate } from "../tax/estimate";
import { CorporateEstimate } from "../tax/corporateEstimate";

// ------------------------------------------------------------------
// 表示専用（プレゼンテーション層）のヘルパー。
// tax/estimate.ts・tax/corporateEstimate.ts が既に計算済みの IndividualEstimate /
// CorporateEstimate を受け取り、「収入 → 各種控除 → 課税所得 → 税率区分ごとの税額 →
// 最終的な税額」という計算の流れを、順序付きの説明ステップに整形するだけ。
// 税額計算のロジックそのものは一切再実装・再判定しない（最終的な金額は必ず estimate側の
// フィールドをそのまま表示する）。
//
// 重要（税理士法対応）: これは「本アプリがどうやってこの数字を計算したか」という
// 計算過程の解説（学習的な機能）であり、個別の税務相談・節税アドバイスではない。
// 文言は「〜を差し引きます」「〜に該当します」等、事実の記述にとどめ、
// 「〜すべきです」「〜がお得です」といった助言的な表現は用いない。
// ------------------------------------------------------------------

/** 計算トレイルの1ステップ。amount は円建ての金額（このステップで新たに現れる/変化する額）。 */
export interface CalculationTrailStep {
  /** ステップの見出し（例:「収入金額」「青色申告特別控除」） */
  label: string;
  /** 平易な言葉での説明文 */
  detail: string;
  /** このステップに対応する金額（円）。金額を伴わない注記ステップの場合は null */
  amount: number | null;
  /** 「最終的な税額」など、トレイルの結論にあたるステップかどうか（UI強調用） */
  isFinal?: boolean;
}

const yenFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function yen(amount: number): string {
  return `${yenFormatter.format(amount)}円`;
}

// 所得税の速算表（国税庁公表ベース）。tax/estimate.ts の INCOME_TAX_BRACKETS と同じ値だが、
// 「どの税率区分に該当したか」を説明文に表示するための表示専用の複製であり、税額計算には使わない
// （実際の税額・限界税率は常に estimate.incomeTax の値をそのまま使う）。
const DISPLAY_INCOME_TAX_BRACKETS: { upTo: number; rate: number; deduction: number }[] = [
  { upTo: 1_950_000, rate: 5, deduction: 0 },
  { upTo: 3_300_000, rate: 10, deduction: 97_500 },
  { upTo: 6_950_000, rate: 20, deduction: 427_500 },
  { upTo: 9_000_000, rate: 23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 40, deduction: 2_796_000 },
  { upTo: Infinity, rate: 45, deduction: 4_796_000 },
];

/** 基礎控除額（合計所得金額2,400万円以下の場合）。tax/estimate.ts の BASIC_DEDUCTION と同じ値の表示専用の複製。 */
const DISPLAY_BASIC_DEDUCTION = 480_000;

/** 法人税の軽減税率が適用される所得の上限（年800万円相当額）。corporateEstimate.ts の複製、表示専用。 */
const DISPLAY_REDUCED_RATE_THRESHOLD = 8_000_000;
const DISPLAY_REDUCED_RATE = 15;
const DISPLAY_STANDARD_RATE = 23.2;
const DISPLAY_LOCAL_CORPORATE_TAX_RATE = 10.3;

/**
 * 課税所得金額に対応する所得税の速算表の区分（税率・控除額）を、表示専用の複製テーブルから探す。
 * 実際の所得税額はここでは計算しない（estimate.incomeTax.tax をそのまま使う）。
 */
function findDisplayBracket(taxableIncome: number) {
  return DISPLAY_INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo) ?? DISPLAY_INCOME_TAX_BRACKETS[DISPLAY_INCOME_TAX_BRACKETS.length - 1];
}

/**
 * 個人事業主向けの所得税試算（IndividualEstimate）から、
 * 「収入 → 必要経費 → 事業所得 → 各種控除 → 課税所得 → 税率区分ごとの税額 → 最終的な税額」
 * という計算トレイルを組み立てる。
 */
export function explainIndividualEstimateCalculation(estimate: IndividualEstimate): CalculationTrailStep[] {
  const steps: CalculationTrailStep[] = [];

  steps.push({
    label: "収入金額",
    detail: `事業の収入金額の合計は ${yen(estimate.totalIncome)} です（借入金の実行・出資の払込み等は収入に含みません）。`,
    amount: estimate.totalIncome,
  });

  steps.push({
    label: "必要経費",
    detail: `必要経費の合計は ${yen(estimate.totalExpense)} です（社会保険料・生命保険料など個人的な支払いは含みません）。`,
    amount: estimate.totalExpense,
  });

  steps.push({
    label: "事業所得",
    detail: `収入金額 ${yen(estimate.totalIncome)} － 必要経費 ${yen(estimate.totalExpense)} = 事業所得 ${yen(
      estimate.businessProfit
    )} です。`,
    amount: estimate.businessProfit,
  });

  if (estimate.blueReturnDeduction > 0) {
    steps.push({
      label: "青色申告特別控除",
      detail: `事業所得から青色申告特別控除 ${yen(estimate.blueReturnDeduction)} を差し引きます。`,
      amount: estimate.blueReturnDeduction,
    });
  }

  if (estimate.socialInsuranceDeduction > 0) {
    steps.push({
      label: "社会保険料控除",
      detail: `国民健康保険・国民年金など社会保険料の年間支払額 ${yen(
        estimate.socialInsuranceDeduction
      )} 全額を、所得から差し引きます。`,
      amount: estimate.socialInsuranceDeduction,
    });
  }

  steps.push({
    label: "基礎控除",
    detail: `合計所得金額2,400万円以下の場合の基礎控除 ${yen(DISPLAY_BASIC_DEDUCTION)} を差し引きます。`,
    amount: DISPLAY_BASIC_DEDUCTION,
  });

  steps.push({
    label: "課税所得金額",
    detail: `事業所得から上記の控除をすべて差し引き、千円未満を切り捨て（マイナスの場合は0円）た金額が課税所得金額 ${yen(
      estimate.taxableIncome
    )} です。`,
    amount: estimate.taxableIncome,
  });

  const bracket = findDisplayBracket(estimate.taxableIncome);
  steps.push({
    label: "税率区分ごとの所得税額",
    detail:
      estimate.taxableIncome <= 0
        ? "課税所得金額が0円のため、所得税額も0円です。"
        : `課税所得金額 ${yen(estimate.taxableIncome)} は税率 ${bracket.rate}% の区分に該当します（速算表: 課税所得金額 × ${
            bracket.rate
          }% － 控除額 ${yen(bracket.deduction)} = 所得税額 ${yen(estimate.incomeTax.tax)}）。`,
    amount: estimate.incomeTax.tax,
  });

  steps.push({
    label: "復興特別所得税",
    detail: `復興特別所得税 = 所得税額 ${yen(estimate.incomeTax.tax)} × 2.1% = ${yen(estimate.reconstructionSurtax)}。`,
    amount: estimate.reconstructionSurtax,
  });

  steps.push({
    label: "所得税及び復興特別所得税の合計額",
    detail: `所得税額 ${yen(estimate.incomeTax.tax)} ＋ 復興特別所得税 ${yen(estimate.reconstructionSurtax)} = 合計 ${yen(
      estimate.totalIncomeTax
    )} が、この試算での最終的な税額です。`,
    amount: estimate.totalIncomeTax,
    isFinal: true,
  });

  return steps;
}

/**
 * マイクロ法人向けの法人税試算（CorporateEstimate）から、
 * 「収益 → 費用 → 所得金額 → 税率区分ごとの法人税額 → 地方法人税 → 最終的な税額」
 * という計算トレイルを組み立てる。
 */
export function explainCorporateEstimateCalculation(estimate: CorporateEstimate): CalculationTrailStep[] {
  const steps: CalculationTrailStep[] = [];

  steps.push({
    label: "収益（益金）",
    detail: `事業の収益（益金）の合計は ${yen(estimate.revenue)} です（借入金の実行・出資の払込み等は含みません）。`,
    amount: estimate.revenue,
  });

  steps.push({
    label: "費用（損金）",
    detail: `費用（損金）の合計は ${yen(estimate.expenses)} です。`,
    amount: estimate.expenses,
  });

  steps.push({
    label: "所得金額",
    detail: `収益 ${yen(estimate.revenue)} － 費用 ${yen(estimate.expenses)} を千円未満切り捨て（マイナスの場合は0円）した金額が所得金額 ${yen(
      estimate.taxableIncome
    )} です（別表調整は考慮していません）。`,
    amount: estimate.taxableIncome,
  });

  const reducedPortion = Math.min(estimate.taxableIncome, DISPLAY_REDUCED_RATE_THRESHOLD);
  const standardPortion = Math.max(0, estimate.taxableIncome - DISPLAY_REDUCED_RATE_THRESHOLD);

  if (estimate.taxableIncome <= 0) {
    steps.push({
      label: "税率区分ごとの法人税額",
      detail: "所得金額が0円のため、法人税額も0円です。",
      amount: estimate.corporateTax,
    });
  } else {
    steps.push({
      label: "軽減税率の対象部分（年800万円以下）",
      detail: `所得金額のうち年800万円以下の部分 ${yen(reducedPortion)} × ${DISPLAY_REDUCED_RATE}%。`,
      amount: reducedPortion,
    });
    if (standardPortion > 0) {
      steps.push({
        label: "基本税率の対象部分（年800万円超）",
        detail: `所得金額のうち年800万円を超える部分 ${yen(standardPortion)} × ${DISPLAY_STANDARD_RATE}%。`,
        amount: standardPortion,
      });
    }
    steps.push({
      label: "法人税額",
      detail: `上記2つの部分の税額を合計した法人税額は ${yen(estimate.corporateTax)} です。`,
      amount: estimate.corporateTax,
    });
  }

  steps.push({
    label: "地方法人税",
    detail: `地方法人税 = 法人税額 ${yen(estimate.corporateTax)} × ${DISPLAY_LOCAL_CORPORATE_TAX_RATE}% = ${yen(
      estimate.localCorporateTax
    )}。`,
    amount: estimate.localCorporateTax,
  });

  steps.push({
    label: "法人税・地方法人税の合計額",
    detail: `法人税額 ${yen(estimate.corporateTax)} ＋ 地方法人税 ${yen(estimate.localCorporateTax)} = 合計 ${yen(
      estimate.totalNationalTax
    )} が、この試算での最終的な税額です（法人住民税・法人事業税は別枠の参考値です）。`,
    amount: estimate.totalNationalTax,
    isFinal: true,
  });

  return steps;
}
