import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, TenantUser, TransactionRow } from "./supabaseClient";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  loadTransactionsForCurrentTenant,
  updateTransaction,
} from "./transactions";
import { getMyTenantUser } from "./tenants";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

vi.mock("./tenants", () => ({ getMyTenantUser: vi.fn() }));

/**
 * supabase-js のクエリビルダーを模した最小限のチェーン可能モック。
 * どのメソッドを何回チェーンしても最終的に `result` へthenableとして解決する。
 */
function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleRow: TransactionRow = {
  id: "tx-1",
  tenant_id: "tenant-1",
  date: "2026-07-01",
  description: "事務所家賃",
  amount: -150000,
  account_id: null,
  tax_category: "課税仕入10%",
  confidence: 1,
  source: "rule",
  note: null,
  personal_deduction_only: false,
  created_at: "2026-07-01T00:00:00Z",
};

describe("transactions CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listTransactions scopes the query to the given tenant and orders by date desc", async () => {
    const builder = createBuilder({ data: [sampleRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listTransactions("tenant-1");

    expect(result).toEqual([sampleRow]);
    expect(from).toHaveBeenCalledWith("transactions");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("date", { ascending: false });
  });

  it("listTransactions throws a Japanese error message when the query fails", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listTransactions("tenant-1")).rejects.toThrow(/取引データの取得に失敗しました/);
  });

  it("getTransaction filters by both id and tenant_id", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await getTransaction("tenant-1", "tx-1");

    expect(result).toEqual(sampleRow);
    expect(builder.eq).toHaveBeenCalledWith("id", "tx-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("getTransaction returns null when no row matches", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await getTransaction("tenant-1", "missing");

    expect(result).toBeNull();
  });

  it("createTransaction inserts a row scoped to the tenant and returns it", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createTransaction("tenant-1", {
      date: "2026-07-01",
      description: "事務所家賃",
      amount: -150000,
      taxCategory: "課税仕入10%",
      source: "rule",
    });

    expect(result).toEqual(sampleRow);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-1", description: "事務所家賃", amount: -150000 })
    );
  });

  it("createTransaction throws when Supabase returns an error", async () => {
    const builder = createBuilder({ data: null, error: { message: "insert failed" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createTransaction("tenant-1", {
        date: "2026-07-01",
        description: "x",
        amount: 1,
        taxCategory: "対象外",
        source: "uncategorized",
      })
    ).rejects.toThrow(/取引データの作成に失敗しました/);
  });

  it("updateTransaction only sends defined fields and scopes by id + tenant_id", async () => {
    const updated = { ...sampleRow, description: "更新後の摘要" };
    const builder = createBuilder({ data: updated, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await updateTransaction("tenant-1", "tx-1", { description: "更新後の摘要" });

    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith({ description: "更新後の摘要" });
    expect(builder.eq).toHaveBeenCalledWith("id", "tx-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteTransaction scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await deleteTransaction("tenant-1", "tx-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "tx-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteTransaction throws a Japanese error message when the delete fails", async () => {
    const builder = createBuilder({ data: null, error: { message: "delete failed" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteTransaction("tenant-1", "tx-1")).rejects.toThrow(/取引データの削除に失敗しました/);
  });
});

const tenantUser: TenantUser = {
  user_id: "user-1",
  tenant_id: "tenant-1",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};

describe("loadTransactionsForCurrentTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no logged-in tenant user (unconfigured/unauthenticated)", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    await expect(loadTransactionsForCurrentTenant()).resolves.toBeNull();
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns null when the tenant has no transactions yet", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    const builder = createBuilder({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(loadTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("returns null (rather than throwing) when the fetch fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(loadTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("returns the tenant's transactions scoped by tenant_id when data exists", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    const builder = createBuilder({ data: [sampleRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await loadTransactionsForCurrentTenant();

    expect(result).toEqual([sampleRow]);
    expect(from).toHaveBeenCalledWith("transactions");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
