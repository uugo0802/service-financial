import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, AuditLogRow } from "./supabaseClient";
import { listAuditLogs } from "./auditLogs";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleLog: AuditLogRow = {
  id: "log-1",
  tenant_id: "tenant-1",
  user_id: "user-1",
  action: "transaction.confirm",
  entity_type: "transaction",
  entity_id: "tx-1",
  changes: { source: "rule" },
  created_at: "2026-07-01T00:00:00Z",
};

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by tenant and orders by created_at desc", async () => {
    const builder = createBuilder({ data: [sampleLog], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listAuditLogs("tenant-1");

    expect(result).toEqual([sampleLog]);
    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listAuditLogs("tenant-1")).rejects.toThrow(/監査ログの取得に失敗しました/);
  });
});
