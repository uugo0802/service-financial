import { describe, expect, it } from "vitest";
import { TransactionRow } from "../db/supabaseClient";
import { Counterparty } from "../clients/clientMaster";
import { DocumentWithTransaction } from "../documents/documentSearch";
import { globalSearch, groupSearchResultsByKind } from "./globalSearch";

function transaction(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "tx-1",
    tenant_id: "tenant-1",
    date: "2026-06-01",
    description: "事務所家賃",
    amount: -150000,
    account_id: null,
    tax_category: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: null,
    personal_deduction_only: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function document(overrides: Partial<DocumentWithTransaction>): DocumentWithTransaction {
  return {
    id: "doc-1",
    tenant_id: "tenant-1",
    transaction_id: "tx-1",
    storage_path: "tenant-1/2026/06/rent-receipt.jpg",
    uploaded_at: "2026-06-02T09:15:00Z",
    transaction: {
      date: "2026-06-01",
      description: "事務所家賃",
      amount: -150000,
      counterparty: "〇〇不動産",
    },
    ...overrides,
  };
}

function client(overrides: Partial<Counterparty>): Counterparty {
  return {
    id: "cp-1",
    name: "〇〇不動産",
    kind: "vendor",
    defaultAccountName: "地代家賃",
    invoiceRegistrationNumber: undefined,
    notes: undefined,
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

const transactions: TransactionRow[] = [
  transaction({ id: "tx-rent", date: "2026-06-01", description: "事務所家賃", note: "〇〇不動産" }),
  transaction({
    id: "tx-sales",
    date: "2026-06-15",
    description: "コンサルティング売上",
    amount: 300000,
    note: "A社案件",
  }),
];

const documents: DocumentWithTransaction[] = [
  document({ id: "doc-rent" }),
  document({
    id: "doc-unlinked",
    transaction_id: null,
    storage_path: "tenant-1/2026/07/scan-0042-fudousan.jpg",
    transaction: null,
  }),
];

const clients: Counterparty[] = [
  client({ id: "cp-fudousan", name: "〇〇不動産" }),
  client({ id: "cp-a-corp", name: "A社", kind: "client", notes: "A社案件の取引先" }),
];

describe("globalSearch", () => {
  it("returns an empty array for an empty query", () => {
    expect(globalSearch("", { transactions, documents, clients })).toEqual([]);
  });

  it("returns an empty array for a whitespace-only query", () => {
    expect(globalSearch("   ", { transactions, documents, clients })).toEqual([]);
  });

  it("returns an empty array when no sources are given", () => {
    expect(globalSearch("不動産")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(globalSearch("存在しないキーワード", { transactions, documents, clients })).toEqual([]);
  });

  it("finds matches across transactions, documents, and clients for the same keyword", () => {
    const results = globalSearch("不動産", { transactions, documents, clients });

    const kinds = results.map((r) => r.kind);
    expect(kinds).toContain("transaction");
    expect(kinds).toContain("document");
    expect(kinds).toContain("client");

    expect(results.map((r) => r.id)).toEqual(["tx-rent", "doc-rent", "cp-fudousan"]);
  });

  it("matches a keyword that only exists on one kind", () => {
    const results = globalSearch("コンサルティング", { transactions, documents, clients });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "transaction", id: "tx-sales" });
  });

  it("is case-insensitive, matching the same convention as the underlying search utilities", () => {
    const results = globalSearch("A社", { transactions, documents, clients });
    expect(results.map((r) => r.id).sort()).toEqual(["cp-a-corp", "tx-sales"].sort());
  });

  it("excludes documents that have no linked transaction, since they cannot be keyword-matched", () => {
    const results = globalSearch("fudousan", { transactions, documents, clients });
    // "doc-unlinked"'s file name contains "fudousan" but it has no linked transaction,
    // so documentSearch's keyword matching (which this module reuses as-is) cannot match it.
    expect(results.find((r) => r.id === "doc-unlinked")).toBeUndefined();
    expect(results).toEqual([]);
  });

  it("orders results grouped by kind: transactions, then documents, then clients", () => {
    const results = globalSearch("不動産", { transactions, documents, clients });
    const kindOrder = results.map((r) => r.kind);
    expect(kindOrder).toEqual(["transaction", "document", "client"]);
  });

  it("builds a transaction result with the fields the UI needs", () => {
    const results = globalSearch("事務所家賃", { transactions, documents, clients });
    const transactionResult = results.find((r) => r.kind === "transaction");
    expect(transactionResult).toMatchObject({
      kind: "transaction",
      id: "tx-rent",
      title: "事務所家賃",
      subtitle: "〇〇不動産",
      amount: -150000,
      href: "/transactions",
    });
  });

  it("builds a document result using the linked transaction's fields", () => {
    const results = globalSearch("事務所家賃", { transactions, documents, clients });
    const documentResult = results.find((r) => r.kind === "document");
    expect(documentResult).toMatchObject({
      kind: "document",
      id: "doc-rent",
      title: "事務所家賃",
      subtitle: "〇〇不動産",
      fileName: "rent-receipt.jpg",
      amount: -150000,
      href: "/documents",
    });
  });

  it("builds a client result including the counterparty kind label", () => {
    const results = globalSearch("A社", { transactions, documents, clients });
    const clientResult = results.find((r) => r.kind === "client");
    expect(clientResult).toMatchObject({
      kind: "client",
      id: "cp-a-corp",
      title: "A社",
      counterpartyKind: "client",
      href: "/clients",
    });
    expect((clientResult as { subtitle?: string }).subtitle).toContain("売上先");
  });

  it("treats missing source arrays as empty for each kind independently", () => {
    expect(globalSearch("不動産", { transactions })).toEqual([
      expect.objectContaining({ kind: "transaction", id: "tx-rent" }),
    ]);
    expect(globalSearch("不動産", { documents })).toEqual([
      expect.objectContaining({ kind: "document", id: "doc-rent" }),
    ]);
    expect(globalSearch("不動産", { clients })).toEqual([
      expect.objectContaining({ kind: "client", id: "cp-fudousan" }),
    ]);
  });
});

describe("groupSearchResultsByKind", () => {
  it("returns empty groups for an empty result list", () => {
    expect(groupSearchResultsByKind([])).toEqual({ transaction: [], document: [], client: [] });
  });

  it("splits a mixed result list into its kind-specific groups, preserving order", () => {
    const results = globalSearch("不動産", { transactions, documents, clients });
    const grouped = groupSearchResultsByKind(results);

    expect(grouped.transaction.map((r) => r.id)).toEqual(["tx-rent"]);
    expect(grouped.document.map((r) => r.id)).toEqual(["doc-rent"]);
    expect(grouped.client.map((r) => r.id)).toEqual(["cp-fudousan"]);
  });
});
