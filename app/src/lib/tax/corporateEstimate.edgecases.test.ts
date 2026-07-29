import { describe, expect, it } from "vitest";
import { estimateForMicroCorp } from "./corporateEstimate";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("estimateForMicroCorp - expenses only, zero income", () => {
  it("floors taxable income at zero instead of going negative", () => {
    const rows = [
      tx({ id: "1", amount: -100000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({ id: "2", amount: -30000, account: "通信費", taxCategory: "課税仕入8%(軽減)" }),
    ];
    const estimate = estimateForMicroCorp(rows);

    expect(estimate.revenue).toBe(0);
    expect(estimate.expenses).toBe(130000);
    // revenue - expenses = -130000, but taxableIncome is clamped to a minimum of 0
    expect(estimate.taxableIncome).toBe(0);
  });

  it("produces zero corporate tax and zero national tax", () => {
    const rows = [tx({ id: "1", amount: -500000, account: "外注費", taxCategory: "課税仕入10%" })];
    const estimate = estimateForMicroCorp(rows);

    expect(estimate.corporateTax).toBe(0);
    expect(estimate.localCorporateTax).toBe(0);
    expect(estimate.totalNationalTax).toBe(0);
    // the per-capita reference amount is a flat constant, unrelated to income
    expect(estimate.perCapitaTaxReference).toBe(70000);
  });

  it("treats the business as a likely consumption tax exempt filer with no sales tax collected", () => {
    const rows = [tx({ id: "1", amount: -80000, account: "水道光熱費", taxCategory: "課税仕入10%" })];
    const estimate = estimateForMicroCorp(rows);

    expect(estimate.consumptionTax.isLikelyExempt).toBe(true);
    expect(estimate.consumptionTax.salesTax).toBe(0);
  });

  it("still accumulates deductible purchase tax from expenses, but payable is clamped at zero (no refund)", () => {
    const rows = [
      tx({ id: "1", amount: -110000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({ id: "2", amount: -10800, account: "通信費", taxCategory: "課税仕入8%(軽減)" }),
    ];
    const estimate = estimateForMicroCorp(rows);

    // extractTax(110000, 10) = round(110000*10/110) = 10000
    // extractTax(10800, 8) = round(10800*8/108) = 800
    expect(estimate.consumptionTax.purchaseTax).toBe(10800);
    // with zero sales tax collected, payable never goes negative even though purchase tax was incurred
    expect(estimate.consumptionTax.payable).toBe(0);
  });

  it("ignores expenses with a non-taxable category when computing purchase tax", () => {
    const rows = [
      tx({ id: "1", amount: -50000, account: "法定福利費", taxCategory: "不課税" }),
      tx({ id: "2", amount: -20000, account: "雑費", taxCategory: "対象外" }),
    ];
    const estimate = estimateForMicroCorp(rows);

    expect(estimate.expenses).toBe(70000);
    expect(estimate.consumptionTax.purchaseTax).toBe(0);
    expect(estimate.consumptionTax.payable).toBe(0);
  });

  // Regression: loan proceeds and capital contributions are balance-sheet items, not corporate
  // revenue. A micro-corp's initial 資本金 payment or a business loan drawdown (both routinely
  // categorized this way by the rule dictionary) must not be summed into revenue/taxableIncome
  // as if it were a taxable sale.
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

    const estimate = estimateForMicroCorp(rows);

    expect(estimate.revenue).toBe(3_000_000);
    expect(estimate.taxableIncome).toBe(3_000_000);
    // Total cash in (10,000,000) exceeds the 10,000,000 exemption threshold, but actual revenue
    // is only 3,000,000, so this should still read as likely-exempt.
    expect(estimate.consumptionTax.isLikelyExempt).toBe(true);
  });

  it("returns all zeroed figures for a fully empty transaction list", () => {
    const estimate = estimateForMicroCorp([]);

    expect(estimate.revenue).toBe(0);
    expect(estimate.expenses).toBe(0);
    expect(estimate.taxableIncome).toBe(0);
    expect(estimate.corporateTax).toBe(0);
    expect(estimate.localCorporateTax).toBe(0);
    expect(estimate.totalNationalTax).toBe(0);
    expect(estimate.consumptionTax).toEqual({
      isLikelyExempt: true,
      salesTax: 0,
      purchaseTax: 0,
      payable: 0,
    });
  });
});
