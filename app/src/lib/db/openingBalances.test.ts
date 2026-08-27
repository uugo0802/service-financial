import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, CompanyOpeningBalanceRow } from "./supabaseClient";
import {
  draftToOpeningBalanceInput,
  getCompanyOpeningBalance,
  hasOpeningBalanceErrors,
  openingBalanceToDraft,
  upsertCompanyOpeningBalance,
  validateOpeningBalanceDraft,
} from "./openingBalances";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "upsert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  return builder;
}

const sampleOpeningBalance: CompanyOpeningBalanceRow = {
  tenant_id: "tenant-1",
  as_of_date: "2025-12-31",
  cash_balance: 2_000_000,
  retained_earnings: 500_000,
  created_at: "2026-01-01T00:00:00Z",
};

describe("getCompanyOpeningBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by tenant and returns the row when found", async () => {
    const builder = createBuilder({ data: sampleOpeningBalance, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await getCompanyOpeningBalance("tenant-1");

    expect(result).toEqual(sampleOpeningBalance);
    expect(from).toHaveBeenCalledWith("company_opening_balances");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("returns null when no row exists yet (stage 4 form unused)", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(getCompanyOpeningBalance("tenant-1")).resolves.toBeNull();
  });

  it("returns null (rather than throwing) on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(getCompanyOpeningBalance("tenant-1")).resolves.toBeNull();
  });
});

describe("upsertCompanyOpeningBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts scoped to the tenant with tenant_id as the conflict key", async () => {
    const builder = createBuilder({ data: sampleOpeningBalance, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await upsertCompanyOpeningBalance("tenant-1", {
      as_of_date: "2025-12-31",
      cash_balance: 2_000_000,
      retained_earnings: 500_000,
    });

    expect(result).toEqual(sampleOpeningBalance);
    expect(from).toHaveBeenCalledWith("company_opening_balances");
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        tenant_id: "tenant-1",
        as_of_date: "2025-12-31",
        cash_balance: 2_000_000,
        retained_earnings: 500_000,
      },
      { onConflict: "tenant_id" }
    );
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      upsertCompanyOpeningBalance("tenant-1", { as_of_date: "2025-12-31", cash_balance: 0, retained_earnings: 0 })
    ).rejects.toThrow(/期首残高の保存に失敗しました/);
  });
});

describe("openingBalanceToDraft", () => {
  it("converts a saved row into form draft strings", () => {
    expect(openingBalanceToDraft(sampleOpeningBalance)).toEqual({
      asOfDate: "2025-12-31",
      cashBalance: "2000000",
      retainedEarnings: "500000",
    });
  });
});

describe("validateOpeningBalanceDraft", () => {
  it("returns no errors for a valid draft", () => {
    expect(
      validateOpeningBalanceDraft({ asOfDate: "2025-12-31", cashBalance: "2000000", retainedEarnings: "500000" })
    ).toEqual({});
  });

  it("requires as_of_date", () => {
    const errors = validateOpeningBalanceDraft({ asOfDate: "", cashBalance: "0", retainedEarnings: "0" });
    expect(errors.asOfDate).toBeDefined();
  });

  it("requires a non-negative numeric cash balance", () => {
    expect(hasOpeningBalanceErrors(validateOpeningBalanceDraft({ asOfDate: "2025-12-31", cashBalance: "", retainedEarnings: "0" }))).toBe(
      true
    );
    expect(
      hasOpeningBalanceErrors(validateOpeningBalanceDraft({ asOfDate: "2025-12-31", cashBalance: "-1", retainedEarnings: "0" }))
    ).toBe(true);
  });

  it("allows a negative retained earnings (繰越欠損金)", () => {
    const errors = validateOpeningBalanceDraft({ asOfDate: "2025-12-31", cashBalance: "0", retainedEarnings: "-300000" });
    expect(errors.retainedEarnings).toBeUndefined();
  });

  it("requires a numeric retained earnings", () => {
    const errors = validateOpeningBalanceDraft({ asOfDate: "2025-12-31", cashBalance: "0", retainedEarnings: "" });
    expect(errors.retainedEarnings).toBeDefined();
  });
});

describe("draftToOpeningBalanceInput", () => {
  it("converts a valid draft to a DB input, trimming and parsing numbers", () => {
    expect(
      draftToOpeningBalanceInput({ asOfDate: " 2025-12-31 ", cashBalance: "2000000", retainedEarnings: "-300000" })
    ).toEqual({
      as_of_date: "2025-12-31",
      cash_balance: 2_000_000,
      retained_earnings: -300_000,
    });
  });
});
