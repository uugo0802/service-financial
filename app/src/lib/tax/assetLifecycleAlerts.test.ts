import { describe, expect, it } from "vitest";
import { Asset, FiscalPeriod, IMMEDIATE_EXPENSING_ANNUAL_CAP } from "./depreciation";
import {
  DEFAULT_DE_MINIMIS_APPROACHING_RATIO,
  checkDeMinimisCapAlert,
  computeAssetLifecycleAlerts,
  findAssetsNearingFullDepreciation,
  findFullyDepreciatedAssets,
} from "./assetLifecycleAlerts";

const FISCAL_YEAR_2025: FiscalPeriod = { start: "2025-04-01", end: "2026-03-31" };

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "1",
    name: "テスト資産",
    acquisitionDate: "2020-01-01",
    acquisitionCost: 240_000,
    usefulLifeYears: 2,
    ...overrides,
  };
}

describe("findAssetsNearingFullDepreciation", () => {
  it("flags a straight-line asset that will reach the 1-yen book value floor within the next 12 months", () => {
    // Acquired 2020-01-01, cost 120,000, 1-year life -> monthly depreciation 10,000.
    // As of 2020-11-30, 11 months elapsed -> book value 10,000 (not yet fully depreciated).
    // It reaches the 1-yen floor at 12 months elapsed (end of December 2020), i.e. 1 month away.
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 1, acquisitionDate: "2020-01-01" });
    const alerts = findAssetsNearingFullDepreciation([a], "2020-11-30");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].asset.id).toBe(a.id);
    expect(alerts[0].currentBookValue).toBe(10_000);
    expect(alerts[0].monthsRemaining).toBe(1);
    expect(alerts[0].estimatedCompletionMonth).toBe("2020-12");
  });

  it("does not flag an asset whose completion is further away than the monthsAhead threshold, but does once the threshold is widened", () => {
    // Acquired 2020-01-01, cost 240,000, 2-year (24 month) life -> monthly depreciation 10,000.
    // As of 2020-10-15, 10 months elapsed -> book value 140,000. Completion (24 months elapsed)
    // falls in December 2021, which is 14 months after the reference date.
    const a = asset({ acquisitionCost: 240_000, usefulLifeYears: 2, acquisitionDate: "2020-01-01" });

    const withDefaultThreshold = findAssetsNearingFullDepreciation([a], "2020-10-15");
    expect(withDefaultThreshold).toHaveLength(0); // default threshold is 12 months, completion is 14 months out

    const withWiderThreshold = findAssetsNearingFullDepreciation([a], "2020-10-15", 14);
    expect(withWiderThreshold).toHaveLength(1);
    expect(withWiderThreshold[0].monthsRemaining).toBe(14);
    expect(withWiderThreshold[0].estimatedCompletionMonth).toBe("2021-12");
  });

  it("excludes assets that are already fully depreciated as of the reference date", () => {
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 1, acquisitionDate: "2015-01-01" });
    const alerts = findAssetsNearingFullDepreciation([a], "2020-01-01");
    expect(alerts).toHaveLength(0);
  });

  it("excludes assets expensed under the immediate expensing rule (少額減価償却資産), since they complete instantly rather than gradually", () => {
    const a = asset({
      acquisitionCost: 250_000,
      acquisitionDate: "2026-01-01",
      immediateExpensing: true,
    });
    const alerts = findAssetsNearingFullDepreciation([a], "2026-07-30");
    expect(alerts).toHaveLength(0);
  });

  it("excludes assets not yet acquired as of the reference date", () => {
    const a = asset({ acquisitionDate: "2030-01-01" });
    const alerts = findAssetsNearingFullDepreciation([a], "2026-07-30");
    expect(alerts).toHaveLength(0);
  });

  it("excludes zero-cost assets (no meaningful book value floor to track)", () => {
    const a = asset({ acquisitionCost: 0 });
    const alerts = findAssetsNearingFullDepreciation([a], "2020-11-30");
    expect(alerts).toHaveLength(0);
  });

  it("sorts multiple alerts by soonest completion first", () => {
    const soon = asset({ id: "soon", acquisitionCost: 120_000, usefulLifeYears: 1, acquisitionDate: "2020-01-01" });
    const later = asset({
      id: "later",
      acquisitionCost: 240_000,
      usefulLifeYears: 2,
      acquisitionDate: "2019-12-01",
    });
    const alerts = findAssetsNearingFullDepreciation([later, soon], "2020-11-30", 24);
    expect(alerts.map((x) => x.asset.id)).toEqual(["soon", "later"]);
    expect(alerts[0].monthsRemaining).toBeLessThanOrEqual(alerts[1].monthsRemaining);
  });
});

