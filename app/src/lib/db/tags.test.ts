import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";
import {
  TagAssignmentRow,
  TagRow,
  assignTag,
  createTag,
  deleteTag,
  listTagAssignments,
  listTags,
  unassignTag,
  upsertTag,
} from "./tags";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "in", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleTagRow: TagRow = {
  id: "tag-1",
  tenant_id: "tenant-1",
  label: "A社案件",
  color: "#2a78d6",
  created_at: "2026-07-01T00:00:00Z",
};

const sampleAssignmentRow: TagAssignmentRow = {
  tag_id: "tag-1",
  transaction_id: "tx-1",
  created_at: "2026-07-02T00:00:00Z",
};

describe("tags CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listTags scopes by tenant, orders by label asc, and maps rows to domain objects", async () => {
    const builder = createBuilder({ data: [sampleTagRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listTags("tenant-1");

    expect(from).toHaveBeenCalledWith("tags");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("label", { ascending: true });
    expect(result).toEqual([{ id: "tag-1", label: "A社案件", color: "#2a78d6" }]);
  });

  it("listTags returns an empty array when no data is returned", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await listTags("tenant-1");
    expect(result).toEqual([]);
  });

  it("listTags throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listTags("tenant-1")).rejects.toThrow(/タグの取得に失敗しました/);
  });

  it("listTagAssignments scopes tag lookup by tenant, then fetches assignments for those tag ids", async () => {
    const tagsBuilder = createBuilder({ data: [{ id: "tag-1" }], error: null });
    const assignmentsBuilder = createBuilder({ data: [sampleAssignmentRow], error: null });
    const from = vi.fn((table: string) => (table === "tags" ? tagsBuilder : assignmentsBuilder));
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listTagAssignments("tenant-1");

    expect(tagsBuilder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(assignmentsBuilder.in).toHaveBeenCalledWith("tag_id", ["tag-1"]);
    expect(result).toEqual([{ tagId: "tag-1", transactionId: "tx-1" }]);
  });

  it("listTagAssignments returns an empty array without querying tag_assignments when the tenant has no tags", async () => {
    const tagsBuilder = createBuilder({ data: [], error: null });
    const from = vi.fn(() => tagsBuilder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listTagAssignments("tenant-1");

    expect(result).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("tags");
  });

  it("createTag inserts a trimmed tag scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleTagRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await createTag("tenant-1", { label: "  A社案件  ", color: "#2a78d6" });

    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      label: "A社案件",
      color: "#2a78d6",
    });
    expect(result).toEqual({ id: "tag-1", label: "A社案件", color: "#2a78d6" });
  });

  it("createTag throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(createTag("tenant-1", { label: "A社案件" })).rejects.toThrow(/タグの登録に失敗しました/);
  });

  it("upsertTag without an id delegates to createTag (insert)", async () => {
    const builder = createBuilder({ data: sampleTagRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await upsertTag("tenant-1", { label: "A社案件" });

    expect(builder.insert).toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("upsertTag with an id updates the existing tag scoped by id and tenant_id", async () => {
    const builder = createBuilder({ data: sampleTagRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await upsertTag("tenant-1", { label: "A社案件", color: "#2a78d6" }, "tag-1");

    expect(builder.update).toHaveBeenCalledWith({ label: "A社案件", color: "#2a78d6" });
    expect(builder.eq).toHaveBeenCalledWith("id", "tag-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result.id).toBe("tag-1");
  });

  it("deleteTag scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteTag("tenant-1", "tag-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "tag-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteTag throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteTag("tenant-1", "tag-1")).rejects.toThrow(/タグの削除に失敗しました/);
  });

  it("assignTag upserts on the (tag_id, transaction_id) pair", async () => {
    const builder = createBuilder({ data: sampleAssignmentRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await assignTag("tag-1", "tx-1");

    expect(builder.upsert).toHaveBeenCalledWith(
      { tag_id: "tag-1", transaction_id: "tx-1" },
      { onConflict: "tag_id,transaction_id" }
    );
    expect(result).toEqual({ tagId: "tag-1", transactionId: "tx-1" });
  });

  it("assignTag throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(assignTag("tag-1", "tx-1")).rejects.toThrow(/タグの付与に失敗しました/);
  });

  it("unassignTag scopes the delete by tag_id and transaction_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await unassignTag("tag-1", "tx-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("tag_id", "tag-1");
    expect(builder.eq).toHaveBeenCalledWith("transaction_id", "tx-1");
  });

  it("unassignTag throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(unassignTag("tag-1", "tx-1")).rejects.toThrow(/タグの解除に失敗しました/);
  });
});
