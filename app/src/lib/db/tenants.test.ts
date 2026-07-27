import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, Tenant, TenantUser } from "./supabaseClient";
import { getMyTenantUser, getTenant } from "./tenants";

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
