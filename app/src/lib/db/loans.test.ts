import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, LoanRow } from "./supabaseClient";
import { listLoans, toAmortizationLoan } from "./loans";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleLoan: LoanRow = {
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

describe("listLoans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by tenant and orders by start date", async () => {
    const builder = createBuilder({ data: [sampleLoan], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listLoans("tenant-1");

    expect(result).toEqual([sampleLoan]);
    expect(from).toHaveBeenCalledWith("loans");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("start_date", { ascending: true });
  });

  it("returns an empty array when no rows are found (data is null)", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listLoans("tenant-1")).resolves.toEqual([]);
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listLoans("tenant-1")).rejects.toThrow(/借入金台帳の取得に失敗しました/);
  });
});

describe("toAmortizationLoan", () => {
  it("maps a LoanRow to loanAmortization.ts's Loan shape", () => {
    expect(toAmortizationLoan(sampleLoan)).toEqual({
      id: "loan-1",
      name: "運転資金",
      principalAmount: 1_200_000,
      interestRate: 0.06,
      startDate: "2025-01-15",
      termMonths: 24,
      repaymentType: "equal-principal",
    });
  });
});
