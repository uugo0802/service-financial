import { describe, expect, it } from "vitest";
import { buildMonthlyTrend, buildYearlyTrend } from "./salesTrend";
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

describe("buildMonthlyTrend", () => {
  it("aggregates income/expense/profit by year-month across multiple years", () => {
    const rows = [
      tx({ id: "1", date: "2025-01-05", amount: 100000 }),
      tx({ id: "2", date: "2025-01-20", amount: -30000 }),
      tx({ id: "3", date: "2026-01-10", amount: 150000 }),
      tx({ id: "4", date: "2026-01-15", amount: -50000 }),
    ];
    const result = buildMonthlyTrend(rows);

    expect(result).toEqual([
      { key: "2025-01", income: 100000, expense: 30000, profit: 70000 },
      { key: "2026-01", income: 150000, expense: 50000, profit: 100000 },
    ]);
  });

  it("sorts points chronologically regardless of input order", () => {
    const rows = [
      tx({ id: "1", date: "2026-03-01", amount: 10000 }),
      tx({ id: "2", date: "2025-12-01", amount: 20000 }),
      tx({ id: "3", date: "2026-01-01", amount: 5000 }),
    ];
    const result = buildMonthlyTrend(rows);
    expect(result.map((p) => p.key)).toEqual(["2025-12", "2026-01", "2026-03"]);
  });

  it("excludes rows with unparseable dates rather than bucketing them", () => {
    const rows = [
      tx({ id: "1", date: "不明", amount: 10000 }),
      tx({ id: "2", date: "2026-01-01", amount: 5000 }),
    ];
    const result = buildMonthlyTrend(rows);
    expect(result).toEqual([{ key: "2026-01", income: 5000, expense: 0, profit: 5000 }]);
  });

  it("returns an empty array for empty input", () => {
    expect(buildMonthlyTrend([])).toEqual([]);
  });

  it("computes a negative profit when expenses exceed income", () => {
    const rows = [
      tx({ id: "1", date: "2026-04-01", amount: 10000 }),
      tx({ id: "2", date: "2026-04-05", amount: -40000 }),
    ];
    expect(buildMonthlyTrend(rows)).toEqual([{ key: "2026-04", income: 10000, expense: 40000, profit: -30000 }]);
  });
});

describe("buildMonthlyTrend - excludeFromIncome", () => {
  // Regression: the dashboard trend's "income" should reflect business revenue, not raw cash-in.
  // A loan drawdown or capital contribution must not appear as income (or inflate profit).
  it("excludes loan proceeds and capital contributions from the income/profit trend", () => {
    const rows = [
      tx({ id: "1", date: "2026-01-05", amount: 100000 }),
      tx({
        id: "2",
        date: "2026-01-10",
        amount: 5000000,
        account: "借入金",
        taxCategory: "対象外",
        excludeFromIncome: true,
      }),
    ];
    const result = buildMonthlyTrend(rows);
    expect(result).toEqual([{ key: "2026-01", income: 100000, expense: 0, profit: 100000 }]);
  });
});

describe("buildYearlyTrend", () => {
  it("aggregates income/expense/profit by year, collapsing months within the year", () => {
    const rows = [
      tx({ id: "1", date: "2025-01-05", amount: 100000 }),
      tx({ id: "2", date: "2025-06-20", amount: 200000 }),
      tx({ id: "3", date: "2025-06-25", amount: -80000 }),
      tx({ id: "4", date: "2026-02-10", amount: 300000 }),
    ];
    const result = buildYearlyTrend(rows);

    expect(result).toEqual([
      { key: "2025", income: 300000, expense: 80000, profit: 220000 },
      { key: "2026", income: 300000, expense: 0, profit: 300000 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(buildYearlyTrend([])).toEqual([]);
  });
});
