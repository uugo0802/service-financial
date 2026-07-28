import { describe, expect, it } from "vitest";
import { buildEquityChangeForm, EQUITY_CHANGE_STATEMENT_DISCLAIMER } from "./equityChangeForm";

describe("buildEquityChangeForm", () => {
  it("rolls the opening retained earnings forward by net income when there are no other movements", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 2_000_000 },
      "2026-01-01",
      "2026-12-31",
      750_000
    );

    expect(eq.capitalStock.openingBalance).toBe(1_000_000);
    expect(eq.capitalStock.changeTotal).toBe(0);
    expect(eq.capitalStock.endingBalance).toBe(1_000_000);
    expect(eq.capitalStock.movementLines).toEqual([]);

    expect(eq.capitalSurplus.openingBalance).toBe(0);
    expect(eq.capitalSurplus.endingBalance).toBe(0);
    expect(eq.capitalSurplus.movementLines).toEqual([]);

    expect(eq.retainedEarnings.openingBalance).toBe(2_000_000);
    expect(eq.retainedEarnings.movementLines).toEqual([{ label: "当期純利益", amount: 750_000 }]);
    expect(eq.retainedEarnings.changeTotal).toBe(750_000);
    expect(eq.retainedEarnings.endingBalance).toBe(2_750_000);

    expect(eq.shareholdersEquityTotal.openingBalance).toBe(3_000_000);
    expect(eq.shareholdersEquityTotal.changeTotal).toBe(750_000);
    expect(eq.shareholdersEquityTotal.endingBalance).toBe(3_750_000);
  });

  it("reflects a capital increase (増資) as a change in capital stock", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 500_000 },
      "2026-01-01",
      "2026-12-31",
      0,
      { capitalIncrease: 2_000_000 }
    );

    expect(eq.capitalStock.movementLines).toEqual([{ label: "新株の発行(増資)", amount: 2_000_000 }]);
    expect(eq.capitalStock.endingBalance).toBe(3_000_000);
    expect(eq.shareholdersEquityTotal.endingBalance).toBe(3_500_000);
  });

  it("reflects a capital decrease (減資) as a reduction in capital stock", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 3_000_000, capitalSurplus: 0, retainedEarnings: 0 },
      "2026-01-01",
      "2026-12-31",
      0,
      { capitalDecrease: 1_000_000 }
    );

    expect(eq.capitalStock.movementLines).toEqual([{ label: "減資", amount: -1_000_000 }]);
    expect(eq.capitalStock.endingBalance).toBe(2_000_000);
  });

  it("reflects dividends (剰余金の配当) as a reduction in retained earnings alongside net income", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 5_000_000 },
      "2026-01-01",
      "2026-12-31",
      1_000_000,
      { dividends: 300_000 }
    );

    expect(eq.retainedEarnings.movementLines).toEqual([
      { label: "当期純利益", amount: 1_000_000 },
      { label: "剰余金の配当", amount: -300_000 },
    ]);
    expect(eq.retainedEarnings.changeTotal).toBe(700_000);
    expect(eq.retainedEarnings.endingBalance).toBe(5_700_000);
  });

  it("reflects other capital surplus and retained earnings movements when provided", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 500_000, retainedEarnings: 1_000_000 },
      "2026-01-01",
      "2026-12-31",
      200_000,
      { capitalSurplusChange: -100_000, otherRetainedEarningsChange: 50_000 }
    );

    expect(eq.capitalSurplus.movementLines).toEqual([{ label: "資本剰余金の変動", amount: -100_000 }]);
    expect(eq.capitalSurplus.endingBalance).toBe(400_000);

    expect(eq.retainedEarnings.movementLines).toEqual([
      { label: "当期純利益", amount: 200_000 },
      { label: "その他の利益剰余金の変動", amount: 50_000 },
    ]);
    expect(eq.retainedEarnings.endingBalance).toBe(1_250_000);
  });

  it("combines every component into shareholdersEquityTotal", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 200_000, retainedEarnings: 300_000 },
      "2026-01-01",
      "2026-12-31",
      400_000,
      { capitalIncrease: 500_000, capitalSurplusChange: 50_000, dividends: 100_000 }
    );

    // opening: 1,000,000 + 200,000 + 300,000 = 1,500,000
    expect(eq.shareholdersEquityTotal.openingBalance).toBe(1_500_000);
    // change: +500,000 (capital increase) + 50,000 (capital surplus) + 400,000 (net income) - 100,000 (dividends)
    expect(eq.shareholdersEquityTotal.changeTotal).toBe(850_000);
    expect(eq.shareholdersEquityTotal.endingBalance).toBe(2_350_000);
    expect(eq.shareholdersEquityTotal.endingBalance).toBe(
      eq.capitalStock.endingBalance + eq.capitalSurplus.endingBalance + eq.retainedEarnings.endingBalance
    );
  });

  it("treats unspecified movements as zero (default parameter)", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 0 },
      "2026-01-01",
      "2026-12-31",
      0
    );

    expect(eq.capitalStock.changeTotal).toBe(0);
    expect(eq.capitalSurplus.changeTotal).toBe(0);
    expect(eq.retainedEarnings.changeTotal).toBe(0);
  });

  it("leaves reconcilesWithBalanceSheet undefined when no expected value is supplied", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 0 },
      "2026-01-01",
      "2026-12-31",
      0
    );

    expect(eq.reconcilesWithBalanceSheet).toBeUndefined();
  });

  it("reports reconcilesWithBalanceSheet as true when the ending total matches an external figure", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 2_000_000 },
      "2026-01-01",
      "2026-12-31",
      750_000,
      {},
      3_750_000
    );

    expect(eq.reconcilesWithBalanceSheet).toBe(true);
  });

  it("reports reconcilesWithBalanceSheet as false when the ending total does not match an external figure", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 1_000_000, capitalSurplus: 0, retainedEarnings: 2_000_000 },
      "2026-01-01",
      "2026-12-31",
      750_000,
      {},
      9_999_999
    );

    expect(eq.reconcilesWithBalanceSheet).toBe(false);
  });

  it("always includes the disclaimer", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 0, capitalSurplus: 0, retainedEarnings: 0 },
      "2026-01-01",
      "2026-12-31",
      0
    );

    expect(eq.disclaimer).toBe(EQUITY_CHANGE_STATEMENT_DISCLAIMER);
    expect(eq.disclaimer).toContain("下書き・試算");
    expect(eq.disclaimer).toContain("税理士にご相談ください");
  });

  it("carries through the period labels", () => {
    const eq = buildEquityChangeForm(
      { capitalStock: 0, capitalSurplus: 0, retainedEarnings: 0 },
      "2026-01-01",
      "2026-12-31",
      0
    );

    expect(eq.periodStart).toBe("2026-01-01");
    expect(eq.periodEnd).toBe("2026-12-31");
  });
});
