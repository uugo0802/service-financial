import { CorporateEstimate } from "./corporateEstimate";
import { ProfitLossStatement } from "./plStatement";

// ------------------------------------------------------------------
// 「法人税及び地方法人税の申告書 別表一」の欄番号（国税庁様式）に沿った概算表示。
// 別表二〜十六等の付表・別表四の詳細な加減算調整は行っていない簡易版です。
// ------------------------------------------------------------------

export interface CorporateTaxForm {
  // (1) 所得金額又は欠損金額
  line1_income: number;
  // (45) 中小法人等の年800万円相当額以下の金額
  line45_reducedBase: number;
  // (48) (45)の15%相当額
  line48_reducedTax: number;
  // (47) その他の所得金額
  line47_excessBase: number;
  // (50) (47)の23.2%相当額
  line50_excessTax: number;
  // (2) 法人税額 =(48)+(49)+(50)
  line2_corporateTax: number;
  // (9) 法人税額計
  line9_corporateTaxTotal: number;
  // (13) 差引所得に対する法人税額
  line13_netCorporateTax: number;
  // (15) 差引確定法人税額
  line15_finalCorporateTax: number;
  // (28) 所得の金額に対する法人税額（地方法人税の課税標準）
  line28_localTaxBase: number;
  // (31)/(53) 地方法人税額 =(28)の10.3%
  line31_localCorporateTax: number;
  // (38) 差引地方法人税額
  line38_netLocalCorporateTax: number;
  // (40) 差引確定地方法人税額
  line40_finalLocalCorporateTax: number;
  totalNationalTax: number;
}

export function buildCorporateTaxForm(estimate: CorporateEstimate): CorporateTaxForm {
  const line1_income = estimate.taxableIncome;
  const line45_reducedBase = Math.min(line1_income, 8_000_000);
  const line47_excessBase = Math.max(0, line1_income - 8_000_000);
  const line48_reducedTax = Math.floor(line45_reducedBase * 0.15);
  const line50_excessTax = Math.floor(line47_excessBase * 0.232);
  const line2_corporateTax = line48_reducedTax + line50_excessTax;
  const line28_localTaxBase = line2_corporateTax;
  const line31_localCorporateTax = Math.floor(line28_localTaxBase * 0.103);

  return {
    line1_income,
    line45_reducedBase,
    line48_reducedTax,
    line47_excessBase,
    line50_excessTax,
    line2_corporateTax,
    line9_corporateTaxTotal: line2_corporateTax,
    line13_netCorporateTax: line2_corporateTax,
    line15_finalCorporateTax: line2_corporateTax,
    line28_localTaxBase,
    line31_localCorporateTax,
    line38_netLocalCorporateTax: line31_localCorporateTax,
    line40_finalLocalCorporateTax: line31_localCorporateTax,
    totalNationalTax: line2_corporateTax + line31_localCorporateTax,
  };
}

// ------------------------------------------------------------------
// 決算報告書（表紙＋損益計算書＋販売費及び一般管理費内訳書）
// 参考にした様式: 実際の「決算報告書」（表紙／貸借対照表／損益計算書／
// 販売費及び一般管理費内訳書／株主資本等変動計算書／注記表の6点構成）のうち、
// 明細CSVから機械的に算出できる「損益計算書」「内訳書」のみを生成する。
// 貸借対照表・株主資本等変動計算書・注記表は期首残高や資本構成など
// このアプリが保持していない情報が必要なため、意図的に生成していない。
// ------------------------------------------------------------------

export interface FinancialStatements {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  pl: ProfitLossStatement;
  operatingIncome: number; // 営業利益（売上高－販管費）
  nonOperatingIncome: number; // 営業外収益（受取利息・雑収入等）
  nonOperatingExpense: number; // 営業外費用（雑損失等）
  ordinaryIncome: number; // 経常利益
  incomeBeforeTax: number; // 税引前当期純利益
  taxes: number; // 法人税、住民税及び事業税の合計（概算）
  netIncome: number; // 当期純利益（概算）
}

const NON_OPERATING_INCOME_ACCOUNTS = ["受取利息", "雑収入"];
const NON_OPERATING_EXPENSE_ACCOUNTS = ["雑損失"];

export function buildFinancialStatements(
  pl: ProfitLossStatement,
  taxForm: CorporateTaxForm,
  companyName: string,
  localTaxTotal: number = 0
): FinancialStatements {
  const nonOperatingIncome = pl.incomeLines
    .filter((l) => NON_OPERATING_INCOME_ACCOUNTS.includes(l.account))
    .reduce((s, l) => s + l.amount, 0);
  const nonOperatingExpense = pl.expenseLines
    .filter((l) => NON_OPERATING_EXPENSE_ACCOUNTS.includes(l.account))
    .reduce((s, l) => s + l.amount, 0);

  const salesOnly = pl.incomeTotal - nonOperatingIncome;
  const sgaOnly = pl.expenseTotal - nonOperatingExpense;
  const operatingIncome = salesOnly - sgaOnly;
  const ordinaryIncome = operatingIncome + nonOperatingIncome - nonOperatingExpense;
  const incomeBeforeTax = ordinaryIncome;
  // 法人税＋地方法人税（国税）＋法人住民税＋事業税・特別法人事業税（概算、自治体により変動）
  const taxes = taxForm.totalNationalTax + localTaxTotal;
  const netIncome = incomeBeforeTax - taxes;

  return {
    companyName,
    periodStart: pl.periodStart,
    periodEnd: pl.periodEnd,
    pl,
    operatingIncome,
    nonOperatingIncome,
    nonOperatingExpense,
    ordinaryIncome,
    incomeBeforeTax,
    taxes,
    netIncome,
  };
}
