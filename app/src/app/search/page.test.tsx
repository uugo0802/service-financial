/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPage from "./page";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";
import { Counterparty } from "@/lib/clients/clientMaster";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";

// getMyTenantUser・各lib/db/*.tsを直接モックし、テナント未解決（サンプルのまま）／
// 実データ取得済みの2状態を決定的に検証する（rule-backfill/page.test.tsxと同じ方針）。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));

const mockListCounterparties = vi.fn();
vi.mock("@/lib/db/clients", () => ({
  listCounterparties: (tenantId: string) => mockListCounterparties(tenantId),
}));

const mockListInvoices = vi.fn();
vi.mock("@/lib/db/invoices", () => ({
  listInvoices: (tenantId: string) => mockListInvoices(tenantId),
}));

const mockLoadTransactions = vi.fn();
vi.mock("@/lib/db/transactions", () => ({
  loadTransactionsForCurrentTenant: () => mockLoadTransactions(),
}));

const mockLoadDocuments = vi.fn();
vi.mock("@/lib/db/documentsWithTransactions", () => ({
  loadDocumentsWithTransactionsForCurrentTenant: () => mockLoadDocuments(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REAL_TRANSACTION: TransactionRow = {
  id: "je-real-tx",
  tenant_id: "tenant-1",
  date: "2026-07-01",
  description: "実データ限定の取引摘要",
  amount: -12345,
  account_id: null,
  tax_category: "課税仕入10%",
  confidence: 1,
  source: "rule",
  note: null,
  personal_deduction_only: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const REAL_DOCUMENT: DocumentWithTransaction = {
  id: "doc-real-1",
  tenant_id: "tenant-1",
  transaction_id: "je-real-tx",
  storage_path: "receipts/real-only.pdf",
  uploaded_at: "2026-07-01T00:00:00.000Z",
  transaction: {
    date: "2026-07-01",
    description: "実データ限定の証憑取引摘要",
    amount: -3000,
    counterparty: null,
  },
};

const REAL_CLIENT: Counterparty = {
  id: "client-real-1",
  name: "実データ限定の取引先",
  kind: "client",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const REAL_INVOICE: ReceivableInvoiceInput = {
  invoiceNumber: "REAL-0001",
  clientName: "実データ限定の請求書取引先",
  issueDate: "2026-07-01",
  grandTotal: 50000,
};

function search(term: string) {
  fireEvent.change(screen.getByLabelText("キーワード"), { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "検索" }));
}

describe("SearchPage", () => {
  it("テナント未解決の間はサンプルデータのみを検索対象にする", () => {
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<SearchPage />);

    search("実データ限定");

    expect(screen.queryByText("実データ限定の取引摘要")).toBeNull();
  });

  it("テナント解決後は取引・証憑・取引先・請求書のいずれも実データに差し替わる", async () => {
    mockGetMyTenantUser.mockResolvedValue({ user_id: "u1", tenant_id: "tenant-1", role: "owner", created_at: "" });
    mockLoadTransactions.mockResolvedValue([REAL_TRANSACTION]);
    mockLoadDocuments.mockResolvedValue([REAL_DOCUMENT]);
    mockListCounterparties.mockResolvedValue([REAL_CLIENT]);
    mockListInvoices.mockResolvedValue([REAL_INVOICE]);

    render(<SearchPage />);

    await waitFor(() => expect(mockLoadTransactions).toHaveBeenCalled());

    search("実データ限定");

    expect(screen.getByText("実データ限定の取引摘要")).toBeTruthy();
    expect(screen.getByText("実データ限定の証憑取引摘要")).toBeTruthy();
    expect(screen.getByText("実データ限定の取引先")).toBeTruthy();
    expect(screen.getByText("実データ限定の請求書取引先")).toBeTruthy();
  });
});
