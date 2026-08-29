import { beforeEach, describe, expect, it, vi } from "vitest";
import { FixedAssetRow, Tenant, TenantUser } from "./supabaseClient";
import { getMyTenantUser, getTenant } from "./tenants";
import { listFixedAssets } from "./fixedAssets";
import { loadDepreciationScheduleDataForCurrentTenant } from "./depreciationScheduleData";

vi.mock("./tenants", () => ({ getMyTenantUser: vi.fn(), getTenant: vi.fn() }));
vi.mock("./fixedAssets", async () => {
  const actual = await vi.importActual<typeof import("./fixedAssets")>("./fixedAssets");
  return { ...actual, listFixedAssets: vi.fn() };
});

const tenantUser: TenantUser = { user_id: "user-1", tenant_id: "tenant-1", role: "owner", created_at: "2026-01-01T00:00:00Z" };
const tenant: Tenant = {
  id: "tenant-1",
  entity_type: "corp",
  display_name: "テスト合同会社",
  created_at: "2026-01-01T00:00:00Z",
};

const fixedAssetRow: FixedAssetRow = {
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

describe("loadDepreciationScheduleDataForCurrentTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no logged-in tenant user", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    await expect(loadDepreciationScheduleDataForCurrentTenant()).resolves.toBeNull();
    expect(getTenant).not.toHaveBeenCalled();
    expect(listFixedAssets).not.toHaveBeenCalled();
  });

  it("returns null when the tenant itself cannot be resolved", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(null);
    vi.mocked(listFixedAssets).mockResolvedValue([fixedAssetRow]);

    await expect(loadDepreciationScheduleDataForCurrentTenant()).resolves.toBeNull();
  });

  it("returns null (rather than throwing) when a fetch fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockRejectedValue(new Error("boom"));
    vi.mocked(listFixedAssets).mockResolvedValue([]);

    await expect(loadDepreciationScheduleDataForCurrentTenant()).resolves.toBeNull();
  });

  it("assembles the tenant display name and fixed-asset ledger converted to Asset[]", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(tenant);
    vi.mocked(listFixedAssets).mockResolvedValue([fixedAssetRow]);

    const result = await loadDepreciationScheduleDataForCurrentTenant();

    expect(result).not.toBeNull();
    expect(result?.entityName).toBe("テスト合同会社");
    expect(result?.assets).toHaveLength(1);
    expect(result?.assets[0]).toEqual({
      id: "asset-1",
      name: "什器備品",
      acquisitionDate: "2025-06-01",
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      immediateExpensing: false,
      method: "straight-line",
    });
  });

  it("returns an empty asset list (not a sample fallback) when the tenant has not registered any fixed assets yet", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(tenant);
    vi.mocked(listFixedAssets).mockResolvedValue([]);

    const result = await loadDepreciationScheduleDataForCurrentTenant();

    expect(result).toEqual({ entityName: "テスト合同会社", assets: [] });
  });
});