describe("findFullyDepreciatedAssets", () => {
  it("flags a straight-line asset that has already reached the 1-yen book value floor", () => {
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 1, acquisitionDate: "2015-01-01" });
    const alerts = findFullyDepreciatedAssets([a], "2020-01-01");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].asset.id).toBe(a.id);
    expect(alerts[0].bookValue).toBe(1);
    expect(alerts[0].accumulatedDepreciation).toBe(119_999);
    expect(alerts[0].immediateExpensingApplied).toBe(false);
  });

  it("flags an asset expensed under the immediate expensing rule as fully depreciated (0-yen book value), regardless of how much later the reference date is", () => {
    const a = asset({
      acquisitionCost: 250_000,
      acquisitionDate: "2024-04-01",
      immediateExpensing: true,
    });
    const alerts = findFullyDepreciatedAssets([a], "2026-07-30");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].bookValue).toBe(0);
    expect(alerts[0].accumulatedDepreciation).toBe(250_000);
    expect(alerts[0].immediateExpensingApplied).toBe(true);
  });

  it("does not flag an asset that is still being depreciated", () => {
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 5, acquisitionDate: "2025-01-01" });
    const alerts = findFullyDepreciatedAssets([a], "2025-06-01");
    expect(alerts).toHaveLength(0);
  });

  it("excludes assets not yet acquired as of the reference date", () => {
    const a = asset({ acquisitionDate: "2030-01-01" });
    const alerts = findFullyDepreciatedAssets([a], "2026-07-30");
    expect(alerts).toHaveLength(0);
  });
});

