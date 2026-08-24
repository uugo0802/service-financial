import {
  DEEMED_PURCHASE_RATES,
  SIMPLIFIED_BUSINESS_CATEGORY_LABELS,
  SimplifiedBusinessCategory,
} from "./consumptionTaxForm";

// ------------------------------------------------------------------
// 簡易課税 vs 原則課税 選択シミュレーター
//
// 簡易課税制度は、基準期間（原則2年前）の課税売上高が5,000万円以下の事業者が、事前に
// 「消費税簡易課税制度選択届出書」を提出することで選択できる制度（消費税法37条1項）。
// 選択すると、実際の課税仕入れの金額にかかわらず、事業区分別の「みなし仕入率」を用いて
// 控除対象仕入税額を計算する（実額の仕入税額控除＝原則課税とは計算方法が異なる）。
// 一方、いったん選択すると、事業を廃止した場合を除き、その課税期間の初日から2年を
// 経過する日の属する課税期間まで原則課税に戻れない（いわゆる「2年縛り」、消費税法37条6項）。
//
// このモジュールは、当期の課税売上高（事業区分別内訳）と、原則課税を選択した場合の
// 実額の課税仕入高を入力として、両方式で概算した消費税額を比較し、どちらが有利かの
// 目安と、2年縛りに関する注意喚起、実際の数値との乖離に関する注意喚起を返す。
// みなし仕入率テーブル（DEEMED_PURCHASE_RATES）・事業区分ラベルは consumptionTaxForm.ts
// のものをそのまま再利用し、ここでは重複定義しない。
//
// このツールはあくまで比較の目安（シミュレーション）を提供するものであり、簡易課税・
// 原則課税のいずれを選択すべきかを決定するものではない（税理士法上の税務相談には
// 該当しない）。将来の売上・仕入の見込みには不確実性があるため、最終的な選択・届出は
// 必ず税理士等の専門家に確認のうえ、納税者自身の判断で行う必要がある。
// ------------------------------------------------------------------

/**
 * 簡易課税制度を選択できる基準期間課税売上高の上限（円）。
 * これ「以下」であれば選択可（消費税法37条1項）。これを超えると原則課税のみ適用可能。
 */
export const SIMPLIFIED_TAXATION_ELIGIBILITY_THRESHOLD = 50_000_000;

/**
 * この試算で用いる概算税率（国税＋地方消費税の合計、標準税率10%相当）。
 * 軽減税率（8%）取引の按分は考慮しない概算である旨を assumptions で明示する。
 */
const APPROX_COMBINED_TAX_RATE = 0.1;

export type CheaperMethod = "simplified" | "general" | "tie";

export interface BusinessCategorySalesBreakdown {
  category: SimplifiedBusinessCategory;
  /** その事業区分に対応する当期の課税売上高（税抜、円） */
  taxableSales: number;
}

export interface SimplifiedTaxationSimulatorInput {
  /** 基準期間（原則2年前）の課税売上高（円）。5,000万円を超えると簡易課税は選択できない */
  baseYearTaxableSales: number;
  /** 当期の課税売上高（税抜、円）の事業区分別内訳。1件以上必須、簡易課税の計算に使用 */
  businessCategoryBreakdown: BusinessCategorySalesBreakdown[];
  /** 原則課税を選択した場合に控除する、当期の課税仕入高の実額（税抜、円） */
  actualTaxablePurchases: number;
}

export interface SimplifiedTaxationCategoryEstimate {
  category: SimplifiedBusinessCategory;
  categoryLabel: string;
  taxableSales: number;
  deemedPurchaseRate: number;
  /** その事業区分に対応する、みなし仕入率適用後の控除対象仕入税額（円） */
  deductibleInputTax: number;
}

export interface SimplifiedMethodEstimate {
  method: "simplified";
  deductibleInputTax: number;
  taxDue: number;
  categoryBreakdown: SimplifiedTaxationCategoryEstimate[];
}

export interface GeneralMethodEstimate {
  method: "general";
  actualTaxablePurchases: number;
  deductibleInputTax: number;
  taxDue: number;
}

