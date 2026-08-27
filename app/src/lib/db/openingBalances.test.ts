import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, CompanyOpeningBalanceRow } from "./supabaseClient";
import { getCompanyOpeningBalance } from "./openingBalances";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
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
