import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantUser } from "./supabaseClient";
import { getMyTenantUser } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";
import { loadLedgerTransactionsForCurrentTenant } from "./ledgerTransactions";

vi.mock("./tenants", () => ({ getMyTenantUser: vi.fn() }));
vi.mock("./accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("./journalEntries", () => ({ listJournalEntries: vi.fn() }));

const tenantUser: TenantUser = {
  user_id: "user-1",
  tenant_id: "tenant-1",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};

describe("loadLedgerTransactionsForCurrentTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no logged-in tenant user (unconfigured/unauthenticated)", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    await expect(loadLedgerTransactionsForCurrentTenant()).resolves.toBeNull();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(listJournalEntries).not.toHaveBeenCalled();
  });

  it("returns null when the tenant has no journal entries yet", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listAccounts).mockResolvedValue([]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    await expect(loadLedgerTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("returns null (rather than throwing) when a fetch fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listAccounts).mockRejectedValue(new Error("boom"));
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    await expect(loadLedgerTransactionsForCurrentTenant()).resolves.toBeNull();
  });

  it("projects journal_entries + accounts via deriveCategorizedTransactions when data exists", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
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
      },
    ]);

    const result = await loadLedgerTransactionsForCurrentTenant();

    expect(result).toEqual([
      {
        id: "je-1",
        date: "2026-04-10",
        description: "クライアントA社 業務委託料",
        amount: 500000,
        account: "売上高",
        taxCategory: "課税売上10%",
        confidence: 1,
        source: "rule",
        personalDeductionOnly: false,
        excludeFromIncome: false,
      },
    ]);
  });
});