export interface SimplifiedTaxationSimulatorResult {
  /** 基準期間の課税売上高から見て、当期に簡易課税を選択できるか（5,000万円以下か） */
  eligible: boolean;
  eligibilityNote: string;
  totalTaxableSales: number;
  /** 課税売上高に対する消費税額の概算（国税＋地方消費税合計、標準税率10%換算） */
  taxOnSales: number;
  simplified: SimplifiedMethodEstimate;
  general: GeneralMethodEstimate;
  /** 金額だけで比較した場合にどちらが安いか（eligible=falseの場合も参考値として算出） */
  cheaperMethod: CheaperMethod;
  /** 両方式の納税額の差額（円、絶対値） */
  taxDueDelta: number;
  /** 選択可否を踏まえた推奨（eligible=falseの場合は簡易課税を選べないため必ず"general"） */
  recommendedMethod: CheaperMethod;
  /** 簡易課税選択時の2年縛りに関する注意喚起文 */
  twoYearLockInWarning: string;
  disclaimer: string;
  assumptions: string[];
}

export const TWO_YEAR_LOCK_IN_WARNING =
  "簡易課税制度を選択して「消費税簡易課税制度選択届出書」を提出すると、事業を廃止した場合を除き、原則としてその課税期間の初日から2年を経過する日の属する課税期間まで、一般課税（原則課税）に戻ることができません（いわゆる「2年縛り」、消費税法37条6項）。設備投資などで原則課税なら還付になりそうな期が翌期以降にある場合は、その見通しも踏まえたうえで選択を検討してください。";

export const SIMPLIFIED_TAXATION_SIMULATOR_DISCLAIMER =
  "この試算は、入力された課税売上高・課税仕入高に基づく概算の比較であり、実際の消費税額は、軽減税率取引の有無、複数事業を営む場合の按分計算、実際の取引データなど、このツールが考慮していない要素によって変動します。将来の売上・仕入の見込みには不確実性があり、本ツールは簡易課税・原則課税のどちらを選択すべきかを決定するものではありません（個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません）。最終的な選択・届出内容は、必ず税理士等の専門家にご確認のうえ、ご自身の判断で行ってください。";

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/**
 * taxOnSales は呼び出し側（simulateSimplifiedVsGeneralTaxation）が、事業区分をまたいだ
 * 課税売上高の合計に対して1回だけ端数処理（円未満切り捨て）した値をそのまま渡す。
 * 事業区分ごとのみなし仕入率を適用するため控除対象仕入税額の内訳計算は事業区分ごとに
 * 行う必要があるが（各区分でみなし仕入率が異なるため区分ごとの計算自体は必須）、
 * 納税額の算出に使う「課税売上げに係る消費税額」は、区分ごとに端数処理してから合算するの
 * ではなく、consumptionTaxForm.ts / estimate.ts と同じ「合計してから1回だけ端数処理」した
 * taxOnSales を使う。区分ごとに端数処理してから合算すると、区分数が増えるほど端数処理誤差が
 * 積み重なり、税額が本来より過小に算出されてしまう（例: 第一種105円・第六種115円の2区分は
 * 合計220円→切り捨てで22円が正しいが、区分ごとに切り捨てて合算すると10円+11円=21円という
 * 過小な額になってしまう）。
 */
function computeSimplifiedEstimate(
  breakdown: BusinessCategorySalesBreakdown[],
  taxOnSales: number
): SimplifiedMethodEstimate {
  const categoryBreakdown: SimplifiedTaxationCategoryEstimate[] = breakdown.map((entry) => {
    const deemedPurchaseRate = DEEMED_PURCHASE_RATES[entry.category];
    const categoryTaxOnSales = Math.floor(entry.taxableSales * APPROX_COMBINED_TAX_RATE);
    const deductibleInputTax = Math.floor(categoryTaxOnSales * deemedPurchaseRate);
    return {
      category: entry.category,
      categoryLabel: SIMPLIFIED_BUSINESS_CATEGORY_LABELS[entry.category],
      taxableSales: entry.taxableSales,
      deemedPurchaseRate,
      deductibleInputTax,
    };
  });

  const deductibleInputTax = categoryBreakdown.reduce((sum, c) => sum + c.deductibleInputTax, 0);
  const taxDue = Math.max(0, taxOnSales - deductibleInputTax);

  return { method: "simplified", deductibleInputTax, taxDue, categoryBreakdown };
}

function computeGeneralEstimate(actualTaxablePurchases: number, taxOnSales: number): GeneralMethodEstimate {
  const deductibleInputTax = Math.floor(actualTaxablePurchases * APPROX_COMBINED_TAX_RATE);
  const taxDue = Math.max(0, taxOnSales - deductibleInputTax);
  return { method: "general", actualTaxablePurchases, deductibleInputTax, taxDue };
}

