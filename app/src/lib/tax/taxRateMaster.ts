import { CorporateEstimate } from "./corporateEstimate";
import { CorporateTaxForm } from "./corporateForms";

// ------------------------------------------------------------------
// 都道府県・市町村ごとの地方税率マスタ。
// 「法人住民税（均等割・法人税割）」を都道府県分・市町村分に分けて算出するための
// 設定値を保持する。東京23区のように市町村民税が存在しない自治体は
// municipality 系フィールドを null で表現する。
//
// 事業税（所得割・3段階税率）・特別法人事業税は、東京・神奈川いずれも
// 全国標準税率が前提のため、localCorporateTaxForm.ts と共通の内部ヘルパー
// （calcBusinessTaxByBrackets）で計算する。自治体ごとに値が変わるのは
// 住民税（均等割・法人税割）のみ。
//
// 対応: 資本金1億円以下の中小法人（外形標準課税の対象外）、標準税率
// （超過税率を採用する自治体には未対応）。
// ------------------------------------------------------------------

// --------------------------------------------------------------
// 事業税（所得割・3段階税率）の共通内部ヘルパー。
// localCorporateTaxForm.ts（東京23区限定の既存実装）と本ファイルの
// buildLocalCorporateTaxFormForRegion の両方から参照される。
// 出典: 東京都主税局「法人事業税・法人都民税」「特別法人事業税」の公表税率（2026年時点）。
// 全国標準税率であり、都道府県が超過税率を採用していない限り自治体によらず共通。
// --------------------------------------------------------------
const BUSINESS_TAX_BRACKET_1 = 4_000_000; // 年400万円以下
const BUSINESS_TAX_BRACKET_2 = 8_000_000; // 年400万円超800万円以下
const BUSINESS_TAX_RATE_1 = 0.035;
const BUSINESS_TAX_RATE_2 = 0.053;
const BUSINESS_TAX_RATE_3 = 0.07;
const SPECIAL_BUSINESS_TAX_RATE = 0.37; // 特別法人事業税 = 事業税所得割額 × 37%

export interface BusinessTaxByBracketsResult {
  businessTaxBracket1: number;
  businessTaxBracket2: number;
  businessTaxBracket3: number;
  businessTaxByBracket: { base: number; rate: number; tax: number }[];
  businessTaxSubtotal: number; // 事業税 所得割 合計
  specialBusinessTax: number; // 特別法人事業税
  businessTaxTotal: number; // 事業税＋特別法人事業税
}

/**
 * 所得金額から事業税（所得割・3段階税率）と特別法人事業税を算出する内部ヘルパー。
 * localCorporateTaxForm.ts と本ファイルの両方から参照される（計算式の重複を避けるため共通化）。
 */
export function calcBusinessTaxByBrackets(income: number): BusinessTaxByBracketsResult {
  const bracket1Base = Math.min(income, BUSINESS_TAX_BRACKET_1);
  const bracket2Base = Math.max(0, Math.min(income, BUSINESS_TAX_BRACKET_2) - BUSINESS_TAX_BRACKET_1);
  const bracket3Base = Math.max(0, income - BUSINESS_TAX_BRACKET_2);

  const tax1 = Math.floor(bracket1Base * BUSINESS_TAX_RATE_1);
  const tax2 = Math.floor(bracket2Base * BUSINESS_TAX_RATE_2);
  const tax3 = Math.floor(bracket3Base * BUSINESS_TAX_RATE_3);
  const businessTaxSubtotal = tax1 + tax2 + tax3;
  const specialBusinessTax = Math.floor(businessTaxSubtotal * SPECIAL_BUSINESS_TAX_RATE);

  return {
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
    businessTaxTotal: businessTaxSubtotal + specialBusinessTax,
  };
}

export interface LocalTaxRateConfig {
  key: string;
  prefectureName: string; // 例: "神奈川県"
  municipalityName: string | null; // 東京23区のように市町村民税が存在しない場合は null
  perCapitaTaxPrefecture: number; // 均等割（県）
  perCapitaTaxMunicipality: number | null; // 均等割（市）。null = 該当なし
  corporateTaxLevyRatePrefecture: number | null; // 法人税割 税率（県）。null = 該当なし
  corporateTaxLevyRateMunicipality: number; // 法人税割 税率（市 or 23区は都民税相当）
  verified: boolean; // 実際の自治体公表資料で裏取りされているか
  sourceNote: string; // 出典 or 「未検証、要確認」の注記
}

