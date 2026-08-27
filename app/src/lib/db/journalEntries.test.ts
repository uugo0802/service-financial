import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, JournalEntryRow } from "./supabaseClient";
import { createJournalEntries, listJournalEntries } from "./journalEntries";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleEntry: JournalEntryRow = {
  id: "je-1",
  tenant_id: "tenant-1",
  entry_group_id: "je-1",
  date: "2026-04-10",
  debit_account_id: "acc-cash",
  credit_account_id: "acc-sales",
  amount: 500000,
  description: "クライアントA社 業務委託料",
  tax_category: "課税売上10%",
  confidence: 1,
  source: "rule",
  personal_deduction_only: false,
  exclude_from_income: false,
  created_at: "2026-04-10T00:00:00Z",
};

describe("listJournalEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by tenant and orders by date ascending", async () => {
    const builder = createBuilder({ data: [sampleEntry], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listJournalEntries("tenant-1");

    expect(result).toEqual([sampleEntry]);
    expect(from).toHaveBeenCalledWith("journal_entries");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("date", { ascending: true });
  });

  it("returns an empty array when no rows are found (data is null)", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listJournalEntries("tenant-1")).resolves.toEqual([]);
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listJournalEntries("tenant-1")).rejects.toThrow(/仕訳の取得に失敗しました/);
  });
});

describe("createJournalEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing and returns an empty array when given no inputs", async () => {
    const from = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createJournalEntries("tenant-1", []);

    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts rows scoped to the tenant with defaults applied", async () => {
    const builder = createBuilder({ data: [sampleEntry], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createJournalEntries("tenant-1", [
      {
        date: "2026-12-31",
        debit_account_id: "acc-deprexp",
        credit_account_id: "acc-fixed",
        amount: 120_000,
        tax_category: "対象外",
        source: "generated",
      },
    ]);

    expect(result).toEqual([sampleEntry]);
    expect(from).toHaveBeenCalledWith("journal_entries");
    expect(builder.insert).toHaveBeenCalledWith([
      {
        tenant_id: "tenant-1",
        date: "2026-12-31",
        debit_account_id: "acc-deprexp",
        credit_account_id: "acc-fixed",
        amount: 120_000,
        description: null,
        tax_category: "対象外",
        confidence: 1.0,
        source: "generated",
        personal_deduction_only: false,
        exclude_from_income: false,
      },
    ]);
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createJournalEntries("tenant-1", [
        {
          date: "2026-12-31",
          debit_account_id: "a",
          credit_account_id: "b",
          amount: 1,
          tax_category: "対象外",
          source: "generated",
        },
      ])
    ).rejects.toThrow(/仕訳の作成に失敗しました/);
  });
});