/**
 * 当期の課税売上高（事業区分別内訳）と、原則課税を選択した場合の実額の課税仕入高から、
 * 簡易課税・原則課税それぞれの概算納税額を計算し、どちらが有利かを比較する。
 *
 * 基準期間の課税売上高が5,000万円を超える場合は簡易課税を選択できないため、
 * eligible=false とし、recommendedMethod は常に "general" を返す（cheaperMethod自体は
 * 金額比較の参考値としてそのまま返す＝翌期以降の判断材料として有用なため）。
 */
export function simulateSimplifiedVsGeneralTaxation(
  input: SimplifiedTaxationSimulatorInput
): SimplifiedTaxationSimulatorResult {
  const { baseYearTaxableSales, businessCategoryBreakdown, actualTaxablePurchases } = input;

  assertFiniteNonNegative(baseYearTaxableSales, "基準期間の課税売上高");
  assertFiniteNonNegative(actualTaxablePurchases, "課税仕入高（原則課税）");

  if (!businessCategoryBreakdown || businessCategoryBreakdown.length === 0) {
    throw new Error("事業区分別の課税売上高を1件以上入力してください。");
  }
  businessCategoryBreakdown.forEach((entry) => {
    const categoryLabel = SIMPLIFIED_BUSINESS_CATEGORY_LABELS[entry.category];
    assertFiniteNonNegative(entry.taxableSales, `${categoryLabel}の課税売上高`);
  });

  const totalTaxableSales = businessCategoryBreakdown.reduce((sum, entry) => sum + entry.taxableSales, 0);
  const taxOnSales = Math.floor(totalTaxableSales * APPROX_COMBINED_TAX_RATE);

  const simplified = computeSimplifiedEstimate(businessCategoryBreakdown, taxOnSales);
  const general = computeGeneralEstimate(actualTaxablePurchases, taxOnSales);

  const eligible = baseYearTaxableSales <= SIMPLIFIED_TAXATION_ELIGIBILITY_THRESHOLD;
  const eligibilityNote = eligible
    ? `基準期間の課税売上高（${baseYearTaxableSales.toLocaleString("ja-JP")}円）は5,000万円以下のため、当期は簡易課税を選択できます（選択には事前に「消費税簡易課税制度選択届出書」の提出が必要です）。`
    : `基準期間の課税売上高（${baseYearTaxableSales.toLocaleString("ja-JP")}円）が5,000万円を超えているため、当期は簡易課税を選択できません（原則課税のみ適用可能です）。簡易課税側の試算は、基準期間の売上規模が変わった場合の参考値としてのみ表示しています。`;

  let cheaperMethod: CheaperMethod;
  if (simplified.taxDue < general.taxDue) {
    cheaperMethod = "simplified";
  } else if (general.taxDue < simplified.taxDue) {
    cheaperMethod = "general";
  } else {
    cheaperMethod = "tie";
  }

  const taxDueDelta = Math.abs(simplified.taxDue - general.taxDue);
  const recommendedMethod: CheaperMethod = eligible ? cheaperMethod : "general";

  return {
    eligible,
    eligibilityNote,
    totalTaxableSales,
    taxOnSales,
    simplified,
    general,
    cheaperMethod,
    taxDueDelta,
    recommendedMethod,
    twoYearLockInWarning: TWO_YEAR_LOCK_IN_WARNING,
    disclaimer: SIMPLIFIED_TAXATION_SIMULATOR_DISCLAIMER,
    assumptions: [
      "課税売上・課税仕入は、いずれも標準税率10%（国税7.8%＋地方消費税2.2%相当）として概算しています。軽減税率（8%）取引がある場合、実際の税額は本試算と異なります。",
      "簡易課税の控除対象仕入税額は、事業区分ごとの課税売上高に対応する消費税額に、区分別のみなし仕入率（consumptionTaxForm.tsのDEEMED_PURCHASE_RATES）を掛けて算出しています。複数事業を営む場合の75%ルール等の特例には対応していません。",
      "原則課税の控除対象仕入税額は、入力された課税仕入高の実額（税抜）にそのまま概算税率を掛けたものであり、インボイス（適格請求書）の保存要件や経過措置による控除割合の調整などは考慮していません。",
      "国税・地方消費税の按分計算や100円未満の端数処理など、正式な申告書における計算過程は簡略化しています。正式な納税額は、正式な計算・様式で必ず確認してください。",
    ],
  };
}
