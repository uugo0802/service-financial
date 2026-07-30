import { describe, expect, it } from "vitest";
import { Asset } from "./depreciation";
import { AssetDisposalInput, calculateAssetDisposal } from "./assetDisposal";

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "1",
    name: "テスト資産",
    acquisitionDate: "2024-04-01",
    acquisitionCost: 1_200_000,
    usefulLifeYears: 5,
    ...overrides,
  };
}

function input(overrides: Partial<AssetDisposalInput>): AssetDisposalInput {
  return {
    asset: asset({}),
    disposalDate: "2026-07-10",
    disposalProceeds: 0,
    ...overrides,
  };
}

describe("calculateAssetDisposal", () => {
  it("computes the loss on retirement (除却) as the full remaining book value when there are no proceeds", () => {
    // Acquired 2024-04-01, cost 1,200,000, 5-year life (monthly = 20,000).
    // Disposed 2026-07-10 -> cutoff = end of June 2026 -> 27 months of depreciation (Apr 2024..Jun 2026).
    const result = calculateAssetDisposal(input({}));

    expect(result.cutoffDate).toBe("2026-06-30");
    expect(result.monthsDepreciatedBeforeDisposal).toBe(27);
    expect(result.accumulatedDepreciationBeforeDisposal).toBe(540_000); // 20,000 * 27
    expect(result.bookValueAtDisposal).toBe(660_000); // 1,200,000 - 540,000
    expect(result.disposalCase).toBe("retirement");
    expect(result.gainOrLoss).toBe(-660_000);
    expect(result.isLoss).toBe(true);
    expect(result.isGain).toBe(false);
    expect(result.notes.join(" ")).toMatch(/固定資産除却損として660,000円/);
  });

  it("computes a gain (売却益) when sale proceeds exceed the remaining book value", () => {
    const result = calculateAssetDisposal(input({ disposalProceeds: 750_000 }));

    expect(result.bookValueAtDisposal).toBe(660_000);
    expect(result.disposalCase).toBe("sale");
    expect(result.gainOrLoss).toBe(90_000);
    expect(result.isGain).toBe(true);
    expect(result.isLoss).toBe(false);
    expect(result.notes.join(" ")).toMatch(/固定資産売却益として90,000円/);
  });

  it("computes a loss (売却損) when sale proceeds are less than the remaining book value", () => {
    const result = calculateAssetDisposal(input({ disposalProceeds: 400_000 }));

    expect(result.bookValueAtDisposal).toBe(660_000);
    expect(result.disposalCase).toBe("sale");
    expect(result.gainOrLoss).toBe(-260_000);
    expect(result.isLoss).toBe(true);
    expect(result.notes.join(" ")).toMatch(/固定資産売却損として260,000円/);
  });

  it("recognizes neither gain nor loss when sale proceeds exactly equal the book value", () => {
    const result = calculateAssetDisposal(input({ disposalProceeds: 660_000 }));

    expect(result.disposalCase).toBe("sale");
    expect(result.gainOrLoss).toBe(0);
    expect(result.isGain).toBe(false);
    expect(result.isLoss).toBe(false);
    expect(result.notes.join(" ")).toMatch(/売却損益は発生しません/);
  });

  it("prorates a partial-year disposal that happens within the asset's first year", () => {
    // Acquired 2025-04-01, cost 600,000, 5-year life (monthly = 10,000).
    // Disposed 2025-07-20 -> cutoff = end of June 2025 -> 3 months (Apr, May, Jun).
    const a = asset({ acquisitionCost: 600_000, usefulLifeYears: 5, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-07-20", disposalProceeds: 0 });

    expect(result.cutoffDate).toBe("2025-06-30");
    expect(result.monthsDepreciatedBeforeDisposal).toBe(3);
    expect(result.accumulatedDepreciationBeforeDisposal).toBe(30_000);
    expect(result.bookValueAtDisposal).toBe(570_000);
    expect(result.gainOrLoss).toBe(-570_000);
  });

  it("treats disposal in the very same month as acquisition as having no depreciation yet", () => {
    // Acquired 2025-04-15, disposed 2025-04-25 (same month) -> cutoff (end of March) precedes acquisition.
    const a = asset({ acquisitionCost: 300_000, usefulLifeYears: 3, acquisitionDate: "2025-04-15" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-04-25", disposalProceeds: 0 });

    expect(result.cutoffDate).toBe("2025-03-31");
    expect(result.monthsDepreciatedBeforeDisposal).toBe(0);
    expect(result.accumulatedDepreciationBeforeDisposal).toBe(0);
    expect(result.bookValueAtDisposal).toBe(300_000);
    expect(result.gainOrLoss).toBe(-300_000);
  });

  it("caps the remaining book value at the 1-yen residual once the asset is already fully depreciated", () => {
    // 100,000 yen asset, 1-year useful life, acquired long before disposal -> already at the 1-yen floor.
    const a = asset({ acquisitionCost: 100_000, usefulLifeYears: 1, acquisitionDate: "2020-01-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2026-08-01", disposalProceeds: 0 });

    expect(result.bookValueAtDisposal).toBe(1);
    expect(result.gainOrLoss).toBe(-1);
    expect(result.disposalCase).toBe("retirement");
  });

  it("computes a gain when sale proceeds exceed the book value of an already fully depreciated asset", () => {
    const a = asset({ acquisitionCost: 100_000, usefulLifeYears: 1, acquisitionDate: "2020-01-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2026-08-01", disposalProceeds: 50_000 });

    expect(result.bookValueAtDisposal).toBe(1);
    expect(result.disposalCase).toBe("sale");
    expect(result.gainOrLoss).toBe(49_999);
    expect(result.isGain).toBe(true);
  });

  it("shows zero loss for an immediate-expensing (少額減価償却資産) asset disposed after its acquisition month", () => {
    const a = asset({
      acquisitionCost: 250_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-06-10",
      immediateExpensing: true,
    });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-08-01", disposalProceeds: 0 });

    // Already fully expensed in the acquisition month, so no further loss on disposal.
    expect(result.bookValueAtDisposal).toBe(0);
    expect(result.gainOrLoss).toBe(0);
    expect(result.disposalCase).toBe("retirement");
    expect(result.notes.join(" ")).toMatch(/除却損は発生しません/);
  });

  it("treats a sale of an immediate-expensing asset as a full gain equal to the proceeds", () => {
    const a = asset({
      acquisitionCost: 250_000,
      usefulLifeYears: 5,
      acquisitionDate: "2025-06-10",
      immediateExpensing: true,
    });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-08-01", disposalProceeds: 30_000 });

    expect(result.bookValueAtDisposal).toBe(0);
    expect(result.gainOrLoss).toBe(30_000);
    expect(result.disposalCase).toBe("sale");
    expect(result.isGain).toBe(true);
  });

  it("clamps a negative disposal proceeds input to zero and treats it as a retirement", () => {
    const result = calculateAssetDisposal(input({ disposalProceeds: -5_000 }));

    expect(result.disposalProceeds).toBe(0);
    expect(result.disposalCase).toBe("retirement");
    expect(result.notes.join(" ")).toMatch(/負の値が入力されたため、0円/);
  });

  it("treats an acquisition cost of zero as producing no loss on retirement", () => {
    const a = asset({ acquisitionCost: 0, usefulLifeYears: 5, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2026-04-01", disposalProceeds: 0 });

    expect(result.bookValueAtDisposal).toBe(0);
    expect(result.gainOrLoss).toBe(0);
    expect(result.isLoss).toBe(false);
    expect(result.notes.join(" ")).toMatch(/除却損は発生しません/);
  });

  it("warns and falls back to the full acquisition cost when the disposal date precedes the acquisition date", () => {
    const a = asset({ acquisitionCost: 500_000, usefulLifeYears: 5, acquisitionDate: "2026-01-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-06-01", disposalProceeds: 0 });

    expect(result.bookValueAtDisposal).toBe(500_000);
    expect(result.notes.join(" ")).toMatch(/取得年月日より前になっています/);
  });

  it("silently treats a NaN disposalProceeds as 0 (retirement) without the negative-value warning note", () => {
    // Unlike an explicit negative number, NaN fails the Number.isFinite guard on both branches,
    // so it falls through to 0 without any note being pushed. This documents that current
    // (silent) behavior, which is asymmetric with how negative numbers are warned about.
    const result = calculateAssetDisposal(input({ disposalProceeds: NaN }));

    expect(result.disposalProceeds).toBe(0);
    expect(result.disposalCase).toBe("retirement");
    expect(result.notes.join(" ")).not.toMatch(/負の値が入力されたため/);
  });

  it("silently treats an Infinity disposalProceeds as 0 (retirement) since Number.isFinite rejects it", () => {
    const result = calculateAssetDisposal(input({ disposalProceeds: Infinity }));

    expect(result.disposalProceeds).toBe(0);
    expect(result.disposalCase).toBe("retirement");
  });

  it("propagates notes from the underlying depreciation calculation (e.g. non-positive useful life)", () => {
    const a = asset({ acquisitionCost: 120_000, usefulLifeYears: 0, acquisitionDate: "2025-04-01" });
    const result = calculateAssetDisposal({ asset: a, disposalDate: "2025-10-01", disposalProceeds: 0 });

    expect(result.notes.some((n) => n.includes("耐用年数は1年以上"))).toBe(true);
  });
});
