import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRow } from "./supabaseClient";
import { filterTransactions, searchTransactions } from "./transactionSearch";

vi.mock("./transactions", () => ({
  listTransactions: vi.fn(),
}));

import { listTransactions } from "./transactions";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
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
    ...overrides,
  };
}

const rows: TransactionRow[] = [
  row({ id: "tx-rent", date: "2026-06-01", description: "事務所家賃", amount: -150000, note: null }),
  row({ id: "tx-sales", date: "2026-06-15", description: "コンサルティング売上", amount: 300000, note: "A社案件" }),
  row({ id: "tx-supplies", date: "2026-07-01", description: "事務用品購入", amount: -3000, note: "Amazon" }),
  row({ id: "tx-donation", date: "2026-07-20", description: "寄付", amount: -10000, note: null }),
];

describe("filterTransactions", () => {
  it("returns all rows when no filters are given", () => {
    expect(filterTransactions(rows)).toEqual(rows);
    expect(filterTransactions(rows, {})).toEqual(rows);
  });

  it("filters by dateFrom inclusive", () => {
    const result = filterTransactions(rows, { dateFrom: "2026-06-15" });
    expect(result.map((r) => r.id)).toEqual(["tx-sales", "tx-supplies", "tx-donation"]);
  });

  it("filters by dateTo inclusive", () => {
    const result = filterTransactions(rows, { dateTo: "2026-06-15" });
    expect(result.map((r) => r.id)).toEqual(["tx-rent", "tx-sales"]);
  });

  it("excludes rows just outside the date range boundary", () => {
    const result = filterTransactions(rows, { dateFrom: "2026-06-16", dateTo: "2026-06-30" });
    expect(result).toEqual([]);
  });

  it("filters by a combined date range", () => {
    const result = filterTransactions(rows, { dateFrom: "2026-06-15", dateTo: "2026-07-01" });
    expect(result.map((r) => r.id)).toEqual(["tx-sales", "tx-supplies"]);
  });

  it("filters by minAmount inclusive", () => {
    const result = filterTransactions(rows, { minAmount: -3000 });
    expect(result.map((r) => r.id)).toEqual(["tx-sales", "tx-supplies"]);
  });

  it("filters by maxAmount inclusive", () => {
    const result = filterTransactions(rows, { maxAmount: -3000 });
    expect(result.map((r) => r.id)).toEqual(["tx-rent", "tx-supplies", "tx-donation"]);
  });

  it("filters by an amount range with no matches", () => {
    const result = filterTransactions(rows, { minAmount: 1000, maxAmount: 2000 });
    expect(result).toEqual([]);
  });

  it("matches keyword case-insensitively against the description", () => {
    const result = filterTransactions(rows, { keyword: "コンサルティング" });
    expect(result.map((r) => r.id)).toEqual(["tx-sales"]);
  });

  it("matches keyword case-insensitively against the note (counterparty)", () => {
    const result = filterTransactions(rows, { keyword: "amazon" });
    expect(result.map((r) => r.id)).toEqual(["tx-supplies"]);

    const upper = filterTransactions(rows, { keyword: "AMAZON" });
    expect(upper.map((r) => r.id)).toEqual(["tx-supplies"]);
  });

  it("treats a blank/whitespace-only keyword as no filter", () => {
    expect(filterTransactions(rows, { keyword: "   " })).toEqual(rows);
  });

  it("returns an empty array when the keyword matches nothing", () => {
    const result = filterTransactions(rows, { keyword: "存在しない取引先" });
    expect(result).toEqual([]);
  });

  it("combines date, amount, and keyword filters together", () => {
    const result = filterTransactions(rows, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      minAmount: -10000,
      maxAmount: -1000,
      keyword: "購入",
    });
    expect(result.map((r) => r.id)).toEqual(["tx-supplies"]);
  });

  it("returns an empty array for an empty input list regardless of filters", () => {
    expect(filterTransactions([])).toEqual([]);
    expect(filterTransactions([], { keyword: "家賃" })).toEqual([]);
  });

  it("returns an empty array when minAmount exceeds maxAmount (an inverted, unsatisfiable range)", () => {
    const result = filterTransactions(rows, { minAmount: 0, maxAmount: -100000 });
    expect(result).toEqual([]);
  });

  it("does not spuriously match the literal word 'null' when a row's note is null", () => {
    const result = filterTransactions(rows, { keyword: "null" });
    expect(result).toEqual([]);
  });

  it("matches a keyword that spans the description/note join boundary only if it's contiguous", () => {
    // "事務所家賃" description with a null note becomes "事務所家賃 " (trailing space, no note text) —
    // a keyword requiring text after the space must not match.
    const result = filterTransactions(rows, { keyword: "家賃 something" });
    expect(result).toEqual([]);
  });
});

describe("searchTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the tenant's transactions and applies the filters", async () => {
    vi.mocked(listTransactions).mockResolvedValue(rows);

    const result = await searchTransactions("tenant-1", { keyword: "家賃" });

    expect(listTransactions).toHaveBeenCalledWith("tenant-1");
    expect(result.map((r) => r.id)).toEqual(["tx-rent"]);
  });

  it("returns an empty array when the tenant has no matching transactions", async () => {
    vi.mocked(listTransactions).mockResolvedValue([]);

    const result = await searchTransactions("tenant-1", { keyword: "何か" });

    expect(result).toEqual([]);
  });
});
