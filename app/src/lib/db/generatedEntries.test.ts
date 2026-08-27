import { beforeEach, describe, expect, it, vi } from "vitest";
import { FixedAssetRow, JournalEntryRow, LoanRow } from "./supabaseClient";
import { listFixedAssets } from "./fixedAssets";
import { listLoans } from "./loans";
import { createJournalEntries, listJournalEntries } from "./journalEntries";
import { ensureDepreciationEntriesGenerated, ensureLoanRepaymentEntriesGenerated, ensureGeneratedEntries } from "./generatedEntries";

vi.mock("./fixedAssets", async () => {
  const actual = await vi.importActual<typeof import("./fixedAssets")>("./fixedAssets");
  return { ...actual, listFixedAssets: vi.fn() };
});
vi.mock("./loans", async () => {
  const actual = await vi.importActual<typeof import("./loans")>("./loans");
  return { ...actual, listLoans: vi.fn() };
});
vi.mock("./journalEntries", () => ({
  listJournalEntries: vi.fn(),
  createJournalEntries: vi.fn(),
}));

const fiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

const asset: FixedAssetRow = {
  id: "asset-1",
  tenant_id: "tenant-1",
  name: "什器備品",
  acquisition_date: "2025-06-01",
  acquisition_cost: 600_000,
  useful_life_years: 5,
  immediate_expensing: false,
  method: "straight-line",
  asset_account_id: "acc-fixed",
  depreciation_expense_account_id: "acc-deprexp",
  disposed_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const loan: LoanRow = {
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

function generatedEntry(overrides: Partial<JournalEntryRow>): JournalEntryRow {
  return {
    id: `je-${Math.random()}`,
    tenant_id: "tenant-1",
    entry_group_id: `je-${Math.random()}`,
    date: "2026-12-31",
    debit_account_id: "acc-deprexp",
    credit_account_id: "acc-fixed",
    amount: 120_000,
    description: null,
    tax_category: "対象外",
    confidence: 1,
    source: "generated",
    personal_deduction_only: false,
    exclude_from_income: false,
    created_at: "2026-12-31T00:00:00Z",
    ...overrides,
  };
}

describe("ensureDepreciationEntriesGenerated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createJournalEntries).mockImplementation(async (_tenantId, inputs) =>
      inputs.map((input) => generatedEntry(input))
    );
  });

  it("generates one depreciation entry per fixed asset when none exists yet", async () => {
    vi.mocked(listFixedAssets).mockResolvedValue([asset]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    const result = await ensureDepreciationEntriesGenerated("tenant-1", fiscalPeriod);

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", [
      expect.objectContaining({
        date: "2026-12-31",
        debit_account_id: "acc-deprexp",
        credit_account_id: "acc-fixed",
        amount: 120_000, // 600,000 / 5年 = 年120,000円
        source: "generated",
        tax_category: "対象外",
      }),
    ]);
  });

  it("does not generate a second entry when one already exists for the same asset and period (no double generation)", async () => {
    vi.mocked(listFixedAssets).mockResolvedValue([asset]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      generatedEntry({ debit_account_id: "acc-deprexp", credit_account_id: "acc-fixed", date: "2026-12-31" }),
    ]);

    const result = await ensureDepreciationEntriesGenerated("tenant-1", fiscalPeriod);

    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", []);
  });

  it("skips disposed assets", async () => {
    vi.mocked(listFixedAssets).mockResolvedValue([{ ...asset, disposed_at: "2026-03-01" }]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    const result = await ensureDepreciationEntriesGenerated("tenant-1", fiscalPeriod);

    expect(result.createdCount).toBe(0);
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", []);
  });

  it("is idempotent across repeated calls against the same ledger state", async () => {
    vi.mocked(listFixedAssets).mockResolvedValue([asset]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    const first = await ensureDepreciationEntriesGenerated("tenant-1", fiscalPeriod);
    expect(first.createdCount).toBe(1);

    // 2回目の呼び出しでは、1回目で生成された仕訳が既存扱いになる（実際のDBではlistJournalEntriesの
    // 返り値に反映される）。ここではその状況をモックで再現する。
    vi.mocked(listJournalEntries).mockResolvedValue([
      generatedEntry({ debit_account_id: "acc-deprexp", credit_account_id: "acc-fixed", date: "2026-12-31" }),
    ]);
    const second = await ensureDepreciationEntriesGenerated("tenant-1", fiscalPeriod);
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(1);
  });
});

