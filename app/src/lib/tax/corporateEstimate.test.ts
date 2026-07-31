import { describe, expect, it } from "vitest";
import { estimateForMicroCorp } from "./corporateEstimate";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("estimateForMicroCorp", () => {
  it("computes taxable income, corporate tax and consumption tax for a realistic profitable year", () => {
    const rows = [
      tx({ id: "1", amount: 5_500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 2_200_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "3", amount: -1_100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({ id: "4", amount: -270_000, account: "会議費", taxCategory: "課税仕入8%(軽減)" }),
      tx({ id: "5", amount: -900_000, account: "給与手当", taxCategory: "対象外" }),
    ];

    const result = estimateForMicroCorp(rows);

    expect(result.revenue).toBe(7_700_000);
    expect(result.expenses).toBe(2_270_000);
    expect(result.taxableIncome).toBe(5_430_000);
    // Entire income falls under the 800万円 reduced-rate threshold: 5,430,000 * 15%
    expect(result.corporateTax).toBe(814_500);
    // 地方法人税 = 法人税額 × 10.3%
    expect(result.localCorporateTax).toBe(83_893);
    expect(result.totalNationalTax).toBe(898_393);
    expect(result.perCapitaTaxReference).toBe(70_000);

    expect(result.consumptionTax.isLikelyExempt).toBe(true); // revenue <= 10,000,000
    expect(result.consumptionTax.salesTax).toBe(700_000);
    expect(result.consumptionTax.purchaseTax).toBe(120_000);
    expect(result.consumptionTax.payable).toBe(580_000);
  });

  // Regression: consumption tax on sales/purchases must be derived from the aggregated
  // tax-inclusive total per rate, not from summing each transaction's individually-truncated
  // tax (same bug pattern already fixed for buildConsumptionTaxForm in commit 2c20dc7). Summing
  // per-transaction truncations loses fractional yen on every row instead of just once on the
  // combined total, so the estimate can drift away from the amount the aggregate-based
  // calculation (the legally correct 割戻し計算 method) would produce.
  it("derives consumption tax on sales from the aggregated taxable total, not from summed per-transaction truncations", () => {
    const rows = [
      tx({ id: "1", amount: 105, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 115, taxCategory: "課税売上10%" }),
    ];
    const result = estimateForMicroCorp(rows);

    // Per-transaction: floor(105*10/110)=9, floor(115*10/110)=10 -> summed = 19 (wrong).
    // Aggregated: floor(220*10/110) = 20 (correct).
    expect(result.consumptionTax.salesTax).toBe(20);
  });

  it("derives consumption tax on purchases from the aggregated taxable total, not from summed per-transaction truncations", () => {
    const rows = [
      tx({ id: "1", amount: -105, account: "外注費", taxCategory: "課税仕入10%" }),
      tx({ id: "2", amount: -115, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const result = estimateForMicroCorp(rows);

    // Per-transaction: floor(105*10/110)=9, floor(115*10/110)=10 -> summed = 19 (wrong).
    // Aggregated: floor(220*10/110) = 20 (correct).
    expect(result.consumptionTax.purchaseTax).toBe(20);
  });

  it("splits taxable income across the reduced-rate and standard-rate brackets once it exceeds 8,000,000", () => {
    const rows = [
      tx({ id: "1", amount: 9_500_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForMicroCorp(rows);

    expect(result.taxableIncome).toBe(8_500_000);
    // 8,000,000 * 15% + 500,000 * 23.2%
    expect(result.corporateTax).toBe(1_316_000);
    expect(result.localCorporateTax).toBe(135_548);
    expect(result.totalNationalTax).toBe(1_451_548);
  });

  it("treats income right at the 8,000,000 reduced-rate threshold as fully reduced-rate (no standard portion)", () => {
    const rows = [tx({ id: "1", amount: 8_000_000, taxCategory: "課税売上10%" })];

    const result = estimateForMicroCorp(rows);

    expect(result.taxableIncome).toBe(8_000_000);
    // Entirely within the reduced-rate bracket: 8,000,000 * 15%, no 23.2% portion applied
    expect(result.corporateTax).toBe(1_200_000);
  });

  it("floors negative income to zero for a loss-making year, but still reports the per-capita reference", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_500_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForMicroCorp(rows);

    expect(result.taxableIncome).toBe(0);
    expect(result.corporateTax).toBe(0);
    expect(result.localCorporateTax).toBe(0);
    expect(result.totalNationalTax).toBe(0);
    // 均等割は所得がゼロでも発生する
    expect(result.perCapitaTaxReference).toBe(70_000);
  });

  it("rounds taxable income down to the nearest 1,000 yen", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_999, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -500_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForMicroCorp(rows);

    expect(result.taxableIncome).toBe(500_000);
  });

  it("excludes loan disbursements and capital contributions (excludeFromIncome) from revenue and taxable income", () => {
    const rows = [
      tx({ id: "1", amount: 4_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 10_000_000, account: "元入金", taxCategory: "対象外", excludeFromIncome: true }),
      tx({ id: "3", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForMicroCorp(rows);

    // 出資払込10,000,000円は益金ではないため、revenueに含まれない
    expect(result.revenue).toBe(4_000_000);
    expect(result.taxableIncome).toBe(3_000_000);
  });

  // Regression: excludeFromIncome must take priority over taxCategory when computing the
  // consumption tax on sales, not just revenue/taxableIncome. The rule dictionary always pairs
  // excludeFromIncome with taxCategory "対象外", but AI classification (aiEscalate.ts)
  // re-attaches excludeFromIncome from the account name independently of the LLM-supplied
  // taxCategory, so the two can disagree (e.g. account="元入金" with taxCategory="課税売上10%").
  // Before this fix, salesTax10 was computed from the unfiltered `income` list, so a capital
  // injection mistakenly tagged with a taxable-sales category would have leaked phantom
  // consumption tax into the payable amount even though it's correctly excluded from revenue.
  it("excludes an excludeFromIncome row from consumption tax on sales even if its taxCategory is mistakenly '課税売上10%'", () => {
    const rows = [
      tx({ id: "1", amount: 4_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({
        id: "2",
        amount: 10_000_000,
        account: "元入金",
        taxCategory: "課税売上10%", // mis-tagged by AI classification; excludeFromIncome must still win
        excludeFromIncome: true,
      }),
    ];

    const result = estimateForMicroCorp(rows);

    // Only the genuine 4,000,000 sale should be taxed: 4,000,000 * 10/110 = 363,636.36... -> 363,636
    expect(result.consumptionTax.salesTax).toBe(363_636);
  });

  it("marks consumption tax as not exempt once revenue exceeds 10,000,000", () => {
    const rows = [tx({ id: "1", amount: 11_000_000, taxCategory: "課税売上10%" })];

    const result = estimateForMicroCorp(rows);

    expect(result.consumptionTax.isLikelyExempt).toBe(false);
  });

  // Regression: consumption tax amounts extracted from a tax-inclusive total must be truncated
  // (円未満切り捨て), not rounded to the nearest yen. Math.round silently rounded .5-and-above
  // fractional yen up, overstating the estimated consumption tax collected on sales.
  it("truncates (does not round) the extracted consumption tax on a sale with a fractional yen remainder", () => {
    const rows = [tx({ id: "1", amount: 1000, account: "売上高", taxCategory: "課税売上10%" })];
    const result = estimateForMicroCorp(rows);

    // 1,000 * 10/110 = 90.909... → truncated to 90円 (Math.round would incorrectly give 91)
    expect(result.consumptionTax.salesTax).toBe(90);
  });

  it("returns zeroed figures for an empty input", () => {
    const result = estimateForMicroCorp([]);

    expect(result.revenue).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.taxableIncome).toBe(0);
    expect(result.corporateTax).toBe(0);
    expect(result.localCorporateTax).toBe(0);
    expect(result.totalNationalTax).toBe(0);
    expect(result.consumptionTax.isLikelyExempt).toBe(true);
    expect(result.consumptionTax.payable).toBe(0);
  });

  describe("loss carryforward (繰越欠損金)", () => {
    const profitableRows = [
      tx({ id: "1", amount: 5_500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 2_200_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "3", amount: -1_100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({ id: "4", amount: -270_000, account: "会議費", taxCategory: "課税仕入8%(軽減)" }),
    ];
    // revenue = 7,700,000; expenses = 1,370,000; taxableIncome (no carryforward) = 6,330,000

    it("is byte-for-byte identical to the baseline when the second argument is omitted or undefined", () => {
      const baseline = estimateForMicroCorp(profitableRows);
      const withUndefined = estimateForMicroCorp(profitableRows, undefined);

      expect(withUndefined).toEqual(baseline);
      expect(baseline.lossCarryforward).toBeUndefined();
      expect(baseline.taxableIncome).toBe(6_330_000);
      expect(baseline.assumptions.at(-1)).toContain("考慮していません");
    });

    it("fully absorbs a single prior-year loss smaller than this year's income", () => {
      const result = estimateForMicroCorp(profitableRows, {
        currentFiscalYear: 2026,
        priorLosses: [{ fiscalYear: 2025, remainingLoss: 2_000_000 }],
      });

      expect(result.lossCarryforward?.totalDeduction).toBe(2_000_000);
      expect(result.lossCarryforward?.incomeAfterCarryforward).toBe(4_330_000);
      expect(result.taxableIncome).toBe(4_330_000);
      // Corporate tax should now be computed on the reduced base: 4,330,000 * 15%
      expect(result.corporateTax).toBe(649_500);
      expect(result.assumptions.at(-1)).toContain("2,000,000円");
    });

    it("partially carries a loss forward across multiple prior years (oldest used first)", () => {
      const result = estimateForMicroCorp(profitableRows, {
        currentFiscalYear: 2026,
        priorLosses: [
          { fiscalYear: 2020, remainingLoss: 4_000_000 },
          { fiscalYear: 2023, remainingLoss: 4_000_000 },
        ],
      });

      // 6,330,000 of income offsets the full 2020 loss (4,000,000) then 2,330,000 of the 2023 loss
      expect(result.lossCarryforward?.totalDeduction).toBe(6_330_000);
      expect(result.lossCarryforward?.incomeAfterCarryforward).toBe(0);
      expect(result.taxableIncome).toBe(0);
      expect(result.corporateTax).toBe(0);
      expect(result.lossCarryforward?.usage[0]).toMatchObject({ fiscalYear: 2020, status: "used" });
      expect(result.lossCarryforward?.usage[1]).toMatchObject({
        fiscalYear: 2023,
        usedThisYear: 2_330_000,
        status: "partially_used",
      });
    });

    it("does not apply a prior-year loss older than the 10-year corporate carryforward window", () => {
      const result = estimateForMicroCorp(profitableRows, {
        currentFiscalYear: 2026,
        priorLosses: [{ fiscalYear: 2015, remainingLoss: 1_000_000 }], // age = 11, past the 10-year window
      });

      expect(result.lossCarryforward?.totalDeduction).toBe(0);
      expect(result.lossCarryforward?.usage[0].status).toBe("expired");
      expect(result.taxableIncome).toBe(estimateForMicroCorp(profitableRows).taxableIncome);
    });

    it("respects an explicit deductionCapRatio (e.g. a large-corporation 50% limit)", () => {
      const result = estimateForMicroCorp(profitableRows, {
        currentFiscalYear: 2026,
        priorLosses: [{ fiscalYear: 2025, remainingLoss: 6_000_000 }],
        deductionCapRatio: 0.5,
      });

      // Cap = floor(6,330,000 * 0.5) = 3,165,000
      expect(result.lossCarryforward?.totalDeduction).toBe(3_165_000);
      expect(result.taxableIncome).toBe(3_165_000);
    });
  });
});
