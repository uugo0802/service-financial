import { describe, expect, it } from "vitest";
import { buildLocalCorporateTaxForm } from "./localCorporateTaxForm";
import { buildLocalCorporateTaxFormForRegion, TAX_RATE_CONFIGS } from "./taxRateMaster";
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

describe("TAX_RATE_CONFIGS", () => {
  it("has exactly the two configured regions (tokyo-23ku, kanagawa-hiratsuka)", () => {
    expect(Object.keys(TAX_RATE_CONFIGS).sort()).toEqual(["kanagawa-hiratsuka", "tokyo-23ku"]);
  });

  it("marks tokyo-23ku as verified and kanagawa-hiratsuka as unverified", () => {
    expect(TAX_RATE_CONFIGS["tokyo-23ku"].verified).toBe(true);
    expect(TAX_RATE_CONFIGS["kanagawa-hiratsuka"].verified).toBe(false);
    // 未検証エントリの sourceNote には、平塚市公式サイトでの確認を促す注記が必須。
    expect(TAX_RATE_CONFIGS["kanagawa-hiratsuka"].sourceNote).toContain("CLAUDE.md");
    expect(TAX_RATE_CONFIGS["kanagawa-hiratsuka"].sourceNote).toContain("平塚市");
  });

  it("represents tokyo-23ku as having no municipal tax (23区は都民税に一本化)", () => {
    const config = TAX_RATE_CONFIGS["tokyo-23ku"];
    expect(config.municipalityName).toBeNull();
    expect(config.perCapitaTaxMunicipality).toBeNull();
    expect(config.corporateTaxLevyRatePrefecture).toBeNull();
  });
});

describe("buildLocalCorporateTaxFormForRegion", () => {
  describe("tokyo-23ku (regression against buildLocalCorporateTaxForm)", () => {
    // tokyo-23ku を使った場合、既存の buildLocalCorporateTaxForm（東京23区限定の実装）と
    // 結果が完全に一致すること（リグレッションがないことの担保）。
    const cases: [income: number, corporateTax: number][] = [
      [1_234_567, 185_185],
      [4_000_000, 0],
      [10_000_000, 1_000_000],
      [9_500_000, 723_456],
      [0, 0],
    ];

    it.each(cases)("matches buildLocalCorporateTaxForm for income=%i, corporateTax=%i", (income, corporateTax) => {
      const legacy = buildLocalCorporateTaxForm(estimate(income), taxForm(corporateTax));
      const regional = buildLocalCorporateTaxFormForRegion(
        estimate(income),
        taxForm(corporateTax),
        TAX_RATE_CONFIGS["tokyo-23ku"]
      );

      expect(regional.perCapitaTaxPrefecture).toBe(legacy.perCapitaTax);
      expect(regional.perCapitaTaxMunicipality).toBe(0);
      expect(regional.corporateTaxLevyPrefecture).toBe(0);
      expect(regional.corporateTaxLevyMunicipality).toBe(legacy.corporateTaxLevy);
      expect(regional.inhabitantTaxTotal).toBe(legacy.inhabitantTaxTotal);
      expect(regional.businessTaxSubtotal).toBe(legacy.businessTaxSubtotal);
      expect(regional.specialBusinessTax).toBe(legacy.specialBusinessTax);
      expect(regional.businessTaxTotal).toBe(legacy.businessTaxTotal);
      expect(regional.grandTotal).toBe(legacy.grandTotal);
      expect(regional.verified).toBe(true);
    });
  });

  describe("kanagawa-hiratsuka", () => {
    // 以下は「設定した税率通りに計算できているか」の検証であり、税率そのものの正しさ
    // （実際に平塚市に納める金額と一致するか）は保証しない。TAX_RATE_CONFIGS["kanagawa-hiratsuka"]
    // は CLAUDE.md 記載の暫定値・未検証であるため、実際の納付額と一致する保証はない。
    it("splits per-capita tax and corporate tax levy into prefecture (神奈川県) and municipality (平塚市)", () => {
      const result = buildLocalCorporateTaxFormForRegion(
        estimate(1_234_567),
        taxForm(185_185),
        TAX_RATE_CONFIGS["kanagawa-hiratsuka"]
      );

      // 均等割（県）= 20,000円、均等割（市）= 50,000円（いずれも固定額）
      expect(result.perCapitaTaxPrefecture).toBe(20_000);
      expect(result.perCapitaTaxMunicipality).toBe(50_000);

      // 法人税割（県）= floor(185,185 * 1.0%) = floor(1,851.85) = 1,851
      expect(result.corporateTaxLevyPrefecture).toBe(1_851);
      // 法人税割（市）= floor(185,185 * 6.0%) = floor(11,111.1) = 11,111
      expect(result.corporateTaxLevyMunicipality).toBe(11_111);

      expect(result.inhabitantTaxTotal).toBe(20_000 + 50_000 + 1_851 + 11_111);
      expect(result.verified).toBe(false);
    });

    it("computes business tax and special business tax using the same nationwide-standard bracket logic", () => {
      const result = buildLocalCorporateTaxFormForRegion(
        estimate(10_000_000),
        taxForm(1_000_000),
        TAX_RATE_CONFIGS["kanagawa-hiratsuka"]
      );

      // 事業税所得割 = 400万円×3.5% + 400万円×5.3% + 200万円×7.0% = 140,000 + 212,000 + 140,000
      expect(result.businessTaxSubtotal).toBe(140_000 + 212_000 + 140_000);
      // 特別法人事業税 = floor(492,000 * 37%) = 182,040
      expect(result.specialBusinessTax).toBe(182_040);
      expect(result.businessTaxTotal).toBe(492_000 + 182_040);
    });

    it("sums grandTotal from inhabitant tax and business tax components", () => {
      const result = buildLocalCorporateTaxFormForRegion(
        estimate(9_500_000),
        taxForm(723_456),
        TAX_RATE_CONFIGS["kanagawa-hiratsuka"]
      );

      expect(result.grandTotal).toBe(result.inhabitantTaxTotal + result.businessTaxTotal);
      expect(result.grandTotal).toBe(
        result.perCapitaTaxPrefecture +
          result.perCapitaTaxMunicipality +
          result.corporateTaxLevyPrefecture +
          result.corporateTaxLevyMunicipality +
          result.businessTaxSubtotal +
          result.specialBusinessTax
      );
    });

    it("still applies the fixed per-capita tax when taxable income is zero", () => {
      const result = buildLocalCorporateTaxFormForRegion(estimate(0), taxForm(0), TAX_RATE_CONFIGS["kanagawa-hiratsuka"]);

      expect(result.businessTaxSubtotal).toBe(0);
      expect(result.specialBusinessTax).toBe(0);
      expect(result.corporateTaxLevyPrefecture).toBe(0);
      expect(result.corporateTaxLevyMunicipality).toBe(0);
      expect(result.inhabitantTaxTotal).toBe(20_000 + 50_000);
      expect(result.grandTotal).toBe(20_000 + 50_000);
      expect(result.verified).toBe(false);
    });
  });
});
