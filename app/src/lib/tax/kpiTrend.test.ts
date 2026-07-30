import { describe, expect, it } from "vitest";
import { buildKpiTrend } from "./kpiTrend";
import { TrendPoint } from "./salesTrend";

function point(overrides: Partial<TrendPoint> & { key: string }): TrendPoint {
  return { income: 0, expense: 0, profit: 0, ...overrides };
}

describe("buildKpiTrend", () => {
  it("computes revenue, expense, net income, expense ratio, and YoY growth across multiple years", () => {
    const result = buildKpiTrend([
      point({ key: "2024", income: 1_000_000, expense: 600_000 }),
      point({ key: "2025", income: 1_500_000, expense: 750_000 }),
    ]);

    expect(result).toEqual([
      { key: "2024", revenue: 1_000_000, expense: 600_000, netIncome: 400_000, expenseRatio: 60, revenueGrowth: null },
      { key: "2025", revenue: 1_500_000, expense: 750_000, netIncome: 750_000, expenseRatio: 50, revenueGrowth: 50 },
    ]);
  });

  it("returns null for expenseRatio (not NaN/Infinity) when revenue is zero", () => {
    const result = buildKpiTrend([point({ key: "2025", income: 0, expense: 200_000 })]);
    expect(result).toEqual([
      { key: "2025", revenue: 0, expense: 200_000, netIncome: -200_000, expenseRatio: null, revenueGrowth: null },
    ]);
  });

  it("returns null for revenueGrowth (not NaN/Infinity) when the previous year's revenue is zero", () => {
    const result = buildKpiTrend([
      point({ key: "2024", income: 0, expense: 0 }),
      point({ key: "2025", income: 1_000_000, expense: 400_000 }),
    ]);
    expect(result[1].revenueGrowth).toBeNull();
  });

  it("returns revenueGrowth: null for a single-year series (no prior year to compare)", () => {
    const result = buildKpiTrend([point({ key: "2025", income: 1_000_000, expense: 500_000 })]);
    expect(result).toHaveLength(1);
    expect(result[0].revenueGrowth).toBeNull();
    expect(result[0].expenseRatio).toBe(50);
  });

  it("sorts unsorted input by fiscal year before computing", () => {
    const result = buildKpiTrend([
      point({ key: "2026", income: 2_000_000, expense: 1_000_000 }),
      point({ key: "2024", income: 1_000_000, expense: 600_000 }),
      point({ key: "2025", income: 1_500_000, expense: 750_000 }),
    ]);
    expect(result.map((r) => r.key)).toEqual(["2024", "2025", "2026"]);
    // 前年比は並べ替え後の直前の年度と比較されているはず
    expect(result[2].revenueGrowth).toBeCloseTo(((2_000_000 - 1_500_000) / 1_500_000) * 100);
  });

  it("returns an empty array for empty input", () => {
    expect(buildKpiTrend([])).toEqual([]);
  });

  it("computes a negative net income when expenses exceed revenue", () => {
    const result = buildKpiTrend([point({ key: "2025", income: 500_000, expense: 800_000 })]);
    expect(result[0].netIncome).toBe(-300_000);
    expect(result[0].expenseRatio).toBe(160);
  });
});
