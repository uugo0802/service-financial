import { describe, expect, it } from "vitest";
import {
  MILEAGE_GENERAL_NOTE,
  MileageLogEntry,
  aggregateMileageLog,
  allocateVehicleExpenseByMileage,
} from "./mileageAllocation";

function entry(overrides: Partial<MileageLogEntry>): MileageLogEntry {
  return {
    date: "2026-01-10",
    purpose: "取引先訪問",
    businessKm: 30,
    totalKm: 100,
    ...overrides,
  };
}

describe("aggregateMileageLog", () => {
  it("sums businessKm and totalKm across multiple log entries", () => {
    const entries = [
      entry({ date: "2026-01-05", businessKm: 20, totalKm: 50 }),
      entry({ date: "2026-01-12", businessKm: 40, totalKm: 60 }),
      entry({ date: "2026-01-20", businessKm: 10, totalKm: 40 }),
    ];

    const result = aggregateMileageLog(entries);

    expect(result.totalBusinessKm).toBe(70);
    expect(result.totalKm).toBe(150);
    expect(result.entryCount).toBe(3);
    // 70 / 150 * 100 = 46.666... -> clamped/kept as-is (not rounded by aggregate itself)
    expect(result.businessUsePercent).toBeCloseTo(46.666666, 5);
  });

  it("returns 0% and does not divide by zero when totalKm is 0", () => {
    const entries = [entry({ businessKm: 0, totalKm: 0 })];
    const result = aggregateMileageLog(entries);

    expect(result.totalKm).toBe(0);
    expect(result.totalBusinessKm).toBe(0);
    expect(result.businessUsePercent).toBe(0);
    expect(Number.isFinite(result.businessUsePercent)).toBe(true);
  });

  it("returns 0% for an empty log", () => {
    const result = aggregateMileageLog([]);
    expect(result).toEqual({
      totalBusinessKm: 0,
      totalKm: 0,
      entryCount: 0,
      businessUsePercent: 0,
    });
  });

  it("treats negative or non-finite km values as zero", () => {
    const entries = [entry({ businessKm: NaN, totalKm: 100 }), entry({ businessKm: -10, totalKm: 50 })];
    const result = aggregateMileageLog(entries);

    expect(result.totalBusinessKm).toBe(0);
    expect(result.totalKm).toBe(150);
  });

  it("clamps an aggregated percent above 100 (e.g. businessKm exceeding totalKm across entries)", () => {
    const entries = [entry({ businessKm: 80, totalKm: 50 })];
    const result = aggregateMileageLog(entries);
    expect(result.businessUsePercent).toBe(100);
  });
});

describe("allocateVehicleExpenseByMileage", () => {
  it("splits the vehicle expense amount according to the computed business-use percent, rounding to the nearest yen", () => {
    // businessKm=30, totalKm=100 -> 30% business use
    const entries = [entry({ businessKm: 30, totalKm: 100 })];
    const result = allocateVehicleExpenseByMileage(entries, 10_000);

    expect(result.aggregate.businessUsePercent).toBe(30);
    expect(result.totalAmount).toBe(10_000);
    expect(result.businessAmount).toBe(3_000);
    expect(result.personalAmount).toBe(7_000);
    expect(result.generalNote).toBe(MILEAGE_GENERAL_NOTE);
  });

  it("rounds a non-terminating percentage to the nearest yen and keeps the split summing to the original amount", () => {
    // businessKm=70, totalKm=150 -> 46.666...% of 10,000 = 4,666.66... -> rounds to 4,667
    const entries = [
      entry({ businessKm: 20, totalKm: 50 }),
      entry({ businessKm: 40, totalKm: 60 }),
      entry({ businessKm: 10, totalKm: 40 }),
    ];
    const result = allocateVehicleExpenseByMileage(entries, 10_000);

    expect(result.businessAmount).toBe(4_667);
    expect(result.personalAmount).toBe(5_333);
    expect(result.businessAmount + result.personalAmount).toBe(10_000);
  });

  it("allocates the entire amount to personal/non-deductible when totalKm is 0 across the log", () => {
    const entries = [entry({ businessKm: 0, totalKm: 0 }), entry({ businessKm: 0, totalKm: 0 })];
    const result = allocateVehicleExpenseByMileage(entries, 50_000);

    expect(result.aggregate.businessUsePercent).toBe(0);
    expect(result.businessAmount).toBe(0);
    expect(result.personalAmount).toBe(50_000);
  });

  it("treats a negative or non-finite vehicle expense amount as zero", () => {
    const entries = [entry({ businessKm: 30, totalKm: 100 })];
    expect(allocateVehicleExpenseByMileage(entries, -500)).toMatchObject({
      businessAmount: 0,
      personalAmount: 0,
      totalAmount: 0,
    });
    expect(allocateVehicleExpenseByMileage(entries, NaN)).toMatchObject({
      businessAmount: 0,
      personalAmount: 0,
      totalAmount: 0,
    });
  });

  it("handles an empty log by yielding a 0% allocation", () => {
    const result = allocateVehicleExpenseByMileage([], 20_000);
    expect(result.aggregate.entryCount).toBe(0);
    expect(result.businessAmount).toBe(0);
    expect(result.personalAmount).toBe(20_000);
  });
});
