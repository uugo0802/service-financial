import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, DocumentRow } from "./supabaseClient";
import { createDocument, deleteDocument, listDocuments } from "./documents";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "delete", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleDocument: DocumentRow = {
  id: "doc-1",
  tenant_id: "tenant-1",
  transaction_id: null,
  storage_path: "tenant-1/receipts/2026-07-01.pdf",
  uploaded_at: "2026-07-01T00:00:00Z",
};

describe("documents CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listDocuments scopes by tenant and orders by uploaded_at desc", async () => {
    const builder = createBuilder({ data: [sampleDocument], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listDocuments("tenant-1");

    expect(result).toEqual([sampleDocument]);
    expect(from).toHaveBeenCalledWith("documents");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("uploaded_at", { ascending: false });
  });

  it("createDocument inserts scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleDocument, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await createDocument("tenant-1", { storagePath: "tenant-1/receipts/2026-07-01.pdf" });

    expect(result).toEqual(sampleDocument);
    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      storage_path: "tenant-1/receipts/2026-07-01.pdf",
      transaction_id: null,
    });
  });

  it("createDocument throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(createDocument("tenant-1", { storagePath: "x" })).rejects.toThrow(/証憑の登録に失敗しました/);
  });

  it("deleteDocument scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteDocument("tenant-1", "doc-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "doc-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});
