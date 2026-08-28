import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";
import { CounterpartyRow, createCounterparty, deleteCounterparty, listCounterparties, updateCounterparty } from "./clients";

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

const sampleRow: CounterpartyRow = {
  id: "cp-1",
  tenant_id: "tenant-1",
  name: "A社",
  kind: "client",
  default_account_name: "売上高",
  invoice_registration_number: "T2120901007402",
  notes: "コンサルティング案件の売上先",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("clients (counterparties) CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCounterparties scopes by tenant, orders by name asc, and maps rows to domain objects", async () => {
    const builder = createBuilder({ data: [sampleRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listCounterparties("tenant-1");

    expect(from).toHaveBeenCalledWith("counterparties");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
    expect(result).toEqual([
      {
        id: "cp-1",
        name: "A社",
        kind: "client",
        defaultAccountName: "売上高",
        invoiceRegistrationNumber: "T2120901007402",
        notes: "コンサルティング案件の売上先",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      },
    ]);
  });

  it("listCounterparties returns an empty array when no data is returned", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await listCounterparties("tenant-1");
    expect(result).toEqual([]);
  });

  it("listCounterparties throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listCounterparties("tenant-1")).rejects.toThrow(/取引先の取得に失敗しました/);
  });

  it("createCounterparty inserts a trimmed record scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await createCounterparty("tenant-1", {
      name: "  A社  ",
      kind: "client",
      defaultAccountName: "  売上高  ",
      invoiceRegistrationNumber: "  T2120901007402  ",
      notes: "  コンサルティング案件の売上先  ",
    });

    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      name: "A社",
      kind: "client",
      default_account_name: "売上高",
      invoice_registration_number: "T2120901007402",
      notes: "コンサルティング案件の売上先",
    });
    expect(result.id).toBe("cp-1");
  });

  it("createCounterparty stores null for omitted optional fields", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await createCounterparty("tenant-1", { name: "A社", kind: "client" });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        default_account_name: null,
        invoice_registration_number: null,
        notes: null,
      })
    );
  });

  it("createCounterparty throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(createCounterparty("tenant-1", { name: "A社", kind: "client" })).rejects.toThrow(
      /取引先の登録に失敗しました/
    );
  });

  it("updateCounterparty scopes the update by id and tenant_id", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await updateCounterparty("tenant-1", "cp-1", { name: "A社", kind: "client" });

    expect(builder.update).toHaveBeenCalledWith({
      name: "A社",
      kind: "client",
      default_account_name: null,
      invoice_registration_number: null,
      notes: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "cp-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result.name).toBe("A社");
  });

  it("updateCounterparty throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(updateCounterparty("tenant-1", "cp-1", { name: "A社", kind: "client" })).rejects.toThrow(
      /取引先の更新に失敗しました/
    );
  });

  it("deleteCounterparty scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteCounterparty("tenant-1", "cp-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "cp-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteCounterparty throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteCounterparty("tenant-1", "cp-1")).rejects.toThrow(/取引先の削除に失敗しました/);
  });
});
