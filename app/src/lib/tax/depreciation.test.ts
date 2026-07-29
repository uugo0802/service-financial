import { describe, expect, it } from "vitest";
import { Asset, FiscalPeriod, calculateAssetDepreciation, summarizeDepreciation } from "./depreciation";

const FISCAL_YEAR_2025: FiscalPeriod = { start: "2025-04-01", end: "2026-03-31" };

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "1",
    name: "テスト資産",
    acquisitionDate: "2025-04-01",
    acquisitionCost: 1_200_000,
    usefulLifeYears: 5,
    ...overrides,
  };
}

describe("calculateAssetDepreciation", () => {
  it("computes a full year of straight-line depreciation when acquired at the start of the fiscal year", () => {
    const a = asset({ acquisitionCost: 1_200_000, usefulLifeYears: 5, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.monthsInService).toBe(12);
    expect(result.currentYearDepreciation).toBe(240_000); // 1,200,000 / 5
    expect(result.openingBookValue).toBe(1_200_000);
    expect(result.accumulatedDepreciation).toBe(240_000);
    expect(result.endingBookValue).toBe(960_000);
    expect(result.immediateExpensingApplied).toBe(false);
    expect(result.fullyDepreciated).toBe(false);
  });

  it("prorates depreciation by months in service for a mid-year acquisition (partial month rounds up)", () => {
    const a = asset({ acquisitionCost: 600_000, usefulLifeYears: 5, acquisitionDate: "2025-10-15" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    // 2025-10-15 acquisition inside 2025-04-01..2026-03-31 fiscal year:
    // in-service months = Oct, Nov, Dec, Jan, Feb, Mar = 6 (the partial October rounds up to a full month).
    expect(result.monthsInService).toBe(6);
    expect(result.currentYearDepreciation).toBe(60_000); // (600,000 / 5 / 12) * 6
    expect(result.endingBookValue).toBe(540_000);
  });

  it("floors the book value at 1 yen instead of depreciating fully to zero", () => {
    // 100,000 yen asset with a 1-year useful life, acquired 3 months before this fiscal year starts,
    // so this fiscal year covers the final 9 months of its useful life.
    const a = asset({ acquisitionCost: 100_000, usefulLifeYears: 1, acquisitionDate: "2025-01-01" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.monthsInService).toBe(9);
    expect(result.openingBookValue).toBe(75_000);
    // Without the floor, 9 months at (100,000/12) would be exactly 75,000, but the 1-yen floor
    // caps accumulated depreciation at 99,999 (not 100,000), so this year's expense is 74,999.
    expect(result.currentYearDepreciation).toBe(74_999);
    expect(result.endingBookValue).toBe(1);
    expect(result.fullyDepreciated).toBe(true);

    // A later fiscal year should show no further depreciation and stay at the 1-yen floor.
    const nextYear = calculateAssetDepreciation(a, { start: "2026-04-01", end: "2027-03-31" });
    expect(nextYear.currentYearDepreciation).toBe(0);
    expect(nextYear.openingBookValue).toBe(1);
    expect(nextYear.endingBookValue).toBe(1);
  });

  it("expenses the full cost in the acquisition year under the immediate expensing rule (少額減価償却資産)", () => {
    const a = asset({
      acquisitionCost: 250_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-06-10",
      immediateExpensing: true,
    });
    const acquisitionYear = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(acquisitionYear.immediateExpensingApplied).toBe(true);
    expect(acquisitionYear.currentYearDepreciation).toBe(250_000);
    expect(acquisitionYear.accumulatedDepreciation).toBe(250_000);
    expect(acquisitionYear.endingBookValue).toBe(0);

    const priorYear = calculateAssetDepreciation(a, { start: "2024-04-01", end: "2025-03-31" });
    expect(priorYear.currentYearDepreciation).toBe(0);
    expect(priorYear.endingBookValue).toBe(250_000);

    const nextYear = calculateAssetDepreciation(a, { start: "2026-04-01", end: "2027-03-31" });
    expect(nextYear.currentYearDepreciation).toBe(0);
    expect(nextYear.openingBookValue).toBe(0);
    expect(nextYear.endingBookValue).toBe(0);
    expect(nextYear.immediateExpensingApplied).toBe(true);
  });

  it("ignores the immediate expensing flag and falls back to straight-line once cost reaches the 300,000 yen threshold", () => {
    const a = asset({
      acquisitionCost: 300_000,
      usefulLifeYears: 10,
      acquisitionDate: "2025-04-01",
      immediateExpensing: true,
    });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.immediateExpensingApplied).toBe(false);
    expect(result.currentYearDepreciation).toBe(30_000); // 300,000 / 10
    expect(result.notes.join(" ")).toMatch(/300,000円以上/);
  });

  it("treats an acquisition cost of zero as zero depreciation with no errors", () => {
    const a = asset({ acquisitionCost: 0, usefulLifeYears: 5, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.currentYearDepreciation).toBe(0);
    expect(result.accumulatedDepreciation).toBe(0);
    expect(result.openingBookValue).toBe(0);
    expect(result.endingBookValue).toBe(0);
    expect(result.fullyDepreciated).toBe(false);
  });

  it("clamps a non-positive useful life to 1 year and records a note instead of throwing", () => {
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 0, acquisitionDate: "2025-04-01" });
    expect(() => calculateAssetDepreciation(a, FISCAL_YEAR_2025)).not.toThrow();
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);
    expect(result.currentYearDepreciation).toBe(119_999); // floored to the 1-yen book value floor
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("shows no depreciation and an unchanged book value for a fiscal year entirely before acquisition", () => {
    const a = asset({ acquisitionCost: 500_000, usefulLifeYears: 5, acquisitionDate: "2030-01-01" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.monthsInService).toBe(0);
    expect(result.currentYearDepreciation).toBe(0);
    expect(result.openingBookValue).toBe(500_000);
    expect(result.endingBookValue).toBe(500_000);
  });
});

describe("summarizeDepreciation", () => {
  it("aggregates current-year depreciation, accumulated depreciation, and ending book value across assets", () => {
    const assets: Asset[] = [
      asset({ id: "1", acquisitionCost: 1_200_000, usefulLifeYears: 5, acquisitionDate: "2025-04-01" }),
      asset({ id: "2", acquisitionCost: 600_000, usefulLifeYears: 5, acquisitionDate: "2025-10-15" }),
      asset({
        id: "3",
        acquisitionCost: 250_000,
        usefulLifeYears: 5,
        acquisitionDate: "2025-06-10",
        immediateExpensing: true,
      }),
    ];

    const summary = summarizeDepreciation(assets, FISCAL_YEAR_2025);

    expect(summary.results).toHaveLength(3);
    // 240,000 + 60,000 + 250,000
    expect(summary.totalCurrentYearDepreciation).toBe(550_000);
    // 240,000 + 60,000 + 250,000 (all acquired this year, so accumulated == current year here)
    expect(summary.totalAccumulatedDepreciation).toBe(550_000);
    // (1,200,000-240,000) + (600,000-60,000) + (250,000-250,000)
    expect(summary.totalEndingBookValue).toBe(1_500_000);
  });

  it("returns zeroed totals for an empty asset list", () => {
    const summary = summarizeDepreciation([], FISCAL_YEAR_2025);
    expect(summary.results).toHaveLength(0);
    expect(summary.totalCurrentYearDepreciation).toBe(0);
    expect(summary.totalAccumulatedDepreciation).toBe(0);
    expect(summary.totalEndingBookValue).toBe(0);
  });
});