export const TAX_RATE_CONFIGS: Record<string, LocalTaxRateConfig> = {
  "tokyo-23ku": {
    key: "tokyo-23ku",
    prefectureName: "東京都",
    municipalityName: null, // 23区には市町村民税が存在しない（都民税に一本化）
    perCapitaTaxPrefecture: 70_000, // 均等割（都民税、資本金1,000万円以下・従業者50人以下・東京23区）
    perCapitaTaxMunicipality: null,
    corporateTaxLevyRatePrefecture: null,
    corporateTaxLevyRateMunicipality: 0.07, // 法人税割 標準税率（都民税、23区）
    verified: true,
    sourceNote: "東京都主税局「法人事業税・法人都民税」の公表税率（2026年時点）。localCorporateTaxForm.ts から移植・検証済み。",
  },
  "kanagawa-hiratsuka": {
    key: "kanagawa-hiratsuka",
    prefectureName: "神奈川県",
    municipalityName: "平塚市",
    perCapitaTaxPrefecture: 20_000, // 均等割（県）
    perCapitaTaxMunicipality: 50_000, // 均等割（市）
    corporateTaxLevyRatePrefecture: 0.01, // 法人税割（県）1.0%
    corporateTaxLevyRateMunicipality: 0.06, // 法人税割（市）6.0%
    verified: false,
    sourceNote:
      "CLAUDE.mdに記載の暫定値。平塚市公式サイトで税率を必ず確認してから利用すること。この税率は未検証の暫定値です。神奈川県・平塚市の公式サイトで最新の税率をご確認のうえ、必要に応じて値を修正してください。",
  },
};

export interface RegionalLocalTaxForm {
  perCapitaTaxPrefecture: number;
  perCapitaTaxMunicipality: number;
  corporateTaxLevyPrefecture: number;
  corporateTaxLevyMunicipality: number;
  inhabitantTaxTotal: number; // 上記4つの合計
  businessTaxSubtotal: number; // 既存ロジック（3段階税率）を再利用、変更なし
  specialBusinessTax: number;
  businessTaxTotal: number;
  grandTotal: number;
  verified: boolean; // config.verified をそのまま伝播。呼び出し側（別表五）で警告表示に使う
}

/**
 * 都道府県・市町村ごとの税率設定（LocalTaxRateConfig）を用いて、法人住民税
 * （均等割・法人税割）を県・市別に分けて算出する。事業税・特別法人事業税は
 * 全国標準税率のため calcBusinessTaxByBrackets（共通ヘルパー）をそのまま用いる。
 */
export function buildLocalCorporateTaxFormForRegion(
  estimate: CorporateEstimate,
  nationalTaxForm: CorporateTaxForm,
  config: LocalTaxRateConfig
): RegionalLocalTaxForm {
  const perCapitaTaxPrefecture = config.perCapitaTaxPrefecture;
  const perCapitaTaxMunicipality = config.perCapitaTaxMunicipality ?? 0;

  const corporateTaxLevyPrefecture =
    config.corporateTaxLevyRatePrefecture !== null
      ? Math.floor(nationalTaxForm.line2_corporateTax * config.corporateTaxLevyRatePrefecture)
      : 0;
  const corporateTaxLevyMunicipality = Math.floor(
    nationalTaxForm.line2_corporateTax * config.corporateTaxLevyRateMunicipality
  );

  const inhabitantTaxTotal =
    perCapitaTaxPrefecture + perCapitaTaxMunicipality + corporateTaxLevyPrefecture + corporateTaxLevyMunicipality;

  const businessTax = calcBusinessTaxByBrackets(estimate.taxableIncome);

  return {
    perCapitaTaxPrefecture,
    perCapitaTaxMunicipality,
    corporateTaxLevyPrefecture,
    corporateTaxLevyMunicipality,
    inhabitantTaxTotal,
    businessTaxSubtotal: businessTax.businessTaxSubtotal,
    specialBusinessTax: businessTax.specialBusinessTax,
    businessTaxTotal: businessTax.businessTaxTotal,
    grandTotal: inhabitantTaxTotal + businessTax.businessTaxTotal,
    verified: config.verified,
  };
}
