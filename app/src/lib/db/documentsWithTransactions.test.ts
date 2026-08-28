import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantUser } from "./supabaseClient";
import { getMyTenantUser } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";
import { listDocuments } from "./documents";
import { loadDocumentsWithTransactionsForCurrentTenant } from "./documentsWithTransactions";

vi.mock("./tenants", () => ({ getMyTenantUser: vi.fn() }));
vi.mock("./accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("./journalEntries", () => ({ listJournalEntries: vi.fn() }));
vi.mock("./documents", () => ({ listDocuments: vi.fn() }));

const tenantUser: TenantUser = {
  user_id: "user-1",
  tenant_id: "tenant-1",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};

describe("loadDocumentsWithTransactionsForCurrentTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no logged-in tenant user (unconfigured/unauthenticated)", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    await expect(loadDocumentsWithTransactionsForCurrentTenant()).resolves.toBeNull();
    expect(listDocuments).not.toHaveBeenCalled();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(listJournalEntries).not.toHaveBeenCalled();
  });

  it("returns null when the tenant has no documents yet", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(listAccounts).mockResolvedValue([]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    await expect(loadDocumentsWithTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("returns null (rather than throwing) when a fetch fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listDocuments).mockRejectedValue(new Error("boom"));
    vi.mocked(listAccounts).mockResolvedValue([]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    await expect(loadDocumentsWithTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("joins a linked document to its journal entry, deriving sign from the account type (revenue = plus)", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listDocuments).mockResolvedValue([
      {
        id: "doc-1",
        tenant_id: "tenant-1",
        transaction_id: "je-1",
        storage_path: "tenant-1/receipts/invoice-a.pdf",
        uploaded_at: "2026-06-16T10:30:00Z",
      },
    ]);
    vi.mocked(listAccounts).mockResolvedValue([
      {
        id: "acc-cash",
        tenant_id: "tenant-1",
        code: null,
        name: "現金及び預金",
        account_type: "asset",
        tax_category: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "acc-sales",
        tenant_id: "tenant-1",
        code: null,
        name: "売上高",
        account_type: "revenue",
        tax_category: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      {
        id: "je-1",
        tenant_id: "tenant-1",
        entry_group_id: "je-1",
        date: "2026-06-15",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-sales",
        amount: 300000,
        description: "コンサルティング売上",
        tax_category: "課税売上10%",
        confidence: 1,
        source: "rule",
        personal_deduction_only: false,
        exclude_from_income: false,
        created_at: "2026-06-15T00:00:00Z",
      },
    ]);

    const result = await loadDocumentsWithTransactionsForCurrentTenant();

    expect(result).toEqual([
      {
        id: "doc-1",
        tenant_id: "tenant-1",
        transaction_id: "je-1",
        storage_path: "tenant-1/receipts/invoice-a.pdf",
        uploaded_at: "2026-06-16T10:30:00Z",
        transaction: {
          date: "2026-06-15",
          description: "コンサルティング売上",
          amount: 300000,
          counterparty: null,
        },
      },
    ]);
  });

  it("negates the amount when the debit account is an expense", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listDocuments).mockResolvedValue([
      {
        id: "doc-2",
        tenant_id: "tenant-1",
        transaction_id: "je-2",
        storage_path: "tenant-1/receipts/rent.jpg",
        uploaded_at: "2026-06-02T09:15:00Z",
      },
    ]);
    vi.mocked(listAccounts).mockResolvedValue([
      {
        id: "acc-cash",
        tenant_id: "tenant-1",
        code: null,
        name: "現金及び預金",
        account_type: "asset",
        tax_category: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "acc-rent",
        tenant_id: "tenant-1",
        code: null,
        name: "地代家賃",
        account_type: "expense",
        tax_category: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      {
        id: "je-2",
        tenant_id: "tenant-1",
        entry_group_id: "je-2",
        date: "2026-06-01",
        debit_account_id: "acc-rent",
        credit_account_id: "acc-cash",
        amount: 150000,
        description: "事務所家賃",
        tax_category: "課税仕入10%",
        confidence: 1,
        source: "rule",
        personal_deduction_only: false,
        exclude_from_income: false,
        created_at: "2026-06-01T00:00:00Z",
      },
    ]);

    const result = await loadDocumentsWithTransactionsForCurrentTenant();

    expect(result).toEqual([
      expect.objectContaining({
        id: "doc-2",
        transaction: expect.objectContaining({ amount: -150000 }),
      }),
    ]);
  });

  it("leaves transaction null for a document without a linked entry, or whose linked entry can't be found", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listDocuments).mockResolvedValue([
      {
        id: "doc-unlinked",
        tenant_id: "tenant-1",
        transaction_id: null,
        storage_path: "tenant-1/scan-0042.jpg",
        uploaded_at: "2026-07-22T08:03:00Z",
      },
      {
        id: "doc-dangling",
        tenant_id: "tenant-1",
        transaction_id: "je-missing",
        storage_path: "tenant-1/scan-0099.jpg",
        uploaded_at: "2026-07-23T08:03:00Z",
      },
    ]);
    vi.mocked(listAccounts).mockResolvedValue([]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    const result = await loadDocumentsWithTransactionsForCurrentTenant();

    expect(result).toEqual([
      expect.objectContaining({ id: "doc-unlinked", transaction: null }),
      expect.objectContaining({ id: "doc-dangling", transaction: null }),
    ]);
  });
});
