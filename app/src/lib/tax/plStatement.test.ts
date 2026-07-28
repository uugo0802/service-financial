import { describe, expect, it } from "vitest";
import { buildProfitLossStatement } from "./plStatement";
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

describe("buildProfitLossStatement", () => {
  it("separates income and expense and computes totals", () => {
    const rows = [
      tx({ id: "1", amount: 500000, account: "売上高", date: "2026-01-05" }),
      tx({ id: "2", amount: -100000, account: "地代家賃", taxCategory: "課税仕入10%", date: "2026-01-10" }),
      tx({ id: "3", amount: -20000, account: "通信費", taxCategory: "課税仕入10%", date: "2026-01-20" }),
    ];
    const pl = buildProfitLossStatement(rows);

    expect(pl.incomeTotal).toBe(500000);
    expect(pl.expenseTotal).toBe(120000);
    expect(pl.profit).toBe(380000);
    expect(pl.periodStart).toBe("2026-01-05");
    expect(pl.periodEnd).toBe("2026-01-20");
  });

  it("groups multiple transactions under the same account", () => {
    const rows = [
      tx({ id: "1", amount: -10000, account: "通信費" }),
      tx({ id: "2", amount: -20000, account: "通信費" }),
    ];
    const pl = buildProfitLossStatement(rows);
    expect(pl.expenseLines).toHaveLength(1);
    expect(pl.expenseLines[0]).toEqual({ account: "通信費", amount: 30000 });
  });

  it("excludes nonRevenue rows (loan disbursements, capital contributions) from income totals", () => {
    const rows = [
      tx({ id: "1", amount: 500000, account: "売上高" }),
      tx({ id: "2", amount: 2000000, account: "借入金", taxCategory: "対象外", nonRevenue: true }),
    ];
    const pl = buildProfitLossStatement(rows);

    expect(pl.incomeTotal).toBe(500000);
    expect(pl.incomeLines).toEqual([{ account: "売上高", amount: 500000 }]);
  });

  it("returns zeroed totals for an empty input", () => {
    const pl = buildProfitLossStatement([]);
    expect(pl.incomeTotal).toBe(0);
    expect(pl.expenseTotal).toBe(0);
    expect(pl.profit).toBe(0);
    expect(pl.periodStart).toBe("-");
    expect(pl.periodEnd).toBe("-");
  });
});