describe("ensureLoanRepaymentEntriesGenerated", () => {
  const options = { cashAccountId: "acc-cash" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createJournalEntries).mockImplementation(async (_tenantId, inputs) => inputs.map((input) => generatedEntry(input)));
  });

  it("generates interest + principal entries for each installment within the period", async () => {
    vi.mocked(listLoans).mockResolvedValue([loan]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    // 2026年中に返済日が到来するのは 2026-01-15〜2026-12-15 の12回
    const result = await ensureLoanRepaymentEntriesGenerated("tenant-1", fiscalPeriod, options);

    expect(result.createdCount).toBe(24); // 12回 × (利息 + 元本)
    const call = vi.mocked(createJournalEntries).mock.calls[0][1];
    expect(call.filter((c) => c.debit_account_id === "acc-loan")).toHaveLength(12);
    expect(call.filter((c) => c.debit_account_id === "acc-interest")).toHaveLength(12);
    for (const entry of call) {
      expect(entry.credit_account_id).toBe("acc-cash");
      expect(entry.source).toBe("generated");
    }
  });

  it("does not double-generate installments that already have a matching generated entry (no double generation)", async () => {
    vi.mocked(listLoans).mockResolvedValue([loan]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      generatedEntry({ debit_account_id: "acc-interest", credit_account_id: "acc-cash", date: "2026-01-15", amount: 6_000 }),
      generatedEntry({ debit_account_id: "acc-loan", credit_account_id: "acc-cash", date: "2026-01-15", amount: 50_000 }),
    ]);

    const result = await ensureLoanRepaymentEntriesGenerated("tenant-1", fiscalPeriod, options);

    // 1月分（2回分の仕訳）はスキップされ、残り11回分（22件）のみ生成される
    expect(result.createdCount).toBe(22);
    const call = vi.mocked(createJournalEntries).mock.calls[0][1];
    expect(call.some((c) => c.date === "2026-01-15")).toBe(false);
  });

  it("only generates the missing half when interest was recorded but principal was not (partial generation)", async () => {
    vi.mocked(listLoans).mockResolvedValue([loan]);
    vi.mocked(listJournalEntries).mockResolvedValue([
      generatedEntry({ debit_account_id: "acc-interest", credit_account_id: "acc-cash", date: "2026-01-15", amount: 6_000 }),
    ]);

    await ensureLoanRepaymentEntriesGenerated("tenant-1", fiscalPeriod, options);

    const call = vi.mocked(createJournalEntries).mock.calls[0][1];
    const januaryEntries = call.filter((c) => c.date === "2026-01-15");
    expect(januaryEntries).toHaveLength(1);
    expect(januaryEntries[0].debit_account_id).toBe("acc-loan");
  });

  it("is idempotent across repeated calls for the same month", async () => {
    const monthPeriod = { start: "2026-04-01", end: "2026-04-30" };
    vi.mocked(listLoans).mockResolvedValue([loan]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);

    const first = await ensureLoanRepaymentEntriesGenerated("tenant-1", monthPeriod, options);
    expect(first.createdCount).toBe(2);

    vi.mocked(listJournalEntries).mockResolvedValue([
      generatedEntry({ debit_account_id: "acc-interest", credit_account_id: "acc-cash", date: "2026-04-15" }),
      generatedEntry({ debit_account_id: "acc-loan", credit_account_id: "acc-cash", date: "2026-04-15" }),
    ]);
    const second = await ensureLoanRepaymentEntriesGenerated("tenant-1", monthPeriod, options);
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(1);
  });
});

describe("ensureGeneratedEntries", () => {
  it("runs both depreciation and loan repayment generation and reports both results", async () => {
    vi.clearAllMocks();
    vi.mocked(listFixedAssets).mockResolvedValue([asset]);
    vi.mocked(listLoans).mockResolvedValue([loan]);
    vi.mocked(listJournalEntries).mockResolvedValue([]);
    vi.mocked(createJournalEntries).mockImplementation(async (_tenantId, inputs) => inputs.map((input) => generatedEntry(input)));

    const result = await ensureGeneratedEntries("tenant-1", fiscalPeriod, { cashAccountId: "acc-cash" });

    expect(result.depreciation.createdCount).toBe(1);
    expect(result.loanRepayment.createdCount).toBe(24);
  });
});
