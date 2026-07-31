import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 免責: これはマイクロ法人（一人社長など資本金1億円以下の中小法人を想定）向けの
// 概算シミュレーションです。正式な法人税申告書の計算ではありません。
// 別表調整（交際費の損金算入限度額、減価償却の任意/強制、繰越欠損金等）は
// 一切考慮していません。必ず税理士・専門家の確認を経てください。
// ------------------------------------------------------------------

const REDUCED_RATE_THRESHOLD = 8_000_000; // 軽減税率が適用される所得の上限（年800万円相当額）
const REDUCED_RATE = 0.15; // 中小法人・所得800万円以下の部分
const STANDARD_RATE = 0.232; // 800万円超の部分（普通法人基本税率）
const LOCAL_CORPORATE_TAX_RATE = 0.103; // 地方法人税 = 法人税額 × 10.3%

// 均等割の参考値（資本金1,000万円以下・従業者数50人以下、東京都23区内を仮定した最も低い区分）
// 自治体・資本金・従業者数により実際の金額は変わるため、あくまで参考表示。
const PER_CAPITA_TAX_REFERENCE = 70_000;

// 消費税額は税込金額から切り捨て（円未満切り捨て）で抜き出す。四捨五入すると本来の
// 納税額より過大に算出されてしまい、round1000Down等の他の端数処理（切り捨て）とも
// 矛盾する。
function extractTax(amountInclusive: number, ratePercent: number): number {
  return Math.floor((amountInclusive * ratePercent) / (100 + ratePercent));
}

export interface CorporateEstimate {
  revenue: number;
  expenses: number;
  taxableIncome: number; // 益金 - 損金（簡易、別表調整なし）
  corporateTax: number;
  localCorporateTax: number;
  perCapitaTaxReference: number;
  totalNationalTax: number; // 法人税 + 地方法人税（地方税の所得割・均等割は含まない参考値）
  consumptionTax: {
    isLikelyExempt: boolean;
    salesTax: number;
    purchaseTax: number;
    payable: number;
  };
  assumptions: string[];
}

export function estimateForMicroCorp(rows: CategorizedTransaction[]): CorporateEstimate {
  const income = rows.filter((r) => r.amount > 0);
  const expense = rows.filter((r) => r.amount < 0);

  // 借入金の実行・出資の払込み等（excludeFromIncome）は負債・純資産の増加であり、法人の
  // 収益（益金）ではないため、益金・所得金額・免税判定のいずれからも除外する。
  const businessIncome = income.filter((r) => !r.excludeFromIncome);
  const revenue = businessIncome.reduce((sum, r) => sum + r.amount, 0);
  const expenses = expense.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const taxableIncome = Math.max(0, Math.floor((revenue - expenses) / 1000) * 1000);

  const reducedPortion = Math.min(taxableIncome, REDUCED_RATE_THRESHOLD);
  const standardPortion = Math.max(0, taxableIncome - REDUCED_RATE_THRESHOLD);
  const corporateTax = Math.floor(reducedPortion * REDUCED_RATE + standardPortion * STANDARD_RATE);
  const localCorporateTax = Math.floor(corporateTax * LOCAL_CORPORATE_TAX_RATE);

  // 消費税額は取引ごとに端数処理してから合算するのではなく、税率区分ごとに税込金額を
  // まず合計し、その合計額に対して1回だけ端数処理（円未満切り捨て）する（「割戻し計算」）。
  // 取引ごとに端数処理してから合算すると、個々の端数処理誤差が積み重なり、本来の税額から
  // ずれてしまう（例: 105円・115円の売上2件は取引ごとの切り捨てだと9円+10円=19円になるが、
  // 合計220円を1回だけ切り捨てると正しくは20円になる）。
  const salesInclusive10 = businessIncome
    .filter((r) => r.taxCategory === "課税売上10%")
    .reduce((sum, r) => sum + r.amount, 0);
  const salesTax10 = extractTax(salesInclusive10, 10);
  const purchaseInclusive10 = expense
    .filter((r) => r.taxCategory === "課税仕入10%")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax10 = extractTax(purchaseInclusive10, 10);
  const purchaseInclusive8 = expense
    .filter((r) => r.taxCategory === "課税仕入8%(軽減)")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax8 = extractTax(purchaseInclusive8, 8);

  return {
    revenue,
    expenses,
    taxableIncome,
    corporateTax,
    localCorporateTax,
    perCapitaTaxReference: PER_CAPITA_TAX_REFERENCE,
    totalNationalTax: corporateTax + localCorporateTax,
    consumptionTax: {
      isLikelyExempt: revenue <= 10_000_000,
      salesTax: salesTax10,
      purchaseTax: purchaseTax10 + purchaseTax8,
      payable: Math.max(0, salesTax10 - (purchaseTax10 + purchaseTax8)),
    },
    assumptions: [
      "資本金1億円以下の中小法人を想定し、所得800万円以下の部分に軽減税率15%を適用しています",
      "減価償却・交際費の損金算入限度額・繰越欠損金など別表調整は一切考慮していません（簡易試算）",
      "法人住民税・法人事業税の所得割は自治体・所得金額により変動するため計算対象外です。均等割のみ、資本金1,000万円以下・従業員50人以下の東京都23区内を仮定した参考値を表示しています",
      "消費税は金額を税込として扱い、税率から逆算した概算です（簡易課税・インボイス経過措置は考慮していません）",
      "課税売上高が1,000万円以下の場合、設立からの期間や資本金次第で免税事業者となる可能性があります",
    ],
  };
}
