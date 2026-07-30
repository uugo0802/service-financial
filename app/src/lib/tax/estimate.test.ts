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
  it("computes profit, deductions, income tax, and consumption tax for a typical freelancer (double-entry + e-Tax, 65万円控除)", () => {
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

    // 複式簿記・e-Tax提出（65万円控除の要件を満たす想定）を明示的に指定
    const result = estimateForIndividual(rows, { bookkeepingMethod: "double", filingMethod: "eTax" });

    // 収入・経費: 社会保険料・生命保険料（personalDeductionOnly）は必要経費に含めない
    expect(result.totalIncome).toBe(8_000_000);
    expect(result.totalExpense).toBe(2_108_000);
    expect(result.businessProfit).toBe(5_892_000);

    // 個人的な控除項目は別枠で集計される
    expect(result.socialInsuranceDeduction).toBe(500_000);
    expect(result.lifeInsurancePaidInfo).toBe(100_000);

    expect(result.blueReturnDeduction).toBe(650_000);

    // 事業所得 - 青色控除65万 - 社保控除50万 - 基礎控除48万 = 4,262,000（千円未満切り捨て）
    expect(result.taxableIncome).toBe(4_262_000);

    // 速算表: 4,262,000 * 20% - 427,500 = 424,900
    expect(result.incomeTax).toEqual({ tax: 424_900, marginalRate: 20 });
    // 復興特別所得税: floor(424,900 * 2.1%) = 8,922
    expect(result.reconstructionSurtax).toBe(8_922);
    expect(result.totalIncomeTax).toBe(433_822);

    // 消費税: 税込金額から税率で逆算（円未満切り捨て）
    // 8,000,000 * 10/110 = 727,272.727... → 切り捨てで727,272円
    expect(result.consumptionTax).toEqual({
      isLikelyExempt: true,
      salesTax: 727_272,
      purchaseTax: 189_818,
      payable: 537_454,
    });
  });

  // Regression: consumption tax amounts extracted from a tax-inclusive total must be truncated
  // (円未満切り捨て), not rounded to the nearest yen. Math.round silently rounded .5-and-above
  // fractional yen up, which both overstates the estimated consumption tax collected on sales
  // and is inconsistent with the truncating helpers used elsewhere (e.g. consumptionTaxForm.ts's
  // round1000Down/round100Down).
  it("truncates (does not round) the extracted consumption tax on a sale with a fractional yen remainder", () => {
    const rows = [tx({ id: "1", amount: 1000, account: "売上高", taxCategory: "課税売上10%" })];
    const result = estimateForIndividual(rows);

    // 1,000 * 10/110 = 90.909... → truncated to 90円 (Math.round would incorrectly give 91)
    expect(result.consumptionTax.salesTax).toBe(90);
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

  // Regression: loan proceeds and capital contributions are balance-sheet items, not business
  // revenue. Before excludeFromIncome was threaded through, a business loan drawdown or capital
  // injection (both routinely categorized this way by the rule dictionary) would have been summed
  // into totalIncome/businessProfit exactly like a sale, inflating taxable income and the tax due.
  it("excludes loan proceeds and capital contributions from income, profit, and the exemption threshold", () => {
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
      tx({ id: "4", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];

    const result = estimateForIndividual(rows);

    expect(result.totalIncome).toBe(3_000_000);
    expect(result.businessProfit).toBe(2_000_000);
    // Total cash in (10,000,000) is well over the 10,000,000 exemption threshold, but actual
    // business income is only 3,000,000, so this should still read as likely-exempt.
    expect(result.consumptionTax.isLikelyExempt).toBe(true);
  });

  // Regression: excludeFromIncome must take priority over taxCategory when computing the
  // consumption tax on sales, not just totalIncome/businessProfit. The rule dictionary always
  // pairs excludeFromIncome with taxCategory "対象外", but AI classification (aiEscalate.ts)
  // re-attaches excludeFromIncome from the account name independently of the LLM-supplied
  // taxCategory, so the two can disagree (e.g. account="借入金" with taxCategory="課税売上10%").
  // Before this fix, salesTax10 was computed from the unfiltered `income` list, so a loan
  // drawdown or capital injection mistakenly tagged with a taxable-sales category would have
  // leaked phantom consumption tax into the payable amount even though it's correctly excluded
  // from totalIncome/businessProfit.
  it("excludes an excludeFromIncome row from consumption tax on sales even if its taxCategory is mistakenly '課税売上10%'", () => {
    const rows = [
      tx({ id: "1", amount: 3_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({
        id: "2",
        amount: 5_000_000,
        account: "借入金",
        taxCategory: "課税売上10%", // mis-tagged by AI classification; excludeFromIncome must still win
        excludeFromIncome: true,
      }),
    ];

    const result = estimateForIndividual(rows);

    // Only the genuine 3,000,000 sale should be taxed: 3,000,000 * 10/110 = 272,727.27... -> 272,727
    expect(result.consumptionTax.salesTax).toBe(272_727);
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
    // 既定（複式簿記・書面提出＝青色控除55万円）の下で、課税所得がちょうど1,950,000円（5%帯の上限）
    const atThreshold = estimateForIndividual([
      tx({ id: "1", amount: 2_980_000, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(atThreshold.blueReturnDeduction).toBe(550_000);
    expect(atThreshold.taxableIncome).toBe(1_950_000);
    expect(atThreshold.incomeTax).toEqual({ tax: 97_500, marginalRate: 5 });

    // 課税所得が1,951,000円（1,000円超えて10%帯に入る）
    const justAbove = estimateForIndividual([
      tx({ id: "1", amount: 2_981_000, account: "売上高", taxCategory: "課税売上10%" }),
    ]);
    expect(justAbove.taxableIncome).toBe(1_951_000);
    expect(justAbove.incomeTax).toEqual({ tax: 97_600, marginalRate: 10 });
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

  describe("blue-return deduction (bookkeeping method / filing method)", () => {
    const bigProfitRows = [tx({ id: "1", amount: 10_000_000, account: "売上高", taxCategory: "課税売上10%" })];

    it("defaults to the conservative 550,000 tier (double-entry, paper filing) when no options are given", () => {
      const result = estimateForIndividual(bigProfitRows);
      expect(result.blueReturnDeduction).toBe(550_000);
      expect(result.assumptions[0]).toContain("55万円");
    });

    it("defaults to 550,000 when bookkeepingMethod is double but filingMethod is omitted", () => {
      const result = estimateForIndividual(bigProfitRows, { bookkeepingMethod: "double" });
      expect(result.blueReturnDeduction).toBe(550_000);
    });

    it("applies 650,000 for double-entry bookkeeping filed via e-Tax", () => {
      const result = estimateForIndividual(bigProfitRows, { bookkeepingMethod: "double", filingMethod: "eTax" });
      expect(result.blueReturnDeduction).toBe(650_000);
      expect(result.assumptions[0]).toContain("65万円");
    });

    it("applies 650,000 for double-entry bookkeeping with 優良な電子帳簿保存 even on paper filing status otherwise", () => {
      const result = estimateForIndividual(bigProfitRows, {
        bookkeepingMethod: "double",
        filingMethod: "electronicBooks",
      });
      expect(result.blueReturnDeduction).toBe(650_000);
    });

    it("applies 550,000 for double-entry bookkeeping filed on paper (explicitly)", () => {
      const result = estimateForIndividual(bigProfitRows, { bookkeepingMethod: "double", filingMethod: "paper" });
      expect(result.blueReturnDeduction).toBe(550_000);
      expect(result.assumptions[0]).toContain("55万円");
    });

    it("applies 100,000 for simple bookkeeping regardless of filing method", () => {
      const eTaxResult = estimateForIndividual(bigProfitRows, { bookkeepingMethod: "simple", filingMethod: "eTax" });
      expect(eTaxResult.blueReturnDeduction).toBe(100_000);
      expect(eTaxResult.assumptions[0]).toContain("10万円");

      const paperResult = estimateForIndividual(bigProfitRows, {
        bookkeepingMethod: "simple",
        filingMethod: "paper",
      });
      expect(paperResult.blueReturnDeduction).toBe(100_000);
    });
  });
});
