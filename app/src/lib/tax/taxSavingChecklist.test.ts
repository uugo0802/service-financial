import { describe, expect, it } from "vitest";
import {
  buildIndividualTaxSavingChecklist,
  buildCorporateTaxSavingChecklist,
  TAX_SAVING_DISCLAIMER,
  TaxSavingChecklistItem,
} from "./taxSavingChecklist";
import { estimateForIndividual, IndividualEstimate } from "./estimate";
import { estimateForMicroCorp, CorporateEstimate } from "./corporateEstimate";
import { CategorizedTransaction } from "../categorize/engine";

function fakeIndividualEstimate(overrides: Partial<IndividualEstimate> = {}): IndividualEstimate {
  return {
    totalIncome: 0,
    totalExpense: 0,
    businessProfit: 0,
    socialInsuranceDeduction: 0,
    lifeInsurancePaidInfo: 0,
    blueReturnDeduction: 0,
    taxableIncome: 0,
    incomeTax: { tax: 0, marginalRate: 5 },
    reconstructionSurtax: 0,
    totalIncomeTax: 0,
    consumptionTax: { isLikelyExempt: true, salesTax: 0, purchaseTax: 0, payable: 0 },
    assumptions: [],
    ...overrides,
  };
}

function fakeCorporateEstimate(overrides: Partial<CorporateEstimate> = {}): CorporateEstimate {
  return {
    revenue: 0,
    expenses: 0,
    taxableIncome: 0,
    corporateTax: 0,
    localCorporateTax: 0,
    perCapitaTaxReference: 0,
    totalNationalTax: 0,
    consumptionTax: { isLikelyExempt: true, salesTax: 0, purchaseTax: 0, payable: 0 },
    assumptions: [],
    ...overrides,
  };
}

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

function findItem(items: TaxSavingChecklistItem[], id: string): TaxSavingChecklistItem {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`item not found: ${id}`);
  return item;
}

describe("buildIndividualTaxSavingChecklist", () => {
  it("always includes the disclaimer", () => {
    const result = buildIndividualTaxSavingChecklist(estimateForIndividual([]));
    expect(result.disclaimer).toBe(TAX_SAVING_DISCLAIMER);
    expect(result.disclaimer).toContain("個別具体の税務相談ではありません");
  });

  it("highlights iDeCo and small business mutual aid, but not incorporation, for a modest-profit freelancer", () => {
    const rows = [
      tx({ id: "1", amount: 6_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows);
    // marginalRate should be 20% at this profit level, businessProfit below incorporation threshold
    const result = buildIndividualTaxSavingChecklist(estimate, rows);

    expect(findItem(result.items, "ideco").highlight).toBe(true);
    expect(findItem(result.items, "smallBusinessMutualAid").highlight).toBe(true);
    expect(findItem(result.items, "incorporationThreshold").highlight).toBe(false);
  });

  it("highlights the incorporation threshold once business profit reaches the common rule-of-thumb level", () => {
    const rows = [tx({ id: "1", amount: 9_000_000, account: "売上高", taxCategory: "課税売上10%" })];
    const estimate = estimateForIndividual(rows);
    expect(estimate.businessProfit).toBeGreaterThanOrEqual(8_000_000);

    const result = buildIndividualTaxSavingChecklist(estimate, rows);
    expect(findItem(result.items, "incorporationThreshold").highlight).toBe(true);
  });

  it("flags underused blue-return deduction when business profit is below the deduction amount", () => {
    const rows = [
      tx({ id: "1", amount: 500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -100_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows);
    expect(estimate.businessProfit).toBe(400_000);

    const result = buildIndividualTaxSavingChecklist(estimate, rows);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(true);
  });

  it("does not highlight profit-dependent items and cannot judge missing expenses for a loss-making / empty case", () => {
    const estimate = estimateForIndividual([]);
    const result = buildIndividualTaxSavingChecklist(estimate, []);

    expect(findItem(result.items, "smallBusinessMutualAid").highlight).toBe(false);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(false);
    expect(findItem(result.items, "incorporationThreshold").highlight).toBe(false);
    const missingCheck = findItem(result.items, "missingExpenseCategories");
    expect(missingCheck.highlight).toBe(false);
    expect(missingCheck.note).toContain("判定できません");
  });

  it("highlights missing expense categories only when data is present and some expected accounts are absent", () => {
    const rowsMissingSome = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -100_000, account: "通信費", taxCategory: "課税仕入10%" }),
    ];
    const estimateMissingSome = estimateForIndividual(rowsMissingSome);
    const missingSomeResult = buildIndividualTaxSavingChecklist(estimateMissingSome, rowsMissingSome);
    const missingSomeItem = findItem(missingSomeResult.items, "missingExpenseCategories");
    expect(missingSomeItem.highlight).toBe(true);
    expect(missingSomeItem.note).toContain("地代家賃");
    expect(missingSomeItem.note).not.toContain("通信費");

    const rowsAllCovered = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({ id: "3", amount: -50_000, account: "通信費", taxCategory: "課税仕入10%" }),
      tx({ id: "4", amount: -30_000, account: "新聞図書費", taxCategory: "課税仕入8%(軽減)" }),
      tx({ id: "5", amount: -20_000, account: "研修費", taxCategory: "課税仕入10%" }),
      tx({ id: "6", amount: -40_000, account: "車両費", taxCategory: "課税仕入10%" }),
    ];
    const estimateAllCovered = estimateForIndividual(rowsAllCovered);
    const allCoveredResult = buildIndividualTaxSavingChecklist(estimateAllCovered, rowsAllCovered);
    expect(findItem(allCoveredResult.items, "missingExpenseCategories").highlight).toBe(false);
  });

  it("highlights the invoice/exempt-business item only when total income is at or below the ¥10,000,000 exemption line", () => {
    const exempt = estimateForIndividual([tx({ id: "1", amount: 9_000_000, account: "売上高" })]);
    expect(findItem(buildIndividualTaxSavingChecklist(exempt).items, "invoiceRegistration").highlight).toBe(true);

    const taxable = estimateForIndividual([tx({ id: "1", amount: 11_000_000, account: "売上高" })]);
    expect(findItem(buildIndividualTaxSavingChecklist(taxable).items, "invoiceRegistration").highlight).toBe(false);
  });
});

