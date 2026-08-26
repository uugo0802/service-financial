import { ProvisionalInterimTaxResult } from "./corporateInterimTax";

// ------------------------------------------------------------------
// 「租税公課の納付状況等に関する明細書 別表五（二）」の簡易生成。
//
// 別表五（一）（利益積立金額及び資本金等の額の計算に関する明細書、別スペックで設計）の
// 「未納法人税等」「未納道府県民税」「未納市町村民税」欄、および「納税充当金」欄は、
// 実務上そのまま別表五（二）の集計値を転記する構造になっている。実際に提出された
// 別表五（二）（国税庁提出分）を参照すると、以下の対応関係が確認できた:
//   - 別表五（二）の「期末納税充当金」＝ 別表五（一）row26「納税充当金」
//   - 別表五（二）の各税目の「期末現在未納税額」＝
//     別表五（一）のrow27（未納法人税等）／row29（未納道府県民税）／row30（未納市町村民税）
//
// スコープ外（常に0円・空欄・対象外として扱う）:
//   - 道府県民税・市町村民税・事業税の中間納付額の計算（該当する計算ロジックが
//     コードに存在しないため。将来必要になれば別スペックで対応する）
//   - 「その他」区分（利子税・延滞金・加算税及び加算金・延滞税・過怠税、row20-29）の実額計算
//   - 「通算法人の通算税効果額の発生状況等の明細」（row42-45）
// ------------------------------------------------------------------

/**
 * 前期確定額のうち、期首時点でまだ納付していない金額（2期目以降のみ指定。
 * 初年度は指定不要＝すべて0として扱う）。
 */
export interface PriorYearUnpaidTaxAmounts {
  nationalTax: number; // 法人税及び地方法人税（確定分の合計）
  prefectureTax: number; // 道府県民税
  municipalityTax: number; // 市町村民税
  businessTax: number; // 事業税及び特別法人事業税
}

export interface TaxTypeRow {
  label: string;
  openingUnpaid: number; // ① 期首現在未納税額
  interimAccrued: number; // ② 当期発生税額（中間分）
  finalAccrued: number; // ② 当期発生税額（確定分）
  interimPaidByDeduction: number; // ⑤ 損金経理による納付（中間分。今回は中間納付があれば全額納付済みとして扱う）
  closingUnpaid: number; // ⑥ 期末現在未納税額 = ①＋②(中間+確定)－⑤
}

export interface Form5_2Inputs {
  priorYearUnpaid?: PriorYearUnpaidTaxAmounts; // 省略時＝初年度（すべて0）
  interimTax: ProvisionalInterimTaxResult | null; // corporateInterimTax.tsの結果。中間納付が不要な場合はnull
  finalNationalTax: number; // 確定 法人税＋地方法人税（CorporateTaxForm.totalNationalTaxを想定）
  finalPrefectureTax: number; // 確定 道府県民税（RegionalLocalTaxForm由来）
  finalMunicipalityTax: number; // 確定 市町村民税（RegionalLocalTaxForm由来）
  finalBusinessTax: number; // 確定 事業税及び特別法人事業税（RegionalLocalTaxForm.businessTaxTotal）
}

export interface TaxProvisionCalculation {
  openingProvision: number; // 期首納税充当金（2期目以降のみ。初年度は0）
  addition: number; // 繰入額＝損金経理をした納税充当金（＝当期の確定税額合計。別表四の加算額と一致させる）
  withdrawal: number; // 取崩額（今回は常に0固定。中間納付済み分は「損金経理による納付」欄で別途減算するため、納税充当金の取崩しとしては扱わない）
  closingProvision: number; // 期末納税充当金 = openingProvision + addition - withdrawal
}

export interface Form5_2Result {
  nationalTaxRow: TaxTypeRow;
  prefectureTaxRow: TaxTypeRow;
  municipalityTaxRow: TaxTypeRow;
  businessTaxRow: TaxTypeRow;
  taxProvision: TaxProvisionCalculation;
}

const ZERO_PRIOR_YEAR_UNPAID: PriorYearUnpaidTaxAmounts = {
  nationalTax: 0,
  prefectureTax: 0,
  municipalityTax: 0,
  businessTax: 0,
};

