import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, Tenant, TenantUser } from "./supabaseClient";
import {
  TenantProfile,
  TenantProfileDraft,
  draftToTenantProfilePatch,
  getMyTenantUser,
  getTenant,
  hasTenantProfileErrors,
  tenantProfileToDraft,
  updateTenantProfile,
  validateTenantProfileDraft,
} from "./tenants";

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

const sampleTenantUser: TenantUser = {
  user_id: "user-1",
  tenant_id: "tenant-1",
  role: "owner",
  created_at: "2026-07-01T00:00:00Z",
};

const sampleTenant: Tenant = {
  id: "tenant-1",
  entity_type: "individual",
  display_name: "山田太郎",
  created_at: "2026-07-01T00:00:00Z",
};

describe("getMyTenantUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no authenticated user", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) };
    vi.mocked(getSupabaseClient).mockReturnValue({ auth, from: vi.fn() } as never);

    const result = await getMyTenantUser();

    expect(result).toBeNull();
  });

  it("returns the tenant_users row for the current user", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) };
    const builder = createBuilder({ data: sampleTenantUser, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ auth, from } as never);

    const result = await getMyTenantUser();

    expect(result).toEqual(sampleTenantUser);
    expect(from).toHaveBeenCalledWith("tenant_users");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns null when the query errors", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) };
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ auth, from: vi.fn(() => builder) } as never);

    const result = await getMyTenantUser();

    expect(result).toBeNull();
  });

  it("returns null when auth.getUser() itself errors, even if a user object is present", async () => {
    const auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: { message: "auth failure" } }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue({ auth, from: vi.fn() } as never);

    const result = await getMyTenantUser();

    expect(result).toBeNull();
  });
});

describe("getTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the tenant row when found", async () => {
    const builder = createBuilder({ data: sampleTenant, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await getTenant("tenant-1");

    expect(result).toEqual(sampleTenant);
    expect(from).toHaveBeenCalledWith("tenants");
    expect(builder.eq).toHaveBeenCalledWith("id", "tenant-1");
  });

  it("returns null when not found or not authorized (RLS)", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await getTenant("other-tenant");

    expect(result).toBeNull();
  });
});

const sampleTenantProfile: TenantProfile = {
  id: "tenant-1",
  entity_type: "corp",
  display_name: "今ごえん合同会社",
  created_at: "2024-04-01T00:00:00Z",
  fiscal_year_end_month: 3,
  blue_return: true,
};

describe("validateTenantProfileDraft", () => {
  it("requires a display name", () => {
    const draft: TenantProfileDraft = {
      entityType: "individual",
      displayName: "  ",
      fiscalYearEndMonth: "",
      blueReturn: false,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(errors.displayName).toBeDefined();
    expect(hasTenantProfileErrors(errors)).toBe(true);
  });

  it("does not require a fiscal year end month for individuals", () => {
    const draft: TenantProfileDraft = {
      entityType: "individual",
      displayName: "山田太郎",
      fiscalYearEndMonth: "",
      blueReturn: true,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(hasTenantProfileErrors(errors)).toBe(false);
  });

  it("requires a fiscal year end month for corporations", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "",
      blueReturn: false,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(errors.fiscalYearEndMonth).toBeDefined();
  });

  it("rejects a fiscal year end month outside of 1-12", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "13",
      blueReturn: false,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(errors.fiscalYearEndMonth).toBeDefined();
  });

  it("rejects a non-numeric fiscal year end month", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "abc",
      blueReturn: false,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(errors.fiscalYearEndMonth).toBeDefined();
  });

  it("accepts a valid corporation draft", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "3",
      blueReturn: true,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(hasTenantProfileErrors(errors)).toBe(false);
  });

  it("accepts the boundary months 1 and 12, including a zero-padded value", () => {
    for (const month of ["1", "01", "12"]) {
      const draft: TenantProfileDraft = {
        entityType: "corp",
        displayName: "今ごえん合同会社",
        fiscalYearEndMonth: month,
        blueReturn: false,
      };
      expect(hasTenantProfileErrors(validateTenantProfileDraft(draft))).toBe(false);
    }
  });

  it("rejects a fiscal year end month of 0", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "0",
      blueReturn: false,
    };

    expect(validateTenantProfileDraft(draft).fiscalYearEndMonth).toBeDefined();
  });

  it("rejects a fractional fiscal year end month", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "3.5",
      blueReturn: false,
    };

    expect(validateTenantProfileDraft(draft).fiscalYearEndMonth).toBeDefined();
  });

  it("treats a whitespace-only fiscal year end month as missing for a corporation", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "   ",
      blueReturn: false,
    };

    expect(validateTenantProfileDraft(draft).fiscalYearEndMonth).toBeDefined();
  });

  it("reports both displayName and fiscalYearEndMonth errors at once when both are invalid", () => {
    const draft: TenantProfileDraft = {
      entityType: "corp",
      displayName: "  ",
      fiscalYearEndMonth: "",
      blueReturn: false,
    };

    const errors = validateTenantProfileDraft(draft);

    expect(errors.displayName).toBeDefined();
    expect(errors.fiscalYearEndMonth).toBeDefined();
  });
});

