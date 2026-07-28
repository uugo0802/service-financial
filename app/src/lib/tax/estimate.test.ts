import { describe, expect, it } from "vitest";
import { estimateForIndividual } from "./estimate";
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

describe("estimateForIndividual", () => {
  it("computes profit, deductions, income tax, and consumption tax for a typical freelancer", () => {
    const rows = [
      tx({ id: "1", amount: 8_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
      tx({ id: "3", amount: -108_000, account: "水道光熱費", taxCategory: "課税仕入8%(軽減)" }),
      tx({
        id: "4",
        amount: -500_000,
        account: "社会保険料(個人)",
        taxCategory: "対象外",
        personalDeductionOnly: true,
      }),
      tx({
        id: "5",
        amount: -100_000,
        account: "生命保険料(個人)",
        taxCategory: "対象外",
        personalDeductionOnly: true,
      }),
    ];

    const result = estimateForIndividual(rows);

    // 収入・経費: 社会保険料・生命保険料（personalDeductionOnly）は必要経費に含めない
    expect(result.totalIncome).toBe(8_000_000);
    expect(result.totalExpense).toBe(2_108_000);
    expect(result.businessProfit).toBe(5_892_000);

    // 個人的な控除項目は別枠で集計される
    expect(result.socialInsuranceDeduction).toBe(500_000);
    expect(result.lifeInsurancePaidInfo).toBe(100_000);

    // 事業所得 - 青色控除65万 - 社保控除50万 - 基礎控除48万 = 4,262,000（千円未満切り捨て）
    expect(result.taxableIncome).toBe(4_262_000);

    // 速算表: 4,262,000 * 20% - 427,500 = 424,900
    expect(result.incomeTax).toEqual({ tax: 424_900, marginalRate: 20 });
    // 復興特別所得税: floor(424,900 * 2.1%) = 8,922
    expect(result.reconstructionSurtax).toBe(8_922);
    expect(result.totalIncomeTax).toBe(433_822);

    // 消費税: 税込金額から税率で逆算
    expect(result.consumptionTax).toEqual({
      isLikelyExempt: true,
      salesTax: 727_273,
      purchaseTax: 189_818,
      payable: 537_455,
    });
  });

  it("floors taxable income and tax at zero when expenses exceed income", () => {
    const rows = [tx({ id: "1", amount: -300_000, account: "外注費", taxCategory: "課税仕入10%" })];

    const result = estimateForIndividual(rows);

    expect(result.totalIncome).toBe(0);
    expect(result.businessProfit).toBe(-300_000);
    expect(result.taxableIncome).toBe(0);
    expect(result.incomeTax).toEqual({ tax: 0, marginalRate: 0 });
    expect(result.reconstructionSurtax).toBe(0);
    expect(result.totalIncomeTax).toBe(0);
    // 売上がなくても仕入税額はあるが、消費税納税額はマイナスにならず0で頭打ち
    expect(result.consumptionTax.salesTax).toBe(0);
    expect(result.consumptionTax.purchaseTax).toBeGreaterThan(0);
    expect(result.consumptionTax.payable).toBe(0);
  });

  it("returns all-zero figures for an empty transaction list", () => {
    const result = estimateForIndividual([]);

    expect(result.totalIncome).toBe(0);
    expect(result.totalExpense).toBe(0);
    expect(result.businessProfit).toBe(0);
    expect(result.taxableIncome).toBe(0);
    expect(result.incomeTax).toEqual({ tax: 0, marginalRate: 0 });
    expect(result.totalIncomeTax).toBe(0);
    expect(result.consumptionTax.payable).toBe(0);
  });

  it("applies the next income tax bracket once taxable income crosses a threshold", () => {
    // 課税所得がちょうど1,950,000円（5%帯の上限）
    const atThreshold = estimateForIndividual([
      tx({ id: "1", amount: 3_080_000, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(atThreshold.taxableIncome).toBe(1_950_000);
    expect(atThreshold.incomeTax).toEqual({ tax: 97_500, marginalRate: 5 });

    // 課税所得が1,951,000円（1,000円超えて10%帯に入る）
    const justAbove = estimateForIndividual([
      tx({ id: "1", amount: 3_081_000, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(justAbove.taxableIncome).toBe(1_951_000);
    expect(justAbove.incomeTax).toEqual({ tax: 97_600, marginalRate: 10 });
  });

  it("excludes loan disbursements and capital contributions (nonRevenue) from income, profit, and taxable income", () => {
    const rows = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 5_000_000, account: "借入金", taxCategory: "対象外", nonRevenue: true }),
      tx({ id: "3", amount: -500_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForIndividual(rows);

    // 借入金の入金5,000,000円は事業収入ではないため、totalIncomeに含まれない
    expect(result.totalIncome).toBe(3_000_000);
    expect(result.businessProfit).toBe(2_500_000);
  });

  it("treats total income at or below ¥10,000,000 as likely exempt from consumption tax", () => {
    const atLimit = estimateForIndividual([
      tx({ id: "1", amount: 10_000_000, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(atLimit.consumptionTax.isLikelyExempt).toBe(true);

    const overLimit = estimateForIndividual([
      tx({ id: "1", amount: 10_000_001, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(overLimit.consumptionTax.isLikelyExempt).toBe(false);
  });
});