/**
 * 税目1件分の「期首未納税額・当期発生税額（中間・確定）・当期中の納付額・期末未納税額」を計算する。
 * closingUnpaid = openingUnpaid + interimAccrued + finalAccrued - interimPaidByDeduction
 */
function buildTaxTypeRow(label: string, openingUnpaid: number, interimAccrued: number, finalAccrued: number): TaxTypeRow {
  // 中間納付が発生した税目は、その全額を「損金経理による納付」として納付済み扱いにする
  // （＝中間申告分はこのアプリの利用時点で既に納付済みという前提。未納のまま繰り越すケースは扱わない）。
  // 確定分は今回参照した実例（初年度、確定分は全額未納のまま期末を迎えている）に合わせ、
  // 常に未納のまま残す（interimPaidByDeductionは確定分には適用しない）。
  const interimPaidByDeduction = interimAccrued;
  const closingUnpaid = openingUnpaid + interimAccrued + finalAccrued - interimPaidByDeduction;

  return {
    label,
    openingUnpaid,
    interimAccrued,
    finalAccrued,
    interimPaidByDeduction,
    closingUnpaid,
  };
}

export function buildForm5_2(inputs: Form5_2Inputs): Form5_2Result {
  const priorYearUnpaid = inputs.priorYearUnpaid ?? ZERO_PRIOR_YEAR_UNPAID;

  // interimAccrued（中間分の当期発生額）は、税目が「法人税及び地方法人税」の場合のみ
  // interimTax（corporateInterimTax.tsの結果）から取得する。道府県民税・市町村民税・
  // 事業税は常に0（スコープ外のため、該当する計算ロジックがコードに存在しない）。
  const nationalInterimAccrued =
    inputs.interimTax !== null && inputs.interimTax.required
      ? inputs.interimTax.corporateTaxPrepayment + inputs.interimTax.localCorporateTaxPrepayment
      : 0;

  const nationalTaxRow = buildTaxTypeRow(
    "法人税及び地方法人税",
    priorYearUnpaid.nationalTax,
    nationalInterimAccrued,
    inputs.finalNationalTax
  );
  const prefectureTaxRow = buildTaxTypeRow("道府県民税", priorYearUnpaid.prefectureTax, 0, inputs.finalPrefectureTax);
  const municipalityTaxRow = buildTaxTypeRow("市町村民税", priorYearUnpaid.municipalityTax, 0, inputs.finalMunicipalityTax);
  const businessTaxRow = buildTaxTypeRow(
    "事業税及び特別法人事業税",
    priorYearUnpaid.businessTax,
    0,
    inputs.finalBusinessTax
  );

  // 納税充当金の計算。
  // 期首納税充当金は、前期末に「未納税額に充てるために積み立てられた」金額であり、
  // 背景・目的に記載の対応関係（期末納税充当金＝別表五（一）row26、各税目の期末現在未納税額＝
  // 別表五（一）row27/29/30）から、前期末時点では両者が一致している前提を置く。そのため
  // 期首納税充当金は、priorYearUnpaid（前期確定額のうち期首時点で未納の金額）の4税目合計とする
  // （初年度はpriorYearUnpaid省略＝すべて0のため、期首納税充当金も0になる）。
  const openingProvision =
    priorYearUnpaid.nationalTax + priorYearUnpaid.prefectureTax + priorYearUnpaid.municipalityTax + priorYearUnpaid.businessTax;

  // 繰入額＝損金経理をした納税充当金＝当期の確定税額（4税目のfinalAccrued）の合計。
  const addition =
    nationalTaxRow.finalAccrued + prefectureTaxRow.finalAccrued + municipalityTaxRow.finalAccrued + businessTaxRow.finalAccrued;

  // 取崩額は常に0固定（中間納付済み分は各税目の「損金経理による納付」欄で減算済みのため、
  // 納税充当金の取崩しとしては扱わない）。
  const withdrawal = 0;
  const closingProvision = openingProvision + addition - withdrawal;

  return {
    nationalTaxRow,
    prefectureTaxRow,
    municipalityTaxRow,
    businessTaxRow,
    taxProvision: {
      openingProvision,
      addition,
      withdrawal,
      closingProvision,
    },
  };
}
