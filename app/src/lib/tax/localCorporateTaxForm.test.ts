import { describe, expect, it } from "vitest";
import { buildLocalCorporateTaxForm } from "./localCorporateTaxForm";
import { CorporateEstimate } from "./corporateEstimate";
import { CorporateTaxForm } from "./corporateForms";

function estimate(taxableIncome: number): CorporateEstimate {
  return {
    revenue: taxableIncome,
    expenses: 0,
    taxableIncome,
    corporateTax: 0,
    localCorporateTax: 0,
    perCapitaTaxReference: 70000,
    totalNationalTax: 0,
    consumptionTax: { isLikelyExempt: true, salesTax: 0, purchaseTax: 0, payable: 0 },
    assumptions: [],
  };
}

function taxForm(line2_corporateTax: number): CorporateTaxForm {
  return {
    line1_income: 0,
    line45_reducedBase: 0,
    line48_reducedTax: 0,
    line47_excessBase: 0,
    line50_excessTax: 0,
    line2_corporateTax,
    line9_corporateTaxTotal: line2_corporateTax,
    line13_netCorporateTax: line2_corporateTax,
    line15_finalCorporateTax: line2_corporateTax,
    line28_localTaxBase: line2_corporateTax,
    line31_localCorporateTax: 0,
    line38_netLocalCorporateTax: 0,
    line40_finalLocalCorporateTax: 0,
    totalNationalTax: line2_corporateTax,
  };
}

describe("buildLocalCorporateTaxForm", () => {
  it("computes only the first business tax bracket when income is below ¥4,000,000, flooring fractional yen", () => {
    const result = buildLocalCorporateTaxForm(estimate(1_234_567), taxForm(185_185));

    // 均等割（固定）
    expect(result.perCapitaTax).toBe(70_000);
    // 法人税割 = floor(185,185 * 7.0%) = floor(12,962.95) = 12,962
    expect(result.corporateTaxLevy).toBe(12_962);
    expect(result.inhabitantTaxTotal).toBe(70_000 + 12_962);

    // 全額が第1段階（400万円以下、3.5%）
    expect(result.businessTaxBracket1).toBe(1_234_567);
    expect(result.businessTaxBracket2).toBe(0);
    expect(result.businessTaxBracket3).toBe(0);

    // floor(1,234,567 * 3.5%) = floor(43,209.845) = 43,209
    expect(result.businessTaxByBracket).toEqual([
      { base: 1_234_567, rate: 0.035, tax: 43_209 },
      { base: 0, rate: 0.053, tax: 0 },
      { base: 0, rate: 0.07, tax: 0 },
    ]);
    expect(result.businessTaxSubtotal).toBe(43_209);

    // 特別法人事業税 = floor(43,209 * 37%) = floor(15,987.33) = 15,987
    expect(result.specialBusinessTax).toBe(15_987);
    expect(result.businessTaxTotal).toBe(43_209 + 15_987);
  });

  // Boundary regression: 400万円は「以下」がブラケット1（3.5%）の範囲であり、ブラケット2
  // （3.5%超800万円以下、5.3%）に漏れてはならない。bracket1Base = Math.min(income, 4,000,000)
  // なので、income がちょうど4,000,000円のときは全額がブラケット1に収まり、ブラケット2・3は
  // 0円になるべきことを固定する。
  it("keeps income exactly at ¥4,000,000 entirely within the first bracket (boundary)", () => {
    const result = buildLocalCorporateTaxForm(estimate(4_000_000), taxForm(0));

    expect(result.businessTaxBracket1).toBe(4_000_000);
    expect(result.businessTaxBracket2).toBe(0);
    expect(result.businessTaxBracket3).toBe(0);
    expect(result.businessTaxByBracket).toEqual([
      { base: 4_000_000, rate: 0.035, tax: 140_000 },
      { base: 0, rate: 0.053, tax: 0 },
      { base: 0, rate: 0.07, tax: 0 },
    ]);
  });

  it("spans all three business tax brackets when income exceeds ¥8,000,000", () => {
    const result = buildLocalCorporateTaxForm(estimate(10_000_000), taxForm(1_000_000));

    // 400万円 / 400万円（400万円超800万円以下）/ 200万円（800万円超）に按分
    expect(result.businessTaxBracket1).toBe(4_000_000);
    expect(result.businessTaxBracket2).toBe(4_000_000);
    expect(result.businessTaxBracket3).toBe(2_000_000);

    expect(result.businessTaxByBracket).toEqual([
      { base: 4_000_000, rate: 0.035, tax: 140_000 },
      { base: 4_000_000, rate: 0.053, tax: 212_000 },
      { base: 2_000_000, rate: 0.07, tax: 140_000 },
    ]);
    expect(result.businessTaxSubtotal).toBe(140_000 + 212_000 + 140_000);

    // 特別法人事業税 = 事業税所得割額 × 37%
    expect(result.specialBusinessTax).toBe(Math.floor(492_000 * 0.37));
    expect(result.businessTaxTotal).toBe(492_000 + 182_040);

    // 法人税割 = floor(1,000,000 * 7.0%) = 70,000
    expect(result.corporateTaxLevy).toBe(70_000);
    expect(result.inhabitantTaxTotal).toBe(70_000 + 70_000);
  });

  it("sums grandTotal from the inhabitant tax, business tax and special business tax components", () => {
    const result = buildLocalCorporateTaxForm(estimate(9_500_000), taxForm(723_456));

    expect(result.grandTotal).toBe(result.inhabitantTaxTotal + result.businessTaxTotal);
    expect(result.grandTotal).toBe(
      result.perCapitaTax + result.corporateTaxLevy + result.businessTaxSubtotal + result.specialBusinessTax
    );
  });

  it("returns zeroed business tax figures for zero taxable income", () => {
    const result = buildLocalCorporateTaxForm(estimate(0), taxForm(0));

    expect(result.businessTaxBracket1).toBe(0);
    expect(result.businessTaxBracket2).toBe(0);
    expect(result.businessTaxBracket3).toBe(0);
    expect(result.businessTaxSubtotal).toBe(0);
    expect(result.specialBusinessTax).toBe(0);
    expect(result.corporateTaxLevy).toBe(0);
    // 均等割は所得がゼロでも発生する
    expect(result.inhabitantTaxTotal).toBe(70_000);
    expect(result.grandTotal).toBe(70_000);
  });
});
