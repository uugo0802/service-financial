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

/** 税込金額から「税率のうち国税部分」「地方消費税部分」を分けて抜き出す */
function splitTax(amountInclusive: number, combinedRate: number, nationalRate: number) {
  const totalTax = Math.round((amountInclusive * combinedRate) / (100 + combinedRate));
  const national = Math.round((totalTax * nationalRate) / combinedRate);
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

  let salesNational = 0;
  let salesTaxableBase = 0;
  for (const r of income) {
    if (r.taxCategory === "課税売上10%") {
      const { totalTax, national } = splitTax(r.amount, 10, NATIONAL_STANDARD);
      salesNational += national;
      salesTaxableBase += r.amount - totalTax;
    }
  }

  let purchaseNational = 0;
  for (const r of expense) {
    const abs = Math.abs(r.amount);
    if (r.taxCategory === "課税仕入10%") {
      purchaseNational += splitTax(abs, 10, NATIONAL_STANDARD).national;
    } else if (r.taxCategory === "課税仕入8%(軽減)") {
      purchaseNational += splitTax(abs, 8, NATIONAL_REDUCED).national;
    }
  }

  const taxStandardBase = round1000Down(salesTaxableBase);
  const taxOnSales = salesNational;
  const deductibleInputTax = purchaseNational;
  const deductionSubtotal = deductibleInputTax;
  const nationalTaxDue = Math.max(0, round100Down(taxOnSales - deductionSubtotal));
  const localTaxBase = nationalTaxDue;
  const localTaxDue = Math.max(0, round100Down((localTaxBase * 22) / 78));

  const totalIncome = income.reduce((s, r) => s + r.amount, 0);

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
