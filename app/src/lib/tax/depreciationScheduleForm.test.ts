import { describe, expect, it } from "vitest";
import { Asset, FiscalPeriod, calculateAssetDepreciation } from "./depreciation";
import { buildDepreciationScheduleForm } from "./depreciationScheduleForm";

const period: FiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: "asset-1",
    name: "ノートパソコン",
    acquisitionDate: "2024-01-10",
    acquisitionCost: 480_000,
    usefulLifeYears: 4,
    method: "straight-line",
    ...overrides,
  };
}

describe("buildDepreciationScheduleForm", () => {
  it("returns an empty rows list and zeroed totals for an empty asset list", () => {
    const form = buildDepreciationScheduleForm([], period);

    expect(form.rows).toEqual([]);
    expect(form.excludedDecliningBalanceAssets).toEqual([]);
    expect(form.excludedImmediateExpensingAssets).toEqual([]);
    expect(form.totals).toEqual({
      acquisitionCostTotal: 0,
      netAcquisitionCostTotal: 0,
      depreciationBaseTotal: 0,
      ordinaryDepreciationLimitTotal: 0,
      currentYearDepreciationExpenseTotal: 0,
      accumulatedDepreciationTotal: 0,
      endingBookValueTotal: 0,
    });
    expect(form.formLabel).toBe("別表十六（一）");
    expect(form.notes.length).toBeGreaterThan(0);
  });

  it("produces a single row matching calculateAssetDepreciation's output for one straight-line asset", () => {
    const asset = makeAsset({});
    const expected = calculateAssetDepreciation(asset, period);

    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.rows).toHaveLength(1);
    const row = form.rows[0];
    expect(row.assetId).toBe(asset.id);
    expect(row.assetName).toBe(asset.name);
    expect(row.acquisitionCost).toBe(asset.acquisitionCost);
    expect(row.netAcquisitionCost).toBe(asset.acquisitionCost);
    expect(row.depreciationBase).toBe(asset.acquisitionCost);
    expect(row.usefulLifeYears).toBe(asset.usefulLifeYears);
    expect(row.depreciationMethod).toBe("straight-line");
    expect(row.depreciationRate).toBeCloseTo(1 / asset.usefulLifeYears);
    expect(row.monthsInService).toBe(expected.monthsInService);
    expect(row.openingBookValue).toBe(expected.openingBookValue);
    expect(row.ordinaryDepreciationLimit).toBe(expected.currentYearDepreciation);
    expect(row.currentYearDepreciationExpense).toBe(expected.currentYearDepreciation);
    expect(row.accumulatedDepreciation).toBe(expected.accumulatedDepreciation);
    expect(row.endingBookValue).toBe(expected.endingBookValue);

    // Totals should match the single row for a one-asset list.
    expect(form.totals.currentYearDepreciationExpenseTotal).toBe(expected.currentYearDepreciation);
    expect(form.totals.endingBookValueTotal).toBe(expected.endingBookValue);
  });

  it("aggregates multiple straight-line assets into a totals row that sums across all rows", () => {
    const assetA = makeAsset({ id: "a", name: "ノートパソコン", acquisitionCost: 480_000, usefulLifeYears: 4 });
    const assetB = makeAsset({
      id: "b",
      name: "オフィス机",
      acquisitionDate: "2023-06-01",
      acquisitionCost: 200_000,
      usefulLifeYears: 8,
    });

    const form = buildDepreciationScheduleForm([assetA, assetB], period);

    expect(form.rows).toHaveLength(2);
    expect(form.rows.map((r) => r.assetId)).toEqual(["a", "b"]);

    const expectedA = calculateAssetDepreciation(assetA, period);
    const expectedB = calculateAssetDepreciation(assetB, period);

    expect(form.totals.acquisitionCostTotal).toBe(assetA.acquisitionCost + assetB.acquisitionCost);
    expect(form.totals.currentYearDepreciationExpenseTotal).toBe(
      expectedA.currentYearDepreciation + expectedB.currentYearDepreciation
    );
    expect(form.totals.ordinaryDepreciationLimitTotal).toBe(
      expectedA.currentYearDepreciation + expectedB.currentYearDepreciation
    );
    expect(form.totals.accumulatedDepreciationTotal).toBe(
      expectedA.accumulatedDepreciation + expectedB.accumulatedDepreciation
    );
    expect(form.totals.endingBookValueTotal).toBe(expectedA.endingBookValue + expectedB.endingBookValue);
  });

  it("handles a mid-year acquisition (月割り) consistently with depreciation.ts's monthsInService and pro-rated amount", () => {
    // Acquired July 2026 → 6 months in service within the 2026 calendar-year fiscal period.
    const asset = makeAsset({ id: "mid-year", acquisitionDate: "2026-07-15", acquisitionCost: 600_000, usefulLifeYears: 5 });
    const expected = calculateAssetDepreciation(asset, period);

    const form = buildDepreciationScheduleForm([asset], period);
    const row = form.rows[0];

    expect(expected.monthsInService).toBe(6);
    expect(row.monthsInService).toBe(6);
    expect(row.currentYearDepreciationExpense).toBe(expected.currentYearDepreciation);
    // Sanity-check the pro-rated amount is less than a full year's depreciation.
    const fullYearAmount = Math.floor(asset.acquisitionCost / asset.usefulLifeYears);
    expect(row.currentYearDepreciationExpense).toBeLessThan(fullYearAmount);
    expect(row.currentYearDepreciationExpense).toBeGreaterThan(0);
  });

  it("excludes declining-balance assets from rows and lists them separately with a note", () => {
    const straightLineAsset = makeAsset({ id: "sl", name: "定額法資産" });
    const decliningAsset = makeAsset({
      id: "db",
      name: "定率法資産",
      method: "declining-balance",
      acquisitionCost: 900_000,
      usefulLifeYears: 6,
    });

    const form = buildDepreciationScheduleForm([straightLineAsset, decliningAsset], period);

    expect(form.rows).toHaveLength(1);
    expect(form.rows[0].assetId).toBe("sl");
    expect(form.excludedDecliningBalanceAssets).toHaveLength(1);
    expect(form.excludedDecliningBalanceAssets[0].id).toBe("db");
    expect(form.notes.some((n) => n.includes("別表十六（二）"))).toBe(true);
  });

  it("excludes immediate-expensing (少額減価償却資産の特例) assets from rows and lists them separately with a note", () => {
    const normalAsset = makeAsset({ id: "normal" });
    const deMinimisAsset = makeAsset({
      id: "de-minimis",
      name: "プリンター",
      acquisitionCost: 150_000,
      usefulLifeYears: 5,
      immediateExpensing: true,
    });

    const form = buildDepreciationScheduleForm([normalAsset, deMinimisAsset], period);

    expect(form.rows).toHaveLength(1);
    expect(form.rows[0].assetId).toBe("normal");
    expect(form.excludedImmediateExpensingAssets).toHaveLength(1);
    expect(form.excludedImmediateExpensingAssets[0].id).toBe("de-minimis");
    expect(form.notes.some((n) => n.includes("別表十六（七）"))).toBe(true);
  });

  it("carries forward depreciation.ts's own notes (e.g. useful-life fallback) into row remarks", () => {
    const asset = makeAsset({ id: "bad-life", usefulLifeYears: 0 });

    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.rows[0].remarks.some((n) => n.includes("耐用年数は1年以上"))).toBe(true);
    expect(form.rows[0].usefulLifeYears).toBe(1);
  });

  it("floors a fractional usefulLifeYears down to an integer (e.g. 4.9 -> 4) rather than rounding", () => {
    const asset = makeAsset({ id: "fractional-life", usefulLifeYears: 4.9 });

    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.rows[0].usefulLifeYears).toBe(4);
    expect(form.rows[0].depreciationRate).toBeCloseTo(1 / 4);
  });

  it("adds a fully-depreciated remark once the asset has been written down to the ¥1 memorandum value", () => {
    // Acquired well before the fiscal period, with a short useful life so it's fully depreciated by now.
    const asset = makeAsset({ id: "old", acquisitionDate: "2015-01-01", acquisitionCost: 100_000, usefulLifeYears: 2 });

    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.rows[0].endingBookValue).toBe(1);
    expect(form.rows[0].remarks.some((n) => n.includes("備忘価額（1円）まで償却済み"))).toBe(true);
  });

  it("joins multiple excluded declining-balance/immediate-expensing asset names with the Japanese reading-point separator in the notes", () => {
    const decliningA = makeAsset({ id: "db-a", name: "定率法資産A", method: "declining-balance" });
    const decliningB = makeAsset({ id: "db-b", name: "定率法資産B", method: "declining-balance" });

    const form = buildDepreciationScheduleForm([decliningA, decliningB], period);

    expect(form.excludedDecliningBalanceAssets).toHaveLength(2);
    expect(form.notes.some((n) => n.includes("定率法資産A、定率法資産B"))).toBe(true);
  });

  it("treats a negative acquisitionCost defensively as zero, matching depreciation.ts", () => {
    const asset = makeAsset({ id: "negative-cost", acquisitionCost: -50_000 });

    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.rows[0].acquisitionCost).toBe(0);
    expect(form.rows[0].netAcquisitionCost).toBe(0);
    expect(form.rows[0].depreciationBase).toBe(0);
  });

  it("does not add declining-balance/immediate-expensing exclusion notes when no assets are excluded", () => {
    const asset = makeAsset({});
    const form = buildDepreciationScheduleForm([asset], period);

    expect(form.notes.some((n) => n.includes("別表十六（二）"))).toBe(false);
    expect(form.notes.some((n) => n.includes("別表十六（七）"))).toBe(false);
  });
});
