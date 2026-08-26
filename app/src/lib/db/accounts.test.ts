import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, AccountRow } from "./supabaseClient";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "./accounts";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleAccount: AccountRow = {
  id: "acc-1",
  tenant_id: "tenant-1",
  code: null,
  name: "地代家賃",
  account_type: "expense",
  tax_category: null,
  created_at: "2026-07-01T00:00:00Z",
};

describe("accounts CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAccounts scopes by tenant and orders by name", async () => {
    const builder = createBuilder({ data: [sampleAccount], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listAccounts("tenant-1");

    expect(result).toEqual([sampleAccount]);
    expect(from).toHaveBeenCalledWith("accounts");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("listAccounts throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listAccounts("tenant-1")).rejects.toThrow(/勘定科目の取得に失敗しました/);
  });

  it("createAccount inserts scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleAccount, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createAccount("tenant-1", { name: "地代家賃", account_type: "expense" });

    expect(result).toEqual(sampleAccount);
    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      name: "地代家賃",
      account_type: "expense",
      code: null,
    });
  });

  it("updateAccount sends only defined fields and scopes by id + tenant_id", async () => {
    const updated = { ...sampleAccount, name: "新しい科目名" };
    const builder = createBuilder({ data: updated, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await updateAccount("tenant-1", "acc-1", { name: "新しい科目名" });

    expect(result).toEqual(updated);
    expect(builder.update).toHaveBeenCalledWith({ name: "新しい科目名" });
    expect(builder.eq).toHaveBeenCalledWith("id", "acc-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteAccount scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteAccount("tenant-1", "acc-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "acc-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteAccount throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteAccount("tenant-1", "acc-1")).rejects.toThrow(/勘定科目の削除に失敗しました/);
  });
});
