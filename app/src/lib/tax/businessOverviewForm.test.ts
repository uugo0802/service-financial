import { describe, expect, it } from "vitest";
import { buildMonthlySalesTrend } from "./businessOverviewForm";
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

describe("buildMonthlySalesTrend", () => {
  it("groups income transactions by year-month", () => {
    const rows = [
      tx({ id: "1", date: "2026-01-05", amount: 100000 }),
      tx({ id: "2", date: "2026-01-20", amount: 50000 }),
      tx({ id: "3", date: "2026-02-01", amount: 80000 }),
      tx({ id: "4", date: "2026-01-10", amount: -20000 }), // expense, should be excluded
    ];
    const result = buildMonthlySalesTrend(rows);

    expect(result).toEqual([
      { month: "2026-01", amount: 150000, transactionCount: 2 },
      { month: "2026-02", amount: 80000, transactionCount: 1 },
    ]);
  });

  it("buckets unparseable dates under 不明", () => {
    const rows = [tx({ id: "1", date: "不明", amount: 10000 })];
    const result = buildMonthlySalesTrend(rows);
    expect(result).toEqual([{ month: "不明", amount: 10000, transactionCount: 1 }]);
  });

  it("returns an empty array when there is no income", () => {
    const rows = [tx({ id: "1", amount: -5000 })];
    expect(buildMonthlySalesTrend(rows)).toEqual([]);
  });

  it("excludes nonRevenue rows (loan disbursements) from the sales trend", () => {
    const rows = [
      tx({ id: "1", date: "2026-01-05", amount: 100000 }),
      tx({ id: "2", date: "2026-01-10", amount: 5000000, account: "借入金", taxCategory: "対象外", nonRevenue: true }),
    ];
    const result = buildMonthlySalesTrend(rows);
    expect(result).toEqual([{ month: "2026-01", amount: 100000, transactionCount: 1 }]);
  });
});
