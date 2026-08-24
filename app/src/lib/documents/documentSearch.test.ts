import { describe, expect, it } from "vitest";
import {
  DocumentWithTransaction,
  countUnlinkedDocuments,
  extractFileNameFromStoragePath,
  filterDocuments,
  isUnlinkedDocument,
  selectUnlinkedDocuments,
} from "./documentSearch";

function doc(overrides: Partial<DocumentWithTransaction> = {}): DocumentWithTransaction {
  return {
    id: "doc-1",
    tenant_id: "tenant-1",
    transaction_id: "tx-1",
    storage_path: "tenant-1/2026/receipt-001.jpg",
    uploaded_at: "2026-07-01T00:00:00Z",
    transaction: {
      date: "2026-07-01",
      description: "事務所家賃",
      amount: -150000,
      counterparty: null,
    },
    ...overrides,
  };
}

const rows: DocumentWithTransaction[] = [
  doc({
    id: "doc-rent",
    transaction_id: "tx-rent",
    storage_path: "tenant-1/2026/rent-receipt.jpg",
    uploaded_at: "2026-06-01T00:00:00Z",
    transaction: { date: "2026-06-01", description: "事務所家賃", amount: -150000, counterparty: null },
  }),
  doc({
    id: "doc-sales",
    transaction_id: "tx-sales",
    storage_path: "tenant-1/2026/invoice-a-corp.pdf",
    uploaded_at: "2026-06-15T00:00:00Z",
    transaction: { date: "2026-06-15", description: "コンサルティング売上", amount: 300000, counterparty: "A社案件" },
  }),
  doc({
    id: "doc-supplies",
    transaction_id: "tx-supplies",
    storage_path: "tenant-1/2026/amazon-receipt.jpg",
    uploaded_at: "2026-07-01T00:00:00Z",
    transaction: { date: "2026-07-01", description: "事務用品購入", amount: -3000, counterparty: "Amazon" },
  }),
  doc({
    id: "doc-unlinked",
    transaction_id: null,
    storage_path: "tenant-1/2026/scan-0042.jpg",
    uploaded_at: "2026-07-20T00:00:00Z",
    transaction: null,
  }),
];

