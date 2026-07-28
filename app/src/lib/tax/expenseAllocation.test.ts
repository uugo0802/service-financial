import { describe, expect, it } from "vitest";
import {
  ALLOCATABLE_ACCOUNTS,
  DEFAULT_BUSINESS_USE_PERCENT,
  EXTREME_HIGH_BUSINESS_USE_PERCENT,
  EXTREME_LOW_BUSINESS_USE_PERCENT,
  allocateAmount,
  clampBusinessUsePercent,
  createDefaultAllocationRates,
  isExtremeAllocation,
  summarizeExpenseAllocation,
} from "./expenseAllocation";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): Pick<CategorizedTransaction, "account" | "amount"> {
  return {
    account: "地代家賃",
    amount: -100_000,
    ...overrides,
  };
}

describe("clampBusinessUsePercent", () => {
  it("clamps values within 0-100", () => {
    expect(clampBusinessUsePercent(50)).toBe(50);
    expect(clampBusinessUsePercent(-10)).toBe(0);
    expect(clampBusinessUsePercent(150)).toBe(100);
  });

  it("treats NaN/Infinity as 0", () => {
    expect(clampBusinessUsePercent(NaN)).toBe(0);
    expect(clampBusinessUsePercent(Infinity)).toBe(0);
    expect(clampBusinessUsePercent(-Infinity)).toBe(0);
  });
});

describe("isExtremeAllocation", () => {
  it("flags values at or below the low threshold and at or above the high threshold", () => {
    expect(isExtremeAllocation(0)).toBe(true);
    expect(isExtremeAllocation(EXTREME_LOW_BUSINESS_USE_PERCENT)).toBe(true);
    expect(isExtremeAllocation(100)).toBe(true);
    expect(isExtremeAllocation(EXTREME_HIGH_BUSINESS_USE_PERCENT)).toBe(true);
  });

  it("does not flag values comfortably inside the range", () => {
    expect(isExtremeAllocation(EXTREME_LOW_BUSINESS_USE_PERCENT + 1)).toBe(false);
    expect(isExtremeAllocation(50)).toBe(false);
    expect(isExtremeAllocation(EXTREME_HIGH_BUSINESS_USE_PERCENT - 1)).toBe(false);
  });
});

describe("allocateAmount", () => {
  it("allocates 0% entirely to personal expense", () => {
    const result = allocateAmount(120_000, 0);
    expect(result).toEqual({ businessAmount: 0, personalAmount: 120_000 });
  });

  it("allocates 100% entirely to business expense", () => {
    const result = allocateAmount(120_000, 100);
    expect(result).toEqual({ businessAmount: 120_000, personalAmount: 0 });
  });

  it("splits a mid-range percentage and rounds to the nearest yen", () => {
    // 10,000 * 33.3% = 3,330 exactly
    expect(allocateAmount(10_000, 33.3)).toEqual({ businessAmount: 3_330, personalAmount: 6_670 });
  });

  it("keeps businessAmount + personalAmount equal to the original amount even with rounding", () => {
    // 10,000 * 1/3 = 3,333.33... -> rounds to 3,333
    const result = allocateAmount(10_000, 100 / 3);
    expect(result.businessAmount + result.personalAmount).toBe(10_000);
    expect(result.businessAmount).toBe(3_333);
    expect(result.personalAmount).toBe(6_667);
  });

  it("clamps out-of-range percentages before allocating", () => {
    expect(allocateAmount(10_000, -20)).toEqual({ businessAmount: 0, personalAmount: 10_000 });
    expect(allocateAmount(10_000, 250)).toEqual({ businessAmount: 10_000, personalAmount: 0 });
  });

  it("treats negative or non-finite amounts as zero", () => {
    expect(allocateAmount(-500, 50)).toEqual({ businessAmount: 0, personalAmount: 0 });
    expect(allocateAmount(NaN, 50)).toEqual({ businessAmount: 0, personalAmount: 0 });
  });
});

describe("createDefaultAllocationRates", () => {
  it("creates a rate map for the default allocatable accounts at the default percent", () => {
    const rates = createDefaultAllocationRates();
    expect(Object.keys(rates).sort()).toEqual([...ALLOCATABLE_ACCOUNTS].sort());
    for (const account of ALLOCATABLE_ACCOUNTS) {
      expect(rates[account]).toBe(DEFAULT_BUSINESS_USE_PERCENT);
    }
  });

  it("supports a custom account list and percent", () => {
    const rates = createDefaultAllocationRates(["通信費"], 30);
    expect(rates).toEqual({ 通信費: 30 });
  });
});

describe("summarizeExpenseAllocation", () => {
  it("aggregates multiple transactions for the same account before allocating", () => {
    const rows = [
      tx({ account: "地代家賃", amount: -80_000 }),
      tx({ account: "地代家賃", amount: -20_000 }),
    ];
    const result = summarizeExpenseAllocation(rows, { 地代家賃: 30 });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      account: "地代家賃",
      totalAmount: 100_000,
      businessUsePercent: 30,
      businessAmount: 30_000,
      personalAmount: 70_000,
      transactionCount: 2,
    });
    expect(result.lines[0].caution).toBeUndefined();
    expect(result.totalBusinessAmount).toBe(30_000);
    expect(result.totalPersonalAmount).toBe(70_000);
    expect(result.generalNote).toBeTruthy();
  });

  it("ignores income rows and accounts without a configured rate", () => {
    const rows = [
      tx({ account: "地代家賃", amount: -100_000 }),
      tx({ account: "売上高", amount: 500_000 }), // income, must be excluded
      tx({ account: "消耗品費", amount: -5_000 }), // no rate configured, must be excluded
    ];
    const result = summarizeExpenseAllocation(rows, { 地代家賃: 50 });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].account).toBe("地代家賃");
  });

  it("attaches a caution message for extreme (near 0%/100%) allocation rates", () => {
    const rows = [tx({ account: "地代家賃", amount: -100_000 }), tx({ account: "通信費", amount: -10_000 })];
    const result = summarizeExpenseAllocation(rows, { 地代家賃: 0, 通信費: 100 });

    const rent = result.lines.find((l) => l.account === "地代家賃")!;
    const communication = result.lines.find((l) => l.account === "通信費")!;
    expect(rent.caution).toBeDefined();
    expect(communication.caution).toBeDefined();
  });

  it("does not attach a caution message for a reasonable mid-range rate", () => {
    const rows = [tx({ account: "水道光熱費", amount: -30_000 })];
    const result = summarizeExpenseAllocation(rows, { 水道光熱費: 40 });

    expect(result.lines[0].caution).toBeUndefined();
  });

  it("returns an empty summary when there are no matching expense rows", () => {
    const result = summarizeExpenseAllocation([], { 地代家賃: 50 });
    expect(result.lines).toEqual([]);
    expect(result.totalBusinessAmount).toBe(0);
    expect(result.totalPersonalAmount).toBe(0);
  });
});
