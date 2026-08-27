import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, LoanRow } from "./supabaseClient";
import {
  EMPTY_LOAN_DRAFT,
  createLoan,
  draftToLoanInput,
  hasLoanErrors,
  listLoans,
  toAmortizationLoan,
  validateLoanDraft,
} from "./loans";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
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

describe("createLoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts scoped to the tenant with default repayment_type", async () => {
    const builder = createBuilder({ data: sampleLoan, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await createLoan("tenant-1", {
      name: "運転資金",
      principal_amount: 1_200_000,
      interest_rate: 0.06,
      start_date: "2025-01-15",
      term_months: 24,
      liability_account_id: "acc-loan",
      interest_expense_account_id: "acc-interest",
    });

    expect(result).toEqual(sampleLoan);
    expect(from).toHaveBeenCalledWith("loans");
    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      name: "運転資金",
      principal_amount: 1_200_000,
      interest_rate: 0.06,
      start_date: "2025-01-15",
      term_months: 24,
      repayment_type: "equal-principal",
      liability_account_id: "acc-loan",
      interest_expense_account_id: "acc-interest",
    });
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createLoan("tenant-1", {
        name: "運転資金",
        principal_amount: 1_200_000,
        interest_rate: 0.06,
        start_date: "2025-01-15",
        term_months: 24,
        liability_account_id: "acc-loan",
        interest_expense_account_id: "acc-interest",
      })
    ).rejects.toThrow(/借入金の登録に失敗しました/);
  });
});

const validLoanDraft = {
  name: "運転資金",
  principalAmount: "1200000",
  interestRatePercent: "1.75",
  startDate: "2025-01-15",
  termMonths: "24",
  repaymentType: "equal-principal" as const,
  liabilityAccountId: "acc-loan",
  interestExpenseAccountId: "acc-interest",
};

describe("validateLoanDraft", () => {
  it("returns no errors for a valid draft", () => {
    expect(validateLoanDraft(validLoanDraft)).toEqual({});
  });

  it("flags an empty draft on every required field", () => {
    const errors = validateLoanDraft(EMPTY_LOAN_DRAFT);
    expect(hasLoanErrors(errors)).toBe(true);
    expect(errors.name).toBeDefined();
    expect(errors.principalAmount).toBeDefined();
    expect(errors.interestRatePercent).toBeDefined();
    expect(errors.startDate).toBeDefined();
    expect(errors.termMonths).toBeDefined();
    expect(errors.liabilityAccountId).toBeDefined();
    expect(errors.interestExpenseAccountId).toBeDefined();
  });

  it("allows a 0% interest rate but rejects a negative one", () => {
    expect(validateLoanDraft({ ...validLoanDraft, interestRatePercent: "0" }).interestRatePercent).toBeUndefined();
    expect(validateLoanDraft({ ...validLoanDraft, interestRatePercent: "-1" }).interestRatePercent).toBeDefined();
  });

  it("rejects a non-integer term", () => {
    expect(validateLoanDraft({ ...validLoanDraft, termMonths: "24.5" }).termMonths).toBeDefined();
  });
});

describe("draftToLoanInput", () => {
  it("converts a valid draft to a DB input, converting the percent rate to a decimal", () => {
    expect(draftToLoanInput(validLoanDraft)).toEqual({
      name: "運転資金",
      principal_amount: 1_200_000,
      interest_rate: 0.0175,
      start_date: "2025-01-15",
      term_months: 24,
      repayment_type: "equal-principal",
      liability_account_id: "acc-loan",
      interest_expense_account_id: "acc-interest",
    });
  });
});
