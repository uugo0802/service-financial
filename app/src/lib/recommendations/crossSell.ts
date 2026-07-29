// ------------------------------------------------------------------
// クロスセル・レコメンド（他サービスへの参考情報の提案）
//
// これは投資助言・保険募集・貸金業・宅地建物取引業のいずれにも該当しない、
// あくまで「一般的・教育的な参考情報」の提示のみを行うモジュールです。
// - 特定の商品名・会社名は一切扱いません。
// - 判定はユーザー自身の集計値（年間利益・資金繰りの傾向）に基づく
//   単純な目安（ルールベース）のみで行い、与信審査や適合性判定に相当する
//   個別最適化・スコアリングは行いません。
// - すべての表示項目に、個別助言ではない旨と専門家への相談を促す
//   免責文言（disclaimer）を必ず付与します。
//
// これは税理士法上の税務相談・税務代理には該当しません（税務に関する項目は含みません）。
// ------------------------------------------------------------------

export type CrossSellCategory = "investment" | "insurance" | "loan" | "realEstate";

export interface CrossSellRecommendation {
  id: string;
  category: CrossSellCategory;
  title: string;
  description: string;
  disclaimer: string;
}

export type CashTrend = "increasing" | "flat" | "decreasing";

export interface CrossSellInputs {
  /** 直近の年間事業利益（円）。データが無い/未確定の場合は null を渡す */
  annualProfitYen: number | null;
  /** 資金繰り（現金残高）のおおまかな傾向。分からなければ省略可 */
  cashTrend?: CashTrend | null;
}

/** この金額以上の利益で「余剰資金の長期運用」の参考情報を表示する目安（円） */
export const INVESTMENT_PROFIT_THRESHOLD_YEN = 4_000_000;

/** この金額以上の利益かつ資金繰りが悪化していない場合に「不動産」の参考情報を表示する目安（円） */
export const REAL_ESTATE_PROFIT_THRESHOLD_YEN = 8_000_000;

const GENERAL_DISCLAIMER =
  "本情報は一般的・教育的な参考情報であり、特定の商品・会社を推奨または勧誘するものではありません。個別の投資・保険・融資・不動産に関する助言ではないため、実際の判断にあたっては各分野の有資格専門家（ファイナンシャルプランナー、保険募集人、金融機関、宅地建物取引士等）にご相談のうえ、ご自身の責任で行ってください。";

function loanRecommendation(): CrossSellRecommendation {
  return {
    id: "loan-cashflow-basics",
    category: "loan",
    title: "資金繰りが厳しい時期の一般的な選択肢を知る",
    description:
      "利益が一時的にマイナスになったり、資金繰りが苦しくなったりする時期には、事業性融資や当座貸越など、金融機関が提供する一般的な資金調達の選択肢があります。まずは資金繰り表を作成し、必要な金額・使いみち・返済計画を整理しておくと、相談や検討がしやすくなります。",
    disclaimer: GENERAL_DISCLAIMER,
  };
}

function insuranceRecommendation(): CrossSellRecommendation {
  return {
    id: "insurance-business-risk-basics",
    category: "insurance",
    title: "事業のリスクに備える保険の一般的な考え方",
    description:
      "利益が出ている事業では、経営者自身の万一の際の保障や、事業を継続するための保険（生命保険・損害保険など）の必要性を検討する事業者が多く見られます。必要な保障の種類・金額は事業内容やご家庭の状況によって異なるため、一般的な考え方を理解したうえで検討することが大切です。",
    disclaimer: GENERAL_DISCLAIMER,
  };
}

function investmentRecommendation(): CrossSellRecommendation {
  return {
    id: "investment-surplus-basics",
    category: "investment",
    title: "利益の一部を長期的な資産形成に振り向ける考え方",
    description:
      "安定的に利益が出ている場合、税制優遇のある制度や分散投資など、長期的な資産形成に関する一般的な選択肢を知っておくと、将来の資金計画の幅が広がります。商品によってリスクとリターンの性質は大きく異なるため、まずは一般的な投資の仕組みを学ぶところから始めることをおすすめします。",
    disclaimer: GENERAL_DISCLAIMER,
  };
}

function realEstateRecommendation(): CrossSellRecommendation {
  return {
    id: "real-estate-diversification-basics",
    category: "realEstate",
    title: "事業資産の一つとしての不動産の考え方",
    description:
      "利益水準が高く資金繰りも安定している事業では、不動産を資産構成の選択肢の一つとして検討する例もあります。不動産は現金や金融商品に比べて流動性が低く、取得・保有コストや空室リスクなども伴うため、一般的な仕組みとリスクを理解したうえで慎重に検討することが重要です。",
    disclaimer: GENERAL_DISCLAIMER,
  };
}

/**
 * ユーザー自身の集計値（年間利益・資金繰りの傾向）のみを入力に、
 * 単純な目安（ルールベース）でクロスセル参考情報を返す。
 *
 * - データが無い（annualProfitYen が null 等）場合は何も返さない。
 * - 与信審査・適合性判定に相当する個別スコアリングは一切行わない。
 */
export function getCrossSellRecommendations(inputs: CrossSellInputs): CrossSellRecommendation[] {
  const { annualProfitYen, cashTrend } = inputs;

  if (annualProfitYen === null || annualProfitYen === undefined || !Number.isFinite(annualProfitYen)) {
    return [];
  }

  const isCashDecreasing = cashTrend === "decreasing";
  const recommendations: CrossSellRecommendation[] = [];

  if (annualProfitYen < 0 || isCashDecreasing) {
    recommendations.push(loanRecommendation());
  }

  if (annualProfitYen > 0) {
    recommendations.push(insuranceRecommendation());
  }

  if (annualProfitYen >= INVESTMENT_PROFIT_THRESHOLD_YEN) {
    recommendations.push(investmentRecommendation());
  }

  if (annualProfitYen >= REAL_ESTATE_PROFIT_THRESHOLD_YEN && !isCashDecreasing) {
    recommendations.push(realEstateRecommendation());
  }

  return recommendations;
}
