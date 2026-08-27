import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRow, JournalEntryRow } from "./supabaseClient";
import { listAccounts, createAccount } from "./accounts";
import { createJournalEntries } from "./journalEntries";
import { CategorizedTransaction } from "../categorize/engine";
import { importCategorizedTransactionsAsJournalEntries } from "./csvJournalImport";

vi.mock("./accounts", () => ({ listAccounts: vi.fn(), createAccount: vi.fn() }));
vi.mock("./journalEntries", () => ({ createJournalEntries: vi.fn() }));

const cashAccount: AccountRow = {
  id: "acc-cash",
  tenant_id: "tenant-1",
  code: null,
  name: "現金及び預金",
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

const expenseAccount: AccountRow = {
  id: "acc-rent",
  tenant_id: "tenant-1",
  code: null,
  name: "地代家賃",
  account_type: "expense",
  tax_category: null,
  created_at: "2026-01-01T00:00:00Z",
};

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "tx-1",
    date: "2026-06-01",
    description: "コンサルティングフィー入金",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

function journalEntry(overrides: Partial<JournalEntryRow>): JournalEntryRow {
  return {
    id: "je-1",
    tenant_id: "tenant-1",
    entry_group_id: "je-1",
    date: "2026-06-01",
    debit_account_id: "acc-cash",
    credit_account_id: "acc-revenue",
    amount: 550_000,
    description: "コンサルティングフィー入金",
    tax_category: "課税売上10%",
    confidence: 1,
    source: "rule",
    personal_deduction_only: false,
    exclude_from_income: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("importCategorizedTransactionsAsJournalEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps an income row to debit=cash / credit=revenue account", async () => {
    vi.mocked(listAccounts).mockResolvedValue([cashAccount, revenueAccount]);
    vi.mocked(createJournalEntries).mockResolvedValue([journalEntry({})]);

    const result = await importCategorizedTransactionsAsJournalEntries(
      "tenant-1",
      [tx({ amount: 550_000, account: "売上高" })],
      "acc-cash"
    );

    expect(createAccount).not.toHaveBeenCalled();
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", [
      {
        date: "2026-06-01",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-revenue",
        amount: 550_000,
        description: "コンサルティングフィー入金",
        tax_category: "課税売上10%",
        confidence: 1,
        source: "rule",
        personal_deduction_only: false,
        exclude_from_income: false,
      },
    ]);
    expect(result.createdAccountCount).toBe(0);
  });

  it("maps an expense row to debit=expense account / credit=cash, using the absolute amount", async () => {
    vi.mocked(listAccounts).mockResolvedValue([cashAccount, expenseAccount]);
    vi.mocked(createJournalEntries).mockResolvedValue([]);

    await importCategorizedTransactionsAsJournalEntries(
      "tenant-1",
      [tx({ amount: -32_000, account: "地代家賃", taxCategory: "課税仕入10%", description: "コワーキング利用料" })],
      "acc-cash"
    );

    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", [
      expect.objectContaining({
        debit_account_id: "acc-rent",
        credit_account_id: "acc-cash",
        amount: 32_000,
        tax_category: "課税仕入10%",
      }),
    ]);
  });

  it("creates a missing counterpart account (by name + inferred account_type) and counts it", async () => {
    vi.mocked(listAccounts).mockResolvedValue([cashAccount]);
    const newAccount = { ...expenseAccount, id: "acc-new" };
    vi.mocked(createAccount).mockResolvedValue(newAccount);
    vi.mocked(createJournalEntries).mockResolvedValue([]);

    const result = await importCategorizedTransactionsAsJournalEntries(
      "tenant-1",
      [tx({ amount: -5_000, account: "消耗品費" })],
      "acc-cash"
    );

    expect(createAccount).toHaveBeenCalledWith("tenant-1", { name: "消耗品費", account_type: "expense" });
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", [
      expect.objectContaining({ debit_account_id: "acc-new", credit_account_id: "acc-cash" }),
    ]);
    expect(result.createdAccountCount).toBe(1);
  });

  it("reuses a newly-created account across multiple rows with the same name instead of creating it twice", async () => {
    vi.mocked(listAccounts).mockResolvedValue([cashAccount]);
    const newAccount = { ...expenseAccount, id: "acc-new" };
    vi.mocked(createAccount).mockResolvedValue(newAccount);
    vi.mocked(createJournalEntries).mockResolvedValue([]);

    const result = await importCategorizedTransactionsAsJournalEntries(
      "tenant-1",
      [tx({ id: "tx-1", amount: -5_000, account: "消耗品費" }), tx({ id: "tx-2", amount: -3_000, account: "消耗品費" })],
      "acc-cash"
    );

    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(result.createdAccountCount).toBe(1);
  });

  it("skips zero-amount rows", async () => {
    vi.mocked(listAccounts).mockResolvedValue([cashAccount, revenueAccount]);
    vi.mocked(createJournalEntries).mockResolvedValue([]);

    await importCategorizedTransactionsAsJournalEntries("tenant-1", [tx({ amount: 0 })], "acc-cash");

    expect(createAccount).not.toHaveBeenCalled();
    expect(createJournalEntries).toHaveBeenCalledWith("tenant-1", []);
  });
});
