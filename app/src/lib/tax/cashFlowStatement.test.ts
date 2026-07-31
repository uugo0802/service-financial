import { describe, expect, it } from "vitest";
import { buildCashFlowStatement } from "./cashFlowStatement";
import { ProfitLossStatement } from "./plStatement";
import { buildBalanceSheetForm } from "./balanceSheetForm";

function pl(overrides: Partial<ProfitLossStatement> = {}): ProfitLossStatement {
  return {
    incomeLines: [],
    incomeTotal: 5_000_000,
    expenseLines: [],
    expenseTotal: 4_000_000,
    profit: 1_000_000,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    ...overrides,
  };
}

describe("buildCashFlowStatement", () => {
  it("reconciles exactly with the balance sheet's actual cash change when no manual items are entered", () => {
    // With no depreciation/investing/financing input, operating CF should equal
    // netIncome + increase in unpaid taxes, which by construction of
    // buildBalanceSheetForm's "opening liabilities are zero" assumption
    // equals the actual cash change (endingCash - openingCash).
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000 },
      5_000_000, // cashInflow
      4_000_000, // cashOutflow
      200_000, // unpaidCorporateTaxes
      50_000, // unpaidConsumptionTax
      750_000 // netIncome
    );
    const cf = buildCashFlowStatement(pl(), bs);

    expect(cf.operatingActivitiesCashFlow).toBe(750_000 + 200_000 + 50_000);
    expect(cf.investingActivitiesCashFlow).toBe(0);
    expect(cf.financingActivitiesCashFlow).toBe(0);
    expect(cf.netChangeInCash).toBe(bs.endingCash - bs.openingCash);
    expect(cf.endingCashBalanceEstimate).toBe(bs.endingCash);
    expect(cf.actualEndingCashBalance).toBe(bs.endingCash);
    expect(cf.reconcilesWithBalanceSheet).toBe(true);
  });

  it("adds depreciation back as a non-cash expense and flags a reconciliation gap", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000 },
      5_000_000,
      4_000_000,
      200_000,
      50_000,
      750_000
    );
    const cf = buildCashFlowStatement(pl(), bs, { depreciationExpense: 300_000 });

    const depreciationLine = cf.operatingLines.find((l) => l.label.includes("減価償却費"));
    expect(depreciationLine?.amount).toBe(300_000);
    expect(cf.operatingActivitiesCashFlow).toBe(750_000 + 300_000 + 200_000 + 50_000);
    // Depreciation is not reflected in the transaction-derived ending cash, so the
    // estimate now diverges from the balance sheet's actual cash figure.
    expect(cf.reconcilesWithBalanceSheet).toBe(false);
    expect(cf.assumptions.some((a) => a.includes("一致していません"))).toBe(true);
  });

  it("treats a missing depreciationExpense the same as an explicit zero", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 100_000, 80_000, 0, 0, 20_000);
    const withoutField = buildCashFlowStatement(pl(), bs, {});
    const withExplicitZero = buildCashFlowStatement(pl(), bs, { depreciationExpense: 0 });

    expect(withoutField.operatingActivitiesCashFlow).toBe(withExplicitZero.operatingActivitiesCashFlow);
    expect(withoutField.reconcilesWithBalanceSheet).toBe(true);
  });

  it("clamps a negative depreciationExpense input to zero instead of subtracting it", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 100_000, 80_000, 0, 0, 20_000);
    const cf = buildCashFlowStatement(pl(), bs, { depreciationExpense: -50_000 });

    const depreciationLine = cf.operatingLines.find((l) => l.label.includes("減価償却費"));
    expect(depreciationLine?.amount).toBe(0);
  });

  it("handles a negative net income (loss) period without special-casing", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000 },
      1_000_000, // cashInflow
      2_000_000, // cashOutflow
      0, // unpaidCorporateTaxes (no tax owed on a loss)
      0,
      -1_000_000 // netIncome
    );
    const cf = buildCashFlowStatement(pl({ incomeTotal: 1_000_000, expenseTotal: 2_000_000, profit: -1_000_000 }), bs);

    expect(cf.operatingActivitiesCashFlow).toBe(-1_000_000);
    expect(cf.netChangeInCash).toBe(-1_000_000);
    expect(cf.endingCashBalanceEstimate).toBe(2_000_000);
    expect(cf.reconcilesWithBalanceSheet).toBe(true);
    expect(cf.cashFlowToNetIncomeGap).toBe(0);
  });

  it("returns null for operatingCashFlowToRevenueRatio when the period has zero revenue", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 500_000 }, 0, 100_000, 0, 0, -100_000);
    const cf = buildCashFlowStatement(pl({ incomeTotal: 0, expenseTotal: 100_000, profit: -100_000 }), bs);

    expect(cf.operatingCashFlowToRevenueRatio).toBeNull();
  });

  it("computes operatingCashFlowToRevenueRatio as a rounded ratio when revenue is positive", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 3_000_000, 1_000_000, 0, 0, 2_000_000);
    const cf = buildCashFlowStatement(pl({ incomeTotal: 3_000_000 }), bs);

    // operatingActivitiesCashFlow = netIncome (2,000,000) + 0 + 0 + 0 = 2,000,000
    // ratio = 2,000,000 / 3,000,000 = 0.6667 (rounded to 4 decimals)
    expect(cf.operatingCashFlowToRevenueRatio).toBe(0.6667);
  });

  it("includes investing and financing activities when manual inputs are provided", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 1_000_000, openingCash: 2_000_000 }, 4_000_000, 3_000_000, 100_000, 20_000, 880_000);
    const cf = buildCashFlowStatement(pl(), bs, {
      assetPurchases: 500_000,
      assetSales: 100_000,
      borrowings: 1_000_000,
      loanRepayments: 200_000,
      capitalIncrease: 300_000,
      dividendsPaid: 50_000,
    });

    expect(cf.investingActivitiesCashFlow).toBe(100_000 - 500_000);
    expect(cf.financingActivitiesCashFlow).toBe(1_000_000 - 200_000 + 300_000 - 50_000);
    expect(cf.netChangeInCash).toBe(
      cf.operatingActivitiesCashFlow + cf.investingActivitiesCashFlow + cf.financingActivitiesCashFlow
    );
    expect(cf.reconcilesWithBalanceSheet).toBe(false);
  });

  it("clamps negative investing/financing inputs to zero rather than flipping their sign", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 100_000, 80_000, 0, 0, 20_000);
    const cf = buildCashFlowStatement(pl(), bs, { assetPurchases: -10_000, borrowings: -5_000 });

    expect(cf.investingLines.find((l) => l.label.includes("取得"))?.amount).toBe(0);
    expect(cf.financingLines.find((l) => l.label.includes("借入による収入"))?.amount).toBe(0);
  });

  it("carries through the period labels from the profit and loss statement", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 0, 0, 0, 0, 0);
    const cf = buildCashFlowStatement(pl({ periodStart: "2026-04-01", periodEnd: "2027-03-31" }), bs);

    expect(cf.periodStart).toBe("2026-04-01");
    expect(cf.periodEnd).toBe("2027-03-31");
  });

  it("always includes the simplified-estimate disclaimer regardless of inputs", () => {
    const bs = buildBalanceSheetForm({ capitalStock: 0, openingCash: 0 }, 0, 0, 0, 0, 0);
    const cf = buildCashFlowStatement(pl(), bs);

    expect(cf.assumptions.some((a) => a.includes("簡易試算") && a.includes("正式なキャッシュフロー計算書ではありません"))).toBe(true);
  });
});
