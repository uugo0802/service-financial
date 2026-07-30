import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";
import {
  CategorizeRuleRow,
  createCategorizeRule,
  deleteCategorizeRule,
  listCategorizeRules,
  updateCategorizeRule,
} from "./categorizeRules";

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

const sampleRow: CategorizeRuleRow = {
  id: "rule-1",
  tenant_id: "tenant-1",
  pattern: "クライアントA社",
  account: "業務委託売上(特別会計)",
  tax_category: "課税売上10%",
  note: "常連クライアント",
  created_at: "2026-07-29T00:00:00Z",
};

describe("categorizeRules CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCategorizeRules scopes by tenant, orders by created_at desc, and maps rows to domain objects", async () => {
    const builder = createBuilder({ data: [sampleRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listCategorizeRules("tenant-1");

    expect(from).toHaveBeenCalledWith("user_categorize_rules");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "rule-1",
        pattern: "クライアントA社",
        account: "業務委託売上(特別会計)",
        taxCategory: "課税売上10%",
        note: "常連クライアント",
        createdAt: "2026-07-29T00:00:00Z",
      },
    ]);
  });

  it("listCategorizeRules returns an empty array when no data is returned", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await listCategorizeRules("tenant-1");
    expect(result).toEqual([]);
  });

  it("listCategorizeRules throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listCategorizeRules("tenant-1")).rejects.toThrow(/ユーザー辞書ルールの取得に失敗しました/);
  });

  it("createCategorizeRule inserts a trimmed rule scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await createCategorizeRule("tenant-1", {
      pattern: "  クライアントA社  ",
      account: "  業務委託売上(特別会計)  ",
      taxCategory: "課税売上10%",
      note: "  常連クライアント  ",
    });

    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      pattern: "クライアントA社",
      account: "業務委託売上(特別会計)",
      tax_category: "課税売上10%",
      note: "常連クライアント",
    });
    expect(result.id).toBe("rule-1");
    expect(result.taxCategory).toBe("課税売上10%");
  });

  it("createCategorizeRule stores null when no note is provided", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await createCategorizeRule("tenant-1", {
      pattern: "クライアントA社",
      account: "業務委託売上(特別会計)",
      taxCategory: "課税売上10%",
    });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        note: null,
      })
    );
  });

  it("createCategorizeRule throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createCategorizeRule("tenant-1", { pattern: "abc", account: "売上高", taxCategory: "課税売上10%" })
    ).rejects.toThrow(/ユーザー辞書ルールの登録に失敗しました/);
  });

  it("updateCategorizeRule scopes the update by id and tenant_id", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await updateCategorizeRule("tenant-1", "rule-1", {
      pattern: "クライアントA社",
      account: "業務委託売上(特別会計)",
      taxCategory: "課税売上10%",
    });

    expect(builder.update).toHaveBeenCalledWith({
      pattern: "クライアントA社",
      account: "業務委託売上(特別会計)",
      tax_category: "課税売上10%",
      note: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "rule-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result.account).toBe("業務委託売上(特別会計)");
  });

  it("updateCategorizeRule throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      updateCategorizeRule("tenant-1", "rule-1", { pattern: "abc", account: "売上高", taxCategory: "課税売上10%" })
    ).rejects.toThrow(/ユーザー辞書ルールの更新に失敗しました/);
  });

  it("deleteCategorizeRule scopes the delete by id and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteCategorizeRule("tenant-1", "rule-1");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", "rule-1");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteCategorizeRule throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteCategorizeRule("tenant-1", "rule-1")).rejects.toThrow(/ユーザー辞書ルールの削除に失敗しました/);
  });
});
