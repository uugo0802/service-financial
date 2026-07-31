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

  // Regression: loan proceeds and capital contributions are balance-sheet items, not corporate
  // revenue. A micro-corp's initial 資本金 payment or a business loan drawdown (both routinely
  // categorized this way by the rule dictionary) must not be summed into revenue/taxableIncome
  // as if it were a taxable sale, and must not push the consumption-tax exemption check to false.
  it("excludes loan proceeds and capital contributions from revenue, taxable income, and the exemption threshold", () => {
    const rows = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({
        id: "2",
        amount: 5_000_000,
        account: "借入金",
        taxCategory: "対象外",
        excludeFromIncome: true,
      }),
      tx({
        id: "3",
        amount: 2_000_000,
        account: "元入金",
        taxCategory: "対象外",
        excludeFromIncome: true,
      }),
    ];

    const result = estimateForMicroCorp(rows);

    expect(result.revenue).toBe(3_000_000);
    expect(result.taxableIncome).toBe(3_000_000);
    // Total cash in (10,000,000) exceeds the 10,000,000 exemption threshold, but actual revenue
    // is only 3,000,000, so this should still read as likely-exempt.
    expect(result.consumptionTax.isLikelyExempt).toBe(true);
  });

  // Regression: consumption tax on sales/purchases must be derived from the aggregated
  // tax-inclusive total per rate, not from summing each transaction's individually-truncated
  // tax. Summing per-transaction truncations loses fractional yen on every row instead of just
  // once on the combined total.
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

  it("marks consumption tax as not exempt once revenue exceeds 10,000,000", () => {
    const rows = [tx({ id: "1", amount: 11_000_000, taxCategory: "課税売上10%" })];

    const result = estimateForMicroCorp(rows);

    expect(result.consumptionTax.isLikelyExempt).toBe(false);
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
});
