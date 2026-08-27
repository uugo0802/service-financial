import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRow, CompanyOpeningBalanceRow, FixedAssetRow, JournalEntryRow, LoanRow, Tenant, TenantUser } from "./supabaseClient";
import { getMyTenantUser, getTenant } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";
import { listFixedAssets } from "./fixedAssets";
import { listLoans } from "./loans";
import { getCompanyOpeningBalance } from "./openingBalances";
import { ensureGeneratedEntries } from "./generatedEntries";
import { loadBalanceSheetDataForCurrentTenant } from "./balanceSheetData";

vi.mock("./tenants", () => ({ getMyTenantUser: vi.fn(), getTenant: vi.fn() }));
vi.mock("./accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("./journalEntries", () => ({ listJournalEntries: vi.fn() }));
vi.mock("./fixedAssets", async () => {
  const actual = await vi.importActual<typeof import("./fixedAssets")>("./fixedAssets");
  return { ...actual, listFixedAssets: vi.fn() };
});
vi.mock("./loans", async () => {
  const actual = await vi.importActual<typeof import("./loans")>("./loans");
  return { ...actual, listLoans: vi.fn() };
});
vi.mock("./openingBalances", () => ({ getCompanyOpeningBalance: vi.fn() }));
vi.mock("./generatedEntries", () => ({ ensureGeneratedEntries: vi.fn() }));

const tenantUser: TenantUser = { user_id: "user-1", tenant_id: "tenant-1", role: "owner", created_at: "2026-01-01T00:00:00Z" };
const tenant: Tenant = { id: "tenant-1", entity_type: "corp", display_name: "テスト合同会社", created_at: "2026-01-01T00:00:00Z", capital_amount: 1_000_000 };
const openingBalance: CompanyOpeningBalanceRow = {
  tenant_id: "tenant-1",
  as_of_date: "2025-12-31",
  cash_balance: 2_000_000,
  retained_earnings: 500_000,
  created_at: "2026-01-01T00:00:00Z",
};

const cashAccount: AccountRow = {
  id: "acc-cash",
  tenant_id: "tenant-1",
  code: null,
  name: "現金及び預金",
  account_type: "asset",
  tax_category: null,
  created_at: "2026-01-01T00:00:00Z",
};
const fixedAccount: AccountRow = {
  id: "acc-fixed",
  tenant_id: "tenant-1",
  code: null,
  name: "什器備品",
  account_type: "asset",
  tax_category: null,
  created_at: "2026-01-01T00:00:00Z",
};
const revenueAccount: AccountRow = {
  id: "acc-revenue",
  tenant_id: "tenant-1",
  code: null,
  name: "売上高",
  account_type: "revenue",
  tax_category: null,
  created_at: "2026-01-01T00:00:00Z",
};

const fixedAssetRow: FixedAssetRow = {
  id: "asset-1",
  tenant_id: "tenant-1",
  name: "什器備品",
  acquisition_date: "2025-06-01",
  acquisition_cost: 600_000,
  useful_life_years: 5,
  immediate_expensing: false,
  method: "straight-line",
  asset_account_id: "acc-fixed",
  depreciation_expense_account_id: "acc-fixed",
  disposed_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const loanRow: LoanRow = {
  id: "loan-1",
  tenant_id: "tenant-1",
  name: "運転資金",
  principal_amount: 1_200_000,
  interest_rate: 0.06,
  start_date: "2025-01-15",
  term_months: 24,
  repayment_type: "equal-principal",
  liability_account_id: "acc-loan",
  interest_expense_account_id: "acc-interest",
  created_at: "2026-01-01T00:00:00Z",
};

function journalEntry(overrides: Partial<JournalEntryRow>): JournalEntryRow {
  return {
    id: "je-1",
    tenant_id: "tenant-1",
    entry_group_id: "je-1",
    date: "2026-06-01",
    debit_account_id: "acc-cash",
    credit_account_id: "acc-revenue",
    amount: 500_000,
    description: null,
    tax_category: "課税売上10%",
    confidence: 1,
    source: "rule",
    personal_deduction_only: false,
    exclude_from_income: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const fiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

describe("loadBalanceSheetDataForCurrentTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureGeneratedEntries).mockResolvedValue({
      depreciation: { createdCount: 0, skippedCount: 0 },
      loanRepayment: { createdCount: 0, skippedCount: 0 },
    });
  });

  it("returns null when there is no logged-in tenant user", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    await expect(loadBalanceSheetDataForCurrentTenant(fiscalPeriod)).resolves.toBeNull();
    expect(getTenant).not.toHaveBeenCalled();
  });

  it("returns null when company_opening_balances has not been entered yet (stage 4 form unused)", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(tenant);
    vi.mocked(getCompanyOpeningBalance).mockResolvedValue(null);
    vi.mocked(listAccounts).mockResolvedValue([cashAccount, fixedAccount, revenueAccount]);
    vi.mocked(listFixedAssets).mockResolvedValue([fixedAssetRow]);
    vi.mocked(listLoans).mockResolvedValue([loanRow]);

    await expect(loadBalanceSheetDataForCurrentTenant(fiscalPeriod)).resolves.toBeNull();
  });

  it("returns null when no cash-like account can be resolved", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(tenant);
    vi.mocked(getCompanyOpeningBalance).mockResolvedValue(openingBalance);
    vi.mocked(listAccounts).mockResolvedValue([fixedAccount, revenueAccount]); // 現金相当の資産科目なし
    vi.mocked(listFixedAssets).mockResolvedValue([fixedAssetRow]);
    vi.mocked(listLoans).mockResolvedValue([]);

    await expect(loadBalanceSheetDataForCurrentTenant(fiscalPeriod)).resolves.toBeNull();
  });

  it("returns null (rather than throwing) when a fetch fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockRejectedValue(new Error("boom"));

    await expect(loadBalanceSheetDataForCurrentTenant(fiscalPeriod)).resolves.toBeNull();
  });

  it("runs the generation batch before reading entries, then assembles ledger-derived balance sheet data", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(getTenant).mockResolvedValue(tenant);
    vi.mocked(getCompanyOpeningBalance).mockResolvedValue(openingBalance);
    vi.mocked(listAccounts).mockResolvedValue([cashAccount, fixedAccount, revenueAccount]);
    vi.mocked(listFixedAssets).mockResolvedValue([fixedAssetRow]);
    vi.mocked(listLoans).mockResolvedValue([loanRow]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      journalEntry({ date: "2026-06-01", debit_account_id: "acc-cash", credit_account_id: "acc-revenue", amount: 3_000_000 }),
      // 固定資産科目自体はcashAccountIdsから除外されるため、現金の増減としては数えない
      journalEntry({ date: "2026-07-01", debit_account_id: "acc-fixed", credit_account_id: "acc-cash", amount: 100_000 }),
    ]);

    const result = await loadBalanceSheetDataForCurrentTenant(fiscalPeriod);

    expect(ensureGeneratedEntries).toHaveBeenCalledWith("tenant-1", fiscalPeriod, { cashAccountId: "acc-cash" });
    expect(result).not.toBeNull();
    expect(result?.capitalStock).toBe(1_000_000);
    expect(result?.openingCash).toBe(2_000_000);
    expect(result?.openingRetainedEarnings).toBe(500_000);
    expect(result?.cashInflow).toBe(3_000_000);
    expect(result?.cashOutflow).toBe(100_000);
    expect(result?.fixedAssets).toHaveLength(1);
    expect(result?.fixedAssets[0].acquisitionCost).toBe(600_000);
    expect(result?.loans).toHaveLength(1);
    expect(result?.loans[0].principalAmount).toBe(1_200_000);
  });
});
