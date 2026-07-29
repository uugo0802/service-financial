import { describe, expect, it } from "vitest";
import { buildExpenseBreakdown, OTHER_ACCOUNT_LABEL } from "./expenseBreakdown";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "経費合計",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildExpenseBreakdown - aggregation", () => {
  it("aggregates expenses by account, ignoring income rows", () => {
    const rows = [
      tx({ id: "1", account: "地代家賃", amount: -100000 }),
      tx({ id: "2", account: "地代家賃", amount: -50000 }),
      tx({ id: "3", account: "通信費", amount: -20000 }),
      tx({ id: "4", account: "売上高", amount: 300000 }),
    ];
    const result = buildExpenseBreakdown(rows);

    expect(result.total).toBe(170000);
    expect(result.slices).toEqual([
      { account: "地代家賃", amount: 150000, percent: 88 },
      { account: "通信費", amount: 20000, percent: 12 },
    ]);
  });

  it("sorts slices by amount descending regardless of input order", () => {
    const rows = [
      tx({ id: "1", account: "小口", amount: -1000 }),
      tx({ id: "2", account: "大口", amount: -900000 }),
      tx({ id: "3", account: "中口", amount: -50000 }),
    ];
    const result = buildExpenseBreakdown(rows);
    expect(result.slices.map((s) => s.account)).toEqual(["大口", "中口", "小口"]);
  });

  it("breaks ties on amount by account name (ja locale order)", () => {
    const rows = [
      tx({ id: "1", account: "通信費", amount: -10000 }),
      tx({ id: "2", account: "会議費", amount: -10000 }),
    ];
    const result = buildExpenseBreakdown(rows);
    expect(result.slices.map((s) => s.account)).toEqual(["会議費", "通信費"]);
  });
});

describe("buildExpenseBreakdown - top-N and その他 bucket", () => {
  it("keeps all accounts as-is when count is at or below topN", () => {
    const rows = [
      tx({ id: "1", account: "A", amount: -300 }),
      tx({ id: "2", account: "B", amount: -200 }),
      tx({ id: "3", account: "C", amount: -100 }),
    ];
    const result = buildExpenseBreakdown(rows, 6);
    expect(result.slices.map((s) => s.account)).toEqual(["A", "B", "C"]);
    expect(result.slices.some((s) => s.account === OTHER_ACCOUNT_LABEL)).toBe(false);
  });

  it("collapses accounts beyond topN into a その他 bucket", () => {
    const rows = [
      tx({ id: "1", account: "科目1", amount: -600000 }),
      tx({ id: "2", account: "科目2", amount: -500000 }),
      tx({ id: "3", account: "科目3", amount: -400000 }),
      tx({ id: "4", account: "科目4", amount: -300000 }),
      tx({ id: "5", account: "科目5", amount: -50000 }),
      tx({ id: "6", account: "科目6", amount: -30000 }),
      tx({ id: "7", account: "科目7", amount: -15000 }),
      tx({ id: "8", account: "科目8", amount: -5000 }),
    ];
    const result = buildExpenseBreakdown(rows, 6);

    expect(result.slices).toHaveLength(7); // top6 + その他
    expect(result.slices.slice(0, 6).map((s) => s.account)).toEqual([
      "科目1",
      "科目2",
      "科目3",
      "科目4",
      "科目5",
      "科目6",
    ]);
    const other = result.slices[6];
    expect(other.account).toBe(OTHER_ACCOUNT_LABEL);
    expect(other.amount).toBe(15000 + 5000);
    expect(result.total).toBe(600000 + 500000 + 400000 + 300000 + 50000 + 30000 + 15000 + 5000);
  });

  it("respects a custom topN", () => {
    const rows = [
      tx({ id: "1", account: "A", amount: -500 }),
      tx({ id: "2", account: "B", amount: -300 }),
      tx({ id: "3", account: "C", amount: -200 }),
    ];
    const result = buildExpenseBreakdown(rows, 1);
    expect(result.slices.map((s) => s.account)).toEqual(["A", OTHER_ACCOUNT_LABEL]);
    expect(result.slices[1].amount).toBe(500);
  });
});

describe("buildExpenseBreakdown - percentage rounding", () => {
  it("rounds percentages so they sum to exactly 100 even with repeating decimals (thirds)", () => {
    const rows = [
      tx({ id: "1", account: "A", amount: -1 }),
      tx({ id: "2", account: "B", amount: -1 }),
      tx({ id: "3", account: "C", amount: -1 }),
    ];
    const result = buildExpenseBreakdown(rows);
    const percents = result.slices.map((s) => s.percent);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    // largest remainder method: all three raw values are 33.33..., so one gets bumped to 34
    expect(percents.sort((a, b) => b - a)).toEqual([34, 33, 33]);
  });

  it("sums to 100 for an uneven multi-account split", () => {
    const rows = [
      tx({ id: "1", account: "A", amount: -710000 }),
      tx({ id: "2", account: "B", amount: -230000 }),
      tx({ id: "3", account: "C", amount: -60000 }),
    ];
    const result = buildExpenseBreakdown(rows);
    expect(result.slices.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });
});

describe("buildExpenseBreakdown - edge cases", () => {
  it("returns an empty breakdown for empty input", () => {
    expect(buildExpenseBreakdown([])).toEqual({ slices: [], total: 0 });
  });

  it("returns an empty breakdown when there are no expense rows (income only)", () => {
    const rows = [tx({ id: "1", account: "売上高", amount: 500000 })];
    expect(buildExpenseBreakdown(rows)).toEqual({ slices: [], total: 0 });
  });

  it("gives a single account 100% of the total", () => {
    const rows = [
      tx({ id: "1", account: "地代家賃", amount: -50000 }),
      tx({ id: "2", account: "地代家賃", amount: -25000 }),
    ];
    const result = buildExpenseBreakdown(rows);
    expect(result.slices).toEqual([{ account: "地代家賃", amount: 75000, percent: 100 }]);
    expect(result.total).toBe(75000);
  });
});