describe("checkDeMinimisCapAlert", () => {
  function immediateExpensingAsset(id: string, cost: number, acquisitionDate: string): Asset {
    return asset({ id, acquisitionCost: cost, acquisitionDate, immediateExpensing: true });
  }

  it("reports level 'ok' when usage is well under the approaching threshold", () => {
    const assets = [1, 2, 3, 4, 5].map((n) => immediateExpensingAsset(String(n), 200_000, "2025-04-01"));
    const alert = checkDeMinimisCapAlert(assets, FISCAL_YEAR_2025);

    expect(alert.capCheck.totalExpensedAmount).toBe(1_000_000);
    expect(alert.capCheck.annualCap).toBe(IMMEDIATE_EXPENSING_ANNUAL_CAP);
    expect(alert.capCheck.capExceeded).toBe(false);
    expect(alert.level).toBe("ok");
    expect(alert.usedRatio).toBeCloseTo(1_000_000 / 3_000_000);
    expect(alert.remainingAmount).toBe(2_000_000);
  });

  it("reports level 'approaching' once usage crosses the default 80% ratio but stays under the cap", () => {
    const assets = Array.from({ length: 10 }, (_, i) => immediateExpensingAsset(String(i), 250_000, "2025-04-01"));
    const alert = checkDeMinimisCapAlert(assets, FISCAL_YEAR_2025);

    expect(alert.capCheck.totalExpensedAmount).toBe(2_500_000);
    expect(alert.capCheck.capExceeded).toBe(false);
    expect(alert.usedRatio).toBeGreaterThanOrEqual(DEFAULT_DE_MINIMIS_APPROACHING_RATIO);
    expect(alert.level).toBe("approaching");
    expect(alert.remainingAmount).toBe(500_000);
  });

  it("reports level 'exceeded' and a zero remaining amount once the annual cap is passed, without picking which asset to change", () => {
    const assets = Array.from({ length: 11 }, (_, i) => immediateExpensingAsset(String(i), 299_000, "2025-04-01"));
    const alert = checkDeMinimisCapAlert(assets, FISCAL_YEAR_2025);

    expect(alert.capCheck.totalExpensedAmount).toBe(3_289_000);
    expect(alert.capCheck.capExceeded).toBe(true);
    expect(alert.capCheck.excessAmount).toBe(289_000);
    expect(alert.level).toBe("exceeded");
    expect(alert.remainingAmount).toBe(0);
    // The cap-crossing decision aid is depreciation.ts's own responsibility (validateDeMinimisAnnualCap);
    // this module just cross-checks its result rather than re-deciding anything.
    expect(alert.capCheck.assetsByAcquisitionDateDesc).toHaveLength(11);
  });

  it("respects a custom approaching threshold ratio", () => {
    const assets = [immediateExpensingAsset("1", 200_000, "2025-04-01")];
    const strict = checkDeMinimisCapAlert(assets, FISCAL_YEAR_2025, 0.05);
    expect(strict.level).toBe("approaching");

    const lenient = checkDeMinimisCapAlert(assets, FISCAL_YEAR_2025, 0.99);
    expect(lenient.level).toBe("ok");
  });
});

describe("computeAssetLifecycleAlerts", () => {
  it("combines all three alert categories for a mixed asset list", () => {
    const nearing = asset({
      id: "nearing",
      acquisitionCost: 120_000,
      usefulLifeYears: 1,
      acquisitionDate: "2025-09-01",
    });
    const fullyDepreciated = asset({
      id: "fully-depreciated",
      acquisitionCost: 120_000,
      usefulLifeYears: 1,
      acquisitionDate: "2015-01-01",
    });
    const stillDepreciating = asset({
      id: "still-depreciating",
      acquisitionCost: 1_200_000,
      usefulLifeYears: 10,
      acquisitionDate: "2025-04-01",
    });
    const deMinimisAssets = Array.from({ length: 11 }, (_, i) =>
      asset({
        id: `de-minimis-${i}`,
        acquisitionCost: 299_000,
        acquisitionDate: "2025-04-01",
        immediateExpensing: true,
      })
    );

    const result = computeAssetLifecycleAlerts(
      [nearing, fullyDepreciated, stillDepreciating, ...deMinimisAssets],
      FISCAL_YEAR_2025,
      "2026-07-30"
    );

    expect(result.nearingFullDepreciation.map((a) => a.asset.id)).toContain("nearing");
    expect(result.nearingFullDepreciation.map((a) => a.asset.id)).not.toContain("still-depreciating");
    expect(result.fullyDepreciated.map((a) => a.asset.id)).toContain("fully-depreciated");
    expect(result.fullyDepreciated.map((a) => a.asset.id).sort()).toEqual(
      expect.arrayContaining(["fully-depreciated", ...deMinimisAssets.map((a) => a.id)])
    );
    expect(result.deMinimisCap.level).toBe("exceeded");
  });

  it("returns empty/ok results for an empty asset list", () => {
    const result = computeAssetLifecycleAlerts([], FISCAL_YEAR_2025, "2026-07-30");
    expect(result.nearingFullDepreciation).toHaveLength(0);
    expect(result.fullyDepreciated).toHaveLength(0);
    expect(result.deMinimisCap.level).toBe("ok");
    expect(result.deMinimisCap.capCheck.totalExpensedAmount).toBe(0);
  });
});
