import { describe, expect, it } from "vitest";
import {
  Asset,
  FiscalPeriod,
  IMMEDIATE_EXPENSING_ANNUAL_CAP,
  calculateAssetDepreciation,
  summarizeDepreciation,
  validateDeMinimisAnnualCap,
} from "./depreciation";

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

describe("validateDeMinimisAnnualCap", () => {
  it("reports the cap as not exceeded when the total is well under 3,000,000 yen", () => {
    const assets: Asset[] = [
      asset({
        id: "1",
        acquisitionCost: 250_000,
        acquisitionDate: "2025-04-10",
        immediateExpensing: true,
      }),
      asset({
        id: "2",
        acquisitionCost: 280_000,
        acquisitionDate: "2025-06-01",
        immediateExpensing: true,
      }),
      // Not electing the exception, and not eligible anyway (>= 300,000): should be ignored.
      asset({
        id: "3",
        acquisitionCost: 1_200_000,
        acquisitionDate: "2025-04-01",
        immediateExpensing: false,
      }),
    ];

    const check = validateDeMinimisAnnualCap(assets, FISCAL_YEAR_2025);

    expect(check.applicableAssets).toHaveLength(2);
    expect(check.totalExpensedAmount).toBe(530_000); // 250,000 + 280,000
    expect(check.annualCap).toBe(IMMEDIATE_EXPENSING_ANNUAL_CAP);
    expect(check.capExceeded).toBe(false);
    expect(check.excessAmount).toBe(0);
    expect(check.notes).toHaveLength(0);
  });

  it("flags the cap as exceeded across multiple assets and reports the excess amount without auto-fixing", () => {
    // Six assets at 299,999 yen each = 1,799,994 per pair; use enough assets to clear 3,000,000.
    const assets: Asset[] = [
      asset({ id: "1", acquisitionCost: 299_000, acquisitionDate: "2025-04-05", immediateExpensing: true }),
      asset({ id: "2", acquisitionCost: 299_000, acquisitionDate: "2025-05-05", immediateExpensing: true }),
      asset({ id: "3", acquisitionCost: 299_000, acquisitionDate: "2025-06-05", immediateExpensing: true }),
      asset({ id: "4", acquisitionCost: 299_000, acquisitionDate: "2025-07-05", immediateExpensing: true }),
      asset({ id: "5", acquisitionCost: 299_000, acquisitionDate: "2025-08-05", immediateExpensing: true }),
      asset({ id: "6", acquisitionCost: 299_000, acquisitionDate: "2025-09-05", immediateExpensing: true }),
      asset({ id: "7", acquisitionCost: 299_000, acquisitionDate: "2025-10-05", immediateExpensing: true }),
      asset({ id: "8", acquisitionCost: 299_000, acquisitionDate: "2025-11-05", immediateExpensing: true }),
      asset({ id: "9", acquisitionCost: 299_000, acquisitionDate: "2025-12-05", immediateExpensing: true }),
      asset({ id: "10", acquisitionCost: 299_000, acquisitionDate: "2026-01-05", immediateExpensing: true }),
      asset({ id: "11", acquisitionCost: 299_000, acquisitionDate: "2026-02-05", immediateExpensing: true }),
    ];
    // 11 * 299,000 = 3,289,000 > 3,000,000

    const check = validateDeMinimisAnnualCap(assets, FISCAL_YEAR_2025);

    expect(check.applicableAssets).toHaveLength(11);
    expect(check.totalExpensedAmount).toBe(3_289_000);
    expect(check.capExceeded).toBe(true);
    expect(check.excessAmount).toBe(289_000);

    // The app must not silently decide which asset(s) to fall back — it only
    // provides sorted candidate lists for the user (or their tax advisor) to choose from.
    expect(check.assetsByAcquisitionDateDesc[0].asset.id).toBe("11"); // most recently acquired first
    expect(check.assetsByAcquisitionDateDesc.at(-1)?.asset.id).toBe("1"); // earliest acquired last
    expect(check.assetsByExpensedAmountDesc).toHaveLength(11);
    // All assets have the same expensed amount here, so the amount-sorted order is stable but
    // the key behavior under test is that it's provided at all (a decision aid, not an auto-fix).
    expect(check.assetsByExpensedAmountDesc.every((a) => a.expensedAmount === 299_000)).toBe(true);

    expect(check.notes.join(" ")).toMatch(/上限/);
    expect(check.notes.join(" ")).toMatch(/3,000,000/);
  });

  it("ignores assets that did not elect the exception or are outside the fiscal period", () => {
    const assets: Asset[] = [
      asset({ id: "1", acquisitionCost: 250_000, acquisitionDate: "2025-04-01", immediateExpensing: false }),
      asset({ id: "2", acquisitionCost: 250_000, acquisitionDate: "2020-04-01", immediateExpensing: true }), // already expensed in a prior year
    ];

    const check = validateDeMinimisAnnualCap(assets, FISCAL_YEAR_2025);
    expect(check.applicableAssets).toHaveLength(0);
    expect(check.totalExpensedAmount).toBe(0);
    expect(check.capExceeded).toBe(false);
  });
});