describe("filterDocuments", () => {
  it("returns all rows (including unlinked ones) when no filters are given", () => {
    expect(filterDocuments(rows)).toEqual(rows);
    expect(filterDocuments(rows, {})).toEqual(rows);
  });

  it("filters by dateFrom inclusive, excluding unlinked documents", () => {
    const result = filterDocuments(rows, { dateFrom: "2026-06-15" });
    expect(result.map((r) => r.id)).toEqual(["doc-sales", "doc-supplies"]);
  });

  it("filters by dateTo inclusive, excluding unlinked documents", () => {
    const result = filterDocuments(rows, { dateTo: "2026-06-15" });
    expect(result.map((r) => r.id)).toEqual(["doc-rent", "doc-sales"]);
  });

  it("excludes rows just outside the date range boundary", () => {
    const result = filterDocuments(rows, { dateFrom: "2026-06-16", dateTo: "2026-06-30" });
    expect(result).toEqual([]);
  });

  it("filters by a combined date range", () => {
    const result = filterDocuments(rows, { dateFrom: "2026-06-15", dateTo: "2026-07-01" });
    expect(result.map((r) => r.id)).toEqual(["doc-sales", "doc-supplies"]);
  });

  it("filters by minAmount inclusive, excluding unlinked documents", () => {
    const result = filterDocuments(rows, { minAmount: -3000 });
    expect(result.map((r) => r.id)).toEqual(["doc-sales", "doc-supplies"]);
  });

  it("filters by maxAmount inclusive, excluding unlinked documents", () => {
    const result = filterDocuments(rows, { maxAmount: -3000 });
    expect(result.map((r) => r.id)).toEqual(["doc-rent", "doc-supplies"]);
  });

  it("filters by an amount range with no matches", () => {
    const result = filterDocuments(rows, { minAmount: 1000, maxAmount: 2000 });
    expect(result).toEqual([]);
  });

  it("matches keyword case-insensitively against the transaction description", () => {
    const result = filterDocuments(rows, { keyword: "コンサルティング" });
    expect(result.map((r) => r.id)).toEqual(["doc-sales"]);
  });

  it("matches keyword case-insensitively against the counterparty", () => {
    const result = filterDocuments(rows, { keyword: "amazon" });
    expect(result.map((r) => r.id)).toEqual(["doc-supplies"]);

    const upper = filterDocuments(rows, { keyword: "AMAZON" });
    expect(upper.map((r) => r.id)).toEqual(["doc-supplies"]);
  });

  it("treats a blank/whitespace-only keyword as no filter", () => {
    expect(filterDocuments(rows, { keyword: "   " })).toEqual(rows);
  });

  it("returns an empty array when the keyword matches nothing", () => {
    const result = filterDocuments(rows, { keyword: "存在しない取引先" });
    expect(result).toEqual([]);
  });

  it("excludes an unlinked document whenever a keyword filter is specified", () => {
    const result = filterDocuments(rows, { keyword: "scan" });
    expect(result).toEqual([]);
  });

  it("combines date, amount, and keyword filters together", () => {
    const result = filterDocuments(rows, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      minAmount: -10000,
      maxAmount: -1000,
      keyword: "購入",
    });
    expect(result.map((r) => r.id)).toEqual(["doc-supplies"]);
  });

  it("returns an empty array for an empty input list regardless of filters", () => {
    expect(filterDocuments([])).toEqual([]);
    expect(filterDocuments([], { keyword: "家賃" })).toEqual([]);
  });

  it("returns an empty array when minAmount exceeds maxAmount (an inverted, unsatisfiable range)", () => {
    const result = filterDocuments(rows, { minAmount: 0, maxAmount: -100000 });
    expect(result).toEqual([]);
  });

  it("treats a document whose transaction_id is set but whose transaction failed to join as unlinked for filtering", () => {
    const orphan = doc({ id: "doc-orphan", transaction_id: "tx-missing", transaction: null });
    const result = filterDocuments([orphan], { keyword: "何か" });
    expect(result).toEqual([]);
    expect(filterDocuments([orphan])).toEqual([orphan]);
  });
});

describe("isUnlinkedDocument / selectUnlinkedDocuments / countUnlinkedDocuments", () => {
  it("flags a document with a null transaction_id as unlinked", () => {
    expect(isUnlinkedDocument(rows[3])).toBe(true);
  });

  it("does not flag a document with a linked transaction as unlinked", () => {
    expect(isUnlinkedDocument(rows[0])).toBe(false);
  });

  it("flags a document whose transaction_id is set but whose transaction is null (failed join) as unlinked", () => {
    const orphan = doc({ id: "doc-orphan", transaction_id: "tx-missing", transaction: null });
    expect(isUnlinkedDocument(orphan)).toBe(true);
  });

  it("selects only the unlinked documents, preserving order", () => {
    const result = selectUnlinkedDocuments(rows);
    expect(result.map((r) => r.id)).toEqual(["doc-unlinked"]);
  });

  it("returns an empty array when every document is linked", () => {
    const linkedOnly = rows.filter((r) => !isUnlinkedDocument(r));
    expect(selectUnlinkedDocuments(linkedOnly)).toEqual([]);
  });

  it("counts unlinked documents", () => {
    expect(countUnlinkedDocuments(rows)).toBe(1);
    expect(countUnlinkedDocuments([])).toBe(0);
  });
});

describe("extractFileNameFromStoragePath", () => {
  it("returns the last path segment", () => {
    expect(extractFileNameFromStoragePath("tenant-1/2026/receipt-001.jpg")).toBe("receipt-001.jpg");
  });

  it("returns the input unchanged when there is no separator", () => {
    expect(extractFileNameFromStoragePath("receipt-001.jpg")).toBe("receipt-001.jpg");
  });

  it("ignores a trailing slash", () => {
    expect(extractFileNameFromStoragePath("tenant-1/2026/receipt-001.jpg/")).toBe("receipt-001.jpg");
  });

  it("falls back to a placeholder for an empty or slash-only path", () => {
    expect(extractFileNameFromStoragePath("")).toBe("(ファイル名不明)");
    expect(extractFileNameFromStoragePath("///")).toBe("(ファイル名不明)");
  });
});
