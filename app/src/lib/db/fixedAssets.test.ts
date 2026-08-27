import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, FixedAssetRow } from "./supabaseClient";
import {
  EMPTY_FIXED_ASSET_DRAFT,
  activeFixedAssetsAsOf,
  createFixedAsset,
  draftToFixedAssetInput,
  hasFixedAssetErrors,
  listFixedAssets,
  toDepreciationAsset,
  validateFixedAssetDraft,
} from "./fixedAssets";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleAsset: FixedAssetRow = {
  id: "asset-1",
  tenant_id: "tenant-1",
  name: "什器備品",
  acquisition_date: "2025-06-01",
  acquisition_cost: 600_000,
  useful_life_years: 5,
  immediate_expensing: false,
  method: "straight-line",
  asset_account_id: "acc-fixed",
  depreciation_expense_account_id: "acc-deprexp",
  disposed_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("listFixedAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by tenant and orders by acquisition date", async () => {
    const builder = createBuilder({ data: [sampleAsset], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listFixedAssets("tenant-1");

    expect(result).toEqual([sampleAsset]);
    expect(from).toHaveBeenCalledWith("fixed_assets");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("acquisition_date", { ascending: true });
  });

  it("returns an empty array when no rows are found (data is null)", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listFixedAssets("tenant-1")).resolves.toEqual([]);
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listFixedAssets("tenant-1")).rejects.toThrow(/固定資産台帳の取得に失敗しました/);
  });
});

describe("toDepreciationAsset", () => {
  it("maps a FixedAssetRow to depreciation.ts's Asset shape", () => {
    expect(toDepreciationAsset(sampleAsset)).toEqual({
      id: "asset-1",
      name: "什器備品",
      acquisitionDate: "2025-06-01",
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      immediateExpensing: false,
      method: "straight-line",
    });
  });
});

describe("activeFixedAssetsAsOf", () => {
  it("keeps assets that have not been disposed", () => {
    expect(activeFixedAssetsAsOf([sampleAsset], "2026-12-31")).toEqual([sampleAsset]);
  });

  it("excludes assets disposed on or before the given date", () => {
    const disposed = { ...sampleAsset, disposed_at: "2026-06-01" };
    expect(activeFixedAssetsAsOf([disposed], "2026-12-31")).toEqual([]);
  });

  it("keeps assets whose disposal date is after the given date", () => {
    const disposedLater = { ...sampleAsset, disposed_at: "2027-01-01" };
    expect(activeFixedAssetsAsOf([disposedLater], "2026-12-31")).toEqual([disposedLater]);
  });
});

describe("createFixedAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts scoped to the tenant with default method/immediate_expensing/disposed_at", async () => {
    const builder = createBuilder({ data: sampleAsset, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createFixedAsset("tenant-1", {
      name: "什器備品",
      acquisition_date: "2025-06-01",
      acquisition_cost: 600_000,
      useful_life_years: 5,
      asset_account_id: "acc-fixed",
      depreciation_expense_account_id: "acc-deprexp",
    });

    expect(result).toEqual(sampleAsset);
    expect(from).toHaveBeenCalledWith("fixed_assets");
    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      name: "什器備品",
      acquisition_date: "2025-06-01",
      acquisition_cost: 600_000,
      useful_life_years: 5,
      immediate_expensing: false,
      method: "straight-line",
      asset_account_id: "acc-fixed",
      depreciation_expense_account_id: "acc-deprexp",
      disposed_at: null,
    });
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createFixedAsset("tenant-1", {
        name: "什器備品",
        acquisition_date: "2025-06-01",
        acquisition_cost: 600_000,
        useful_life_years: 5,
        asset_account_id: "acc-fixed",
        depreciation_expense_account_id: "acc-deprexp",
      })
    ).rejects.toThrow(/固定資産の登録に失敗しました/);
  });
});

const validFixedAssetDraft = {
  name: "什器備品",
  acquisitionDate: "2025-06-01",
  acquisitionCost: "600000",
  usefulLifeYears: "5",
  immediateExpensing: false,
  method: "straight-line" as const,
  assetAccountId: "acc-fixed",
  depreciationExpenseAccountId: "acc-deprexp",
};

describe("validateFixedAssetDraft", () => {
  it("returns no errors for a valid draft", () => {
    expect(validateFixedAssetDraft(validFixedAssetDraft)).toEqual({});
  });

  it("flags an empty draft on every required field", () => {
    const errors = validateFixedAssetDraft(EMPTY_FIXED_ASSET_DRAFT);
    expect(hasFixedAssetErrors(errors)).toBe(true);
    expect(errors.name).toBeDefined();
    expect(errors.acquisitionDate).toBeDefined();
    expect(errors.acquisitionCost).toBeDefined();
    expect(errors.usefulLifeYears).toBeDefined();
    expect(errors.assetAccountId).toBeDefined();
    expect(errors.depreciationExpenseAccountId).toBeDefined();
  });

  it("rejects a zero or negative acquisition cost", () => {
    expect(validateFixedAssetDraft({ ...validFixedAssetDraft, acquisitionCost: "0" }).acquisitionCost).toBeDefined();
    expect(validateFixedAssetDraft({ ...validFixedAssetDraft, acquisitionCost: "-1" }).acquisitionCost).toBeDefined();
  });

  it("rejects a non-integer useful life", () => {
    expect(validateFixedAssetDraft({ ...validFixedAssetDraft, usefulLifeYears: "5.5" }).usefulLifeYears).toBeDefined();
  });
});

describe("draftToFixedAssetInput", () => {
  it("converts a valid draft to a DB input", () => {
    expect(draftToFixedAssetInput(validFixedAssetDraft)).toEqual({
      name: "什器備品",
      acquisition_date: "2025-06-01",
      acquisition_cost: 600_000,
      useful_life_years: 5,
      immediate_expensing: false,
      method: "straight-line",
      asset_account_id: "acc-fixed",
      depreciation_expense_account_id: "acc-deprexp",
    });
  });
});
