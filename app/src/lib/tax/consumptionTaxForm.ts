import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 「消費税及び地方消費税の申告書」（第一表・一般用）の欄番号に沿った概算計算。
// 標準税率10%＝国税7.8％＋地方消費税2.2％、軽減税率8%＝国税6.24％＋地方消費税1.76％
// という内訳で、国税庁の様式にある番号（①②④⑦⑨⑱⑳㉖など）に対応させている。
// 簡易課税・中間納付・貸倒れ等は考慮していない概算です。
// ------------------------------------------------------------------

const NATIONAL_STANDARD = 7.8; // +地方消費税2.2%で合計10%
const NATIONAL_REDUCED = 6.24; // +地方消費税1.76%で合計8%

function round1000Down(n: number): number {
  return Math.floor(n / 1000) * 1000;
}
function round100Down(n: number): number {
  return Math.floor(n / 100) * 100;
}

/**
 * 税込金額から「税率のうち国税部分」「地方消費税部分」を分けて抜き出す。
 * 消費税額は切り捨て（円未満切り捨て）で算出する。四捨五入すると本来の納税額より
 * 過大に算出されてしまい、round1000Down/round100Down等の他の端数処理（切り捨て）とも
 * 矛盾する。
 */
function splitTax(amountInclusive: number, combinedRate: number, nationalRate: number) {
  const totalTax = Math.floor((amountInclusive * combinedRate) / (100 + combinedRate));
  const national = Math.floor((totalTax * nationalRate) / combinedRate);
  const local = totalTax - national;
  return { totalTax, national, local };
}

export interface ConsumptionTaxForm {
  // ①課税標準額（税抜き、1,000円未満切り捨て）
  taxStandardBase: number;
  // ②消費税額（課税標準額に対する消費税額＝国税部分）
  taxOnSales: number;
  // ④控除対象仕入税額（仕入に係る消費税額の国税部分）
  deductibleInputTax: number;
  // ⑦控除税額小計（＝④、他の控除項目は未対応）
  deductionSubtotal: number;
  // ⑨差引税額（②-⑦、100円未満切り捨て、マイナスの場合は還付）
  nationalTaxDue: number;
  // ⑱地方消費税の課税標準となる消費税額（＝⑨）
  localTaxBase: number;
  // ⑳（㉒）納付譲渡割額（地方消費税額、⑱×22/78、100円未満切り捨て）
  localTaxDue: number;
  // ㉖消費税及び地方消費税の合計（納付）税額
  totalDue: number;
  isLikelyExempt: boolean;
}

export function buildConsumptionTaxForm(rows: CategorizedTransaction[]): ConsumptionTaxForm {
  const income = rows.filter((r) => r.amount > 0);
  const expense = rows.filter((r) => r.amount < 0 && !r.personalDeductionOnly);
  // 借入金の実行・出資の払込み等（excludeFromIncome）は課税売上高ではないため、免税判定の
  // 基準となる totalIncome から除外する（①課税標準額・②消費税額は taxCategory で別途絞り
  // 込んでいるため、こちらは元々借入・出資の影響を受けない）。
  const businessIncome = income.filter((r) => !r.excludeFromIncome);

  // 「割戻し計算」（国税庁の原則的な計算方法）：取引ごとに端数処理した税額を積み上げるの
  // ではなく、税率区分ごとに税込金額をまず合計し、その合計額に対して1回だけ税抜化・端数
  // 処理を行う（①課税標準額の1,000円未満切り捨て後の金額を基準に②消費税額を算出するのも
  // この一環）。取引ごとに端数処理してから合算すると、集計後の1,000円未満切り捨てで失われる
  // はずの端数が反映されないまま個々の端数処理誤差も積み重なり、税額が本来より過大に算出
  // されてしまう（例: 税込1,100円・550円の売上2件は合計1,650円→税抜1,500円→①は
  // 1,000円に切り捨てられ②は78円になるべきだが、取引ごとに端数処理してから合算すると
  // 78円+39円=117円という本来より過大な額になってしまう）。
  const salesInclusive10 = businessIncome
    .filter((r) => r.taxCategory === "課税売上10%")
    .reduce((sum, r) => sum + r.amount, 0);
  const salesTotalTax10 = splitTax(salesInclusive10, 10, NATIONAL_STANDARD).totalTax;
  const taxStandardBase = round1000Down(salesInclusive10 - salesTotalTax10);
  // ②消費税額は①（1,000円未満切り捨て済みの課税標準額）に税率を掛けて算出する
  // （取引ごとの税額を合算するのではない）。
  const taxOnSales = Math.floor((taxStandardBase * NATIONAL_STANDARD) / 100);

  const purchaseInclusive10 = expense
    .filter((r) => r.taxCategory === "課税仕入10%")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseInclusive8 = expense
    .filter((r) => r.taxCategory === "課税仕入8%(軽減)")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseNational =
    splitTax(purchaseInclusive10, 10, NATIONAL_STANDARD).national +
    splitTax(purchaseInclusive8, 8, NATIONAL_REDUCED).national;

  const deductibleInputTax = purchaseNational;
  const deductionSubtotal = deductibleInputTax;
  const nationalTaxDue = Math.max(0, round100Down(taxOnSales - deductionSubtotal));
  const localTaxBase = nationalTaxDue;
  const localTaxDue = Math.max(0, round100Down((localTaxBase * 22) / 78));

  const totalIncome = businessIncome.reduce((s, r) => s + r.amount, 0);

  return {
    taxStandardBase,
    taxOnSales,
    deductibleInputTax,
    deductionSubtotal,
    nationalTaxDue,
    localTaxBase,
    localTaxDue,
    totalDue: nationalTaxDue + localTaxDue,
    isLikelyExempt: totalIncome <= 10_000_000,
  };
}