describe("tenantProfileToDraft / draftToTenantProfilePatch", () => {
  it("round-trips a corporation profile through the draft", () => {
    const draft = tenantProfileToDraft(sampleTenantProfile);

    expect(draft).toEqual({
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "3",
      blueReturn: true,
    });

    const patch = draftToTenantProfilePatch(draft);

    expect(patch).toEqual({
      entity_type: "corp",
      display_name: "今ごえん合同会社",
      fiscal_year_end_month: 3,
      blue_return: true,
    });
  });

  it("forces fiscal_year_end_month to null for individuals even if a stray value is present", () => {
    const patch = draftToTenantProfilePatch({
      entityType: "individual",
      displayName: "山田太郎",
      fiscalYearEndMonth: "3",
      blueReturn: false,
    });

    expect(patch.fiscal_year_end_month).toBeNull();
  });

  it("trims the display name", () => {
    const patch = draftToTenantProfilePatch({
      entityType: "individual",
      displayName: "  山田太郎  ",
      fiscalYearEndMonth: "",
      blueReturn: false,
    });

    expect(patch.display_name).toBe("山田太郎");
  });

  it("forces fiscal_year_end_month to null for a corporation whose month field is whitespace-only", () => {
    const patch = draftToTenantProfilePatch({
      entityType: "corp",
      displayName: "今ごえん合同会社",
      fiscalYearEndMonth: "   ",
      blueReturn: false,
    });

    expect(patch.fiscal_year_end_month).toBeNull();
  });

  it("round-trips an individual profile with a null fiscal_year_end_month to an empty draft field", () => {
    const individualProfile: TenantProfile = {
      id: "tenant-2",
      entity_type: "individual",
      display_name: "山田太郎",
      created_at: "2026-01-01T00:00:00Z",
      fiscal_year_end_month: null,
      blue_return: false,
    };

    const draft = tenantProfileToDraft(individualProfile);

    expect(draft.fiscalYearEndMonth).toBe("");
  });
});

describe("updateTenantProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createUpdateBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    for (const method of ["update", "select", "eq"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(result));
    return builder;
  }

  it("updates the tenant scoped by tenantId and returns the updated profile", async () => {
    const builder = createUpdateBuilder({ data: sampleTenantProfile, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await updateTenantProfile("tenant-1", {
      entity_type: "corp",
      display_name: "今ごえん合同会社",
      fiscal_year_end_month: 3,
      blue_return: true,
    });

    expect(result).toEqual(sampleTenantProfile);
    expect(from).toHaveBeenCalledWith("tenants");
    expect(builder.update).toHaveBeenCalledWith({
      entity_type: "corp",
      display_name: "今ごえん合同会社",
      fiscal_year_end_month: 3,
      blue_return: true,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "tenant-1");
  });

  it("throws a Japanese error message on failure", async () => {
    const builder = createUpdateBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      updateTenantProfile("tenant-1", {
        entity_type: "individual",
        display_name: "山田太郎",
        fiscal_year_end_month: null,
        blue_return: false,
      })
    ).rejects.toThrow(/テナント情報の更新に失敗しました/);
  });
});