describe("calculateAssetDepreciation with declining-balance method (定率法)", () => {
  it("still defaults to straight-line when method is omitted (regression safety)", () => {
    const a = asset({ acquisitionCost: 1_200_000, usefulLifeYears: 5, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);
    expect(result.method).toBe("straight-line");
    expect(result.currentYearDepreciation).toBe(240_000); // unchanged straight-line behavior
  });

  it("computes the basic first-year declining-balance amount as opening book value times the 200% rate", () => {
    // 200% rate for a 5-year useful life = 2/5 = 0.4 (this matches the official rounded
    // rate table for 5 years too, so this case is not affected by our rate simplification).
    const a = asset({
      acquisitionCost: 1_200_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-04-01",
      method: "declining-balance",
    });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.method).toBe("declining-balance");
    expect(result.monthsInService).toBe(12);
    expect(result.currentYearDepreciation).toBe(480_000); // 1,200,000 * 0.4
    expect(result.endingBookValue).toBe(720_000);
    expect(result.immediateExpensingApplied).toBe(false);
    expect(result.notes.join(" ")).toMatch(/定率法/);
  });

  it("prorates the first (acquisition) year of declining-balance by months in service", () => {
    const a = asset({
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-10-15",
      method: "declining-balance",
    });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);

    expect(result.monthsInService).toBe(6);
    // Full-year amount would be 600,000 * 0.4 = 240,000; prorated for 6/12 months = 120,000.
    expect(result.currentYearDepreciation).toBe(120_000);
    expect(result.endingBookValue).toBe(480_000);
  });

  it("switches to straight-line partway through the schedule and depreciates down to exactly 1 yen in the final year", () => {
    const a = asset({
      acquisitionCost: 1_200_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-04-01",
      method: "declining-balance",
    });

    const yearlyDepreciation: number[] = [];
    for (let i = 0; i < 5; i++) {
      const period: FiscalPeriod = { start: `${2025 + i}-04-01`, end: `${2026 + i}-03-31` };
      const result = calculateAssetDepreciation(a, period);
      yearlyDepreciation.push(result.currentYearDepreciation);
      if (i === 4) {
        // Final year of the 5-year useful life: book value must land exactly on the
        // 1-yen memorandum floor, not merely close to it.
        expect(result.endingBookValue).toBe(1);
        expect(result.fullyDepreciated).toBe(true);
      }
    }

    // Sanity check: total depreciation across all 5 years exactly exhausts the
    // depreciable base (cost minus the 1-yen memorandum value), regardless of how
    // the straight-line switch-over rounds individual years.
    const total = yearlyDepreciation.reduce((sum, v) => sum + v, 0);
    expect(total).toBe(1_200_000 - 1);

    // A later fiscal year (past the useful life) should show no further depreciation.
    const nextYear = calculateAssetDepreciation(a, { start: "2030-04-01", end: "2031-03-31" });
    expect(nextYear.currentYearDepreciation).toBe(0);
    expect(nextYear.endingBookValue).toBe(1);
  });

  it("still applies the immediate expensing rule (少額減価償却資産) ahead of the declining-balance method when eligible", () => {
    const a = asset({
      acquisitionCost: 250_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-06-10",
      immediateExpensing: true,
      method: "declining-balance",
    });
    const result = calculateAssetDepreciation(a, FISCAL_YEAR_2025);
    expect(result.immediateExpensingApplied).toBe(true);
    expect(result.currentYearDepreciation).toBe(250_000);
  });
});