describe("buildIndividualTaxSavingChecklist - exact boundary values", () => {
  it("does not flag underused blue-return deduction when business profit is exactly at 650,000 (not below)", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 650_000 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(false);
  });

  it("flags underused blue-return deduction at 649,999 (just below the boundary)", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 649_999 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(true);
  });

  it("does not highlight iDeCo when the marginal rate is just below the 20% threshold", () => {
    const estimate = fakeIndividualEstimate({ incomeTax: { tax: 0, marginalRate: 10 } });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "ideco").highlight).toBe(false);
  });

  it("highlights iDeCo exactly at the 20% marginal rate boundary", () => {
    const estimate = fakeIndividualEstimate({ incomeTax: { tax: 0, marginalRate: 20 } });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "ideco").highlight).toBe(true);
  });

  it("does not highlight the incorporation threshold just below 8,000,000 business profit", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 7_999_999 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "incorporationThreshold").highlight).toBe(false);
  });

  it("highlights the incorporation threshold exactly at 8,000,000 business profit", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 8_000_000 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "incorporationThreshold").highlight).toBe(true);
  });

  it("does not highlight small business mutual aid or blue-return usage for exactly zero business profit", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 0 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "smallBusinessMutualAid").highlight).toBe(false);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(false);
  });

  it("highlights small business mutual aid but not underused blue-return deduction for a tiny positive profit", () => {
    const estimate = fakeIndividualEstimate({ businessProfit: 1 });
    const result = buildIndividualTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "smallBusinessMutualAid").highlight).toBe(true);
    expect(findItem(result.items, "blueReturnDeductionUsage").highlight).toBe(true); // 1 < 650,000
  });
});

