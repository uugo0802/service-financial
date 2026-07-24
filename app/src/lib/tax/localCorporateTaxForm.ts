import { CorporateEstimate } from "./corporateEstimate";
import { CorporateTaxForm } from "./corporateForms";

// ------------------------------------------------------------------
// 「法人都道府県民税・市町村民税」「法人事業税・特別法人事業税」の概算。
// 前提: 資本金1億円以下の中小法人（外形標準課税の対象外）、東京都23区内に
// 事務所を1か所のみ設置、資本金1,000万円以下・従業者数50人以下の標準的なケース。
// 実際の税率・均等割額は自治体（都道府県・市区町村）ごとに異なるため、
// 本社所在地の自治体で必ず確認してください（東京23区以外は道府県民税と
// 市町村民税に分かれ、それぞれ別に申告・納付します）。
// 出典: 東京都主税局「法人事業税・法人都民税」「特別法人事業税」の公表税率（2026年時点）。
// ------------------------------------------------------------------

const PER_CAPITA_TAX = 70_000; // 均等割（都民税、資本金1,000万円以下・従業者50人以下・東京23区）
const CORPORATE_TAX_RATIO_STANDARD = 0.07; // 法人税割 標準税率（都民税、23区）
const BUSINESS_TAX_BRACKET_1 = 4_000_000; // 年400万円以下
const BUSINESS_TAX_BRACKET_2 = 8_000_000; // 年400万円超800万円以下
const BUSINESS_TAX_RATE_1 = 0.035;
const BUSINESS_TAX_RATE_2 = 0.053;
const BUSINESS_TAX_RATE_3 = 0.07;
const SPECIAL_BUSINESS_TAX_RATE = 0.37; // 特別法人事業税 = 事業税所得割額 × 37%

export interface LocalCorporateTaxForm {
  perCapitaTax: number; // 均等割
  corporateTaxLevy: number; // 法人税割（法人税額×7.0%）
  inhabitantTaxTotal: number; // 法人住民税 合計
  businessTaxBracket1: number;
  businessTaxBracket2: number;
  businessTaxBracket3: number;
  businessTaxByBracket: { base: number; rate: number; tax: number }[];
  businessTaxSubtotal: number; // 事業税 所得割 合計
  specialBusinessTax: number; // 特別法人事業税
  businessTaxTotal: number; // 事業税＋特別法人事業税
  grandTotal: number; // 住民税＋事業税等の合計
}

export function buildLocalCorporateTaxForm(
  estimate: CorporateEstimate,
  nationalTaxForm: CorporateTaxForm
): LocalCorporateTaxForm {
  const income = estimate.taxableIncome;

  const bracket1Base = Math.min(income, BUSINESS_TAX_BRACKET_1);
  const bracket2Base = Math.max(0, Math.min(income, BUSINESS_TAX_BRACKET_2) - BUSINESS_TAX_BRACKET_1);
  const bracket3Base = Math.max(0, income - BUSINESS_TAX_BRACKET_2);

  const tax1 = Math.floor(bracket1Base * BUSINESS_TAX_RATE_1);
  const tax2 = Math.floor(bracket2Base * BUSINESS_TAX_RATE_2);
  const tax3 = Math.floor(bracket3Base * BUSINESS_TAX_RATE_3);
  const businessTaxSubtotal = tax1 + tax2 + tax3;
  const specialBusinessTax = Math.floor(businessTaxSubtotal * SPECIAL_BUSINESS_TAX_RATE);

  const corporateTaxLevy = Math.floor(nationalTaxForm.line2_corporateTax * CORPORATE_TAX_RATIO_STANDARD);
  const inhabitantTaxTotal = PER_CAPITA_TAX + corporateTaxLevy;
  const businessTaxTotal = businessTaxSubtotal + specialBusinessTax;

  return {
    perCapitaTax: PER_CAPITA_TAX,
    corporateTaxLevy,
    inhabitantTaxTotal,
    businessTaxBracket1: bracket1Base,
    businessTaxBracket2: bracket2Base,
    businessTaxBracket3: bracket3Base,
    businessTaxByBracket: [
      { base: bracket1Base, rate: BUSINESS_TAX_RATE_1, tax: tax1 },
      { base: bracket2Base, rate: BUSINESS_TAX_RATE_2, tax: tax2 },
      { base: bracket3Base, rate: BUSINESS_TAX_RATE_3, tax: tax3 },
    ],
    businessTaxSubtotal,
    specialBusinessTax,
    businessTaxTotal,
    grandTotal: inhabitantTaxTotal + businessTaxTotal,
  };
}
