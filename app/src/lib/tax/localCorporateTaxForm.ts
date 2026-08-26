import { CorporateEstimate } from "./corporateEstimate";
import { CorporateTaxForm } from "./corporateForms";
import { calcBusinessTaxByBrackets } from "./taxRateMaster";

// ------------------------------------------------------------------
// 「法人都道府県民税・市町村民税」「法人事業税・特別法人事業税」の概算。
// 前提: 資本金1億円以下の中小法人（外形標準課税の対象外）、東京都23区内に
// 事務所を1か所のみ設置、資本金1,000万円以下・従業者数50人以下の標準的なケース。
// 実際の税率・均等割額は自治体（都道府県・市区町村）ごとに異なるため、
// 本社所在地の自治体で必ず確認してください（東京23区以外は道府県民税と
// 市町村民税に分かれ、それぞれ別に申告・納付します）。
// 出典: 東京都主税局「法人事業税・法人都民税」「特別法人事業税」の公表税率（2026年時点）。
//
// 東京23区以外の自治体（県・市に分かれるケース）を扱う場合は taxRateMaster.ts の
// buildLocalCorporateTaxFormForRegion を使用してください。事業税（3段階税率）の
// 計算ロジックはそちらと共通化されています（calcBusinessTaxByBrackets）。
// ------------------------------------------------------------------

const PER_CAPITA_TAX = 70_000; // 均等割（都民税、資本金1,000万円以下・従業者50人以下・東京23区）
const CORPORATE_TAX_RATIO_STANDARD = 0.07; // 法人税割 標準税率（都民税、23区）

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
  const businessTax = calcBusinessTaxByBrackets(income);

  const corporateTaxLevy = Math.floor(nationalTaxForm.line2_corporateTax * CORPORATE_TAX_RATIO_STANDARD);
  const inhabitantTaxTotal = PER_CAPITA_TAX + corporateTaxLevy;

  return {
    perCapitaTax: PER_CAPITA_TAX,
    corporateTaxLevy,
    inhabitantTaxTotal,
    businessTaxBracket1: businessTax.businessTaxBracket1,
    businessTaxBracket2: businessTax.businessTaxBracket2,
    businessTaxBracket3: businessTax.businessTaxBracket3,
    businessTaxByBracket: businessTax.businessTaxByBracket,
    businessTaxSubtotal: businessTax.businessTaxSubtotal,
    specialBusinessTax: businessTax.specialBusinessTax,
    businessTaxTotal: businessTax.businessTaxTotal,
    grandTotal: inhabitantTaxTotal + businessTax.businessTaxTotal,
  };
}