describe("buildCorporateTaxSavingChecklist", () => {
  it("always includes the disclaimer", () => {
    const result = buildCorporateTaxSavingChecklist(estimateForMicroCorp([]));
    expect(result.disclaimer).toBe(TAX_SAVING_DISCLAIMER);
  });

  it("highlights profit-dependent mutual aid items for a profitable year, and not the loss-carryforward item", () => {
    const rows = [
      tx({ id: "1", amount: 9_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    expect(estimate.taxableIncome).toBeGreaterThanOrEqual(8_000_000);

    const result = buildCorporateTaxSavingChecklist(estimate, rows);
    expect(findItem(result.items, "corpSmallBusinessMutualAid").highlight).toBe(true);
    expect(findItem(result.items, "safetyMutualAid").highlight).toBe(true);
    expect(findItem(result.items, "corpBlueReturnLossCarryforward").highlight).toBe(false);
  });

  it("highlights the loss-carryforward item and not the profit-dependent items for a loss-making year", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    expect(estimate.taxableIncome).toBe(0);

    const result = buildCorporateTaxSavingChecklist(estimate, rows);
    expect(findItem(result.items, "corpBlueReturnLossCarryforward").highlight).toBe(true);
    expect(findItem(result.items, "corpSmallBusinessMutualAid").highlight).toBe(false);
    expect(findItem(result.items, "safetyMutualAid").highlight).toBe(false);
  });

  it("highlights missing expense categories for micro-corps only when data is present and something is absent", () => {
    const estimateEmpty = estimateForMicroCorp([]);
    const emptyResult = buildCorporateTaxSavingChecklist(estimateEmpty, []);
    expect(findItem(emptyResult.items, "corpMissingExpenseCategories").highlight).toBe(false);

    const rows = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", account: "会議費", amount: -10_000, taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    const result = buildCorporateTaxSavingChecklist(estimate, rows);
    const missingItem = findItem(result.items, "corpMissingExpenseCategories");
    expect(missingItem.highlight).toBe(true);
    expect(missingItem.note).toContain("地代家賃");
    expect(missingItem.note).not.toContain("会議費");
  });

  it("highlights the invoice/exempt-business item only when revenue is at or below the ¥10,000,000 exemption line", () => {
    const exempt = estimateForMicroCorp([tx({ id: "1", amount: 9_000_000 })]);
    expect(findItem(buildCorporateTaxSavingChecklist(exempt).items, "corpInvoiceRegistration").highlight).toBe(true);

    const taxable = estimateForMicroCorp([tx({ id: "1", amount: 11_000_000 })]);
    expect(findItem(buildCorporateTaxSavingChecklist(taxable).items, "corpInvoiceRegistration").highlight).toBe(false);
  });
});

describe("buildCorporateTaxSavingChecklist - exact boundary values", () => {
  it("does not highlight the safety mutual aid item just below 8,000,000 taxable income", () => {
    const estimate = fakeCorporateEstimate({ taxableIncome: 7_999_999, revenue: 10_000_000, expenses: 1_000_000 });
    const result = buildCorporateTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "safetyMutualAid").highlight).toBe(false);
  });

  it("highlights the safety mutual aid item exactly at 8,000,000 taxable income", () => {
    const estimate = fakeCorporateEstimate({ taxableIncome: 8_000_000, revenue: 10_000_000, expenses: 1_000_000 });
    const result = buildCorporateTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "safetyMutualAid").highlight).toBe(true);
  });

  it("treats revenue exactly equal to expenses as neither profitable nor a loss (isLoss requires expenses > revenue)", () => {
    const estimate = fakeCorporateEstimate({ taxableIncome: 0, revenue: 5_000_000, expenses: 5_000_000 });
    const result = buildCorporateTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "corpSmallBusinessMutualAid").highlight).toBe(false); // taxableIncome not > 0
    expect(findItem(result.items, "corpBlueReturnLossCarryforward").highlight).toBe(false); // expenses not > revenue
  });

  it("flags the loss-carryforward item once expenses exceed revenue by even 1 yen", () => {
    const estimate = fakeCorporateEstimate({ taxableIncome: 0, revenue: 5_000_000, expenses: 5_000_001 });
    const result = buildCorporateTaxSavingChecklist(estimate, []);
    expect(findItem(result.items, "corpBlueReturnLossCarryforward").highlight).toBe(true);
  });
});
