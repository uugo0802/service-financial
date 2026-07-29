import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, AuditLogRow } from "./supabaseClient";
import {
  listAuditLogs,
  filterAuditLogs,
  getDistinctEntityTypes,
  describeAuditAction,
  describeEntityType,
  extractChangeSummary,
} from "./auditLogs";

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

  it("returns an empty array (not null/undefined) when the query succeeds with no data", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await listAuditLogs("tenant-1");

    expect(result).toEqual([]);
  });
});

const LOGS: AuditLogRow[] = [
  {
    id: "log-1",
    tenant_id: "tenant-1",
    user_id: "user-1",
    action: "transaction.confirm",
    entity_type: "transaction",
    entity_id: "tx-1",
    changes: { before: { account_id: null }, after: { account_id: "acc-1" } },
    created_at: "2026-01-10T00:00:00Z",
  },
  {
    id: "log-2",
    tenant_id: "tenant-1",
    user_id: null,
    action: "document.upload",
    entity_type: "document",
    entity_id: "doc-1",
    changes: null,
    created_at: "2026-03-05T00:00:00Z",
  },
  {
    id: "log-3",
    tenant_id: "tenant-1",
    user_id: "user-2",
    action: "unknown.action",
    entity_type: "account",
    entity_id: "acc-9",
    changes: { note: "no before/after keys" },
    created_at: "2026-06-20T00:00:00Z",
  },
];

describe("filterAuditLogs", () => {
  it("returns all logs when no filter is given", () => {
    expect(filterAuditLogs(LOGS)).toEqual(LOGS);
    expect(filterAuditLogs(LOGS, {})).toEqual(LOGS);
  });

  it("filters by entityType", () => {
    expect(filterAuditLogs(LOGS, { entityType: "document" })).toEqual([LOGS[1]]);
  });

  it("filters by action", () => {
    expect(filterAuditLogs(LOGS, { action: "transaction.confirm" })).toEqual([LOGS[0]]);
  });

  it("filters by inclusive date range", () => {
    const result = filterAuditLogs(LOGS, { from: "2026-02-01", to: "2026-05-01" });
    expect(result).toEqual([LOGS[1]]);
  });

  it("treats an unparsable date filter as no bound", () => {
    expect(filterAuditLogs(LOGS, { from: "not-a-date" })).toEqual(LOGS);
  });

  it("combines multiple conditions", () => {
    expect(filterAuditLogs(LOGS, { entityType: "account", from: "2026-06-01" })).toEqual([LOGS[2]]);
    expect(filterAuditLogs(LOGS, { entityType: "account", from: "2026-07-01" })).toEqual([]);
  });

  it("includes a log whose created_at exactly equals the from/to boundary instant", () => {
    expect(filterAuditLogs(LOGS, { from: "2026-01-10T00:00:00Z", to: "2026-01-10T00:00:00Z" })).toEqual([LOGS[0]]);
  });

  it("excludes a log one millisecond outside an exact-instant boundary", () => {
    expect(filterAuditLogs(LOGS, { to: "2026-01-09T23:59:59.999Z" })).toEqual([]);
    expect(filterAuditLogs(LOGS, { from: "2026-01-10T00:00:00.001Z", to: "2026-01-10T00:00:00.001Z" })).toEqual([]);
  });

  it("returns an empty array when 'to' precedes 'from' (an inverted, unsatisfiable range)", () => {
    expect(filterAuditLogs(LOGS, { from: "2026-06-01", to: "2026-01-01" })).toEqual([]);
  });

  it("returns an empty array for an empty logs input regardless of filter", () => {
    expect(filterAuditLogs([], { entityType: "transaction" })).toEqual([]);
  });
});

describe("getDistinctEntityTypes", () => {
  it("dedupes and sorts entity types", () => {
    expect(getDistinctEntityTypes(LOGS)).toEqual(["account", "document", "transaction"]);
  });

  it("returns an empty array for no logs", () => {
    expect(getDistinctEntityTypes([])).toEqual([]);
  });

  it("dedupes when multiple logs share the same entity_type", () => {
    const duplicated = [LOGS[0], { ...LOGS[0], id: "log-1b", entity_id: "tx-2" }, LOGS[1]];
    expect(getDistinctEntityTypes(duplicated)).toEqual(["document", "transaction"]);
  });
});

describe("describeAuditAction", () => {
  it("maps known action codes to Japanese labels", () => {
    expect(describeAuditAction("transaction.confirm")).toBe("仕訳を確定");
  });

  it("falls back to the raw code for unknown actions", () => {
    expect(describeAuditAction("unknown.action")).toBe("unknown.action");
  });
});

describe("describeEntityType", () => {
  it("maps known entity types to Japanese labels", () => {
    expect(describeEntityType("transaction")).toBe("取引明細");
  });

  it("falls back to the raw value for unknown entity types", () => {
    expect(describeEntityType("widget")).toBe("widget");
  });
});

describe("extractChangeSummary", () => {
  it("extracts before/after when both are present", () => {
    expect(extractChangeSummary({ before: { a: 1 }, after: { a: 2 } })).toEqual({
      before: { a: 1 },
      after: { a: 2 },
    });
  });

  it("extracts before/after when only one is present", () => {
    expect(extractChangeSummary({ after: { a: 2 } })).toEqual({ before: undefined, after: { a: 2 } });
  });

  it("returns null when changes has no before/after keys", () => {
    expect(extractChangeSummary({ note: "x" })).toBeNull();
  });

  it("returns null for null, non-object, or array changes", () => {
    expect(extractChangeSummary(null)).toBeNull();
    expect(extractChangeSummary("string")).toBeNull();
    expect(extractChangeSummary([1, 2])).toBeNull();
  });
});
