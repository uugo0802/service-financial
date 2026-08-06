import { describe, expect, it } from "vitest";
import {
  ADVISOR_ACCESS_SCOPES,
  AdvisorAccessError,
  AdvisorAccessGrant,
  InvalidAdvisorAccessTransitionError,
  activateAdvisorAccessGrant,
  createAdvisorAccessInvite,
  isAdvisorAccessEligible,
  isAdvisorAccessGrantExpired,
  isAdvisorAccessGrantValid,
  isValidAdvisorEmail,
  listAdvisorAccessGrantsByStatus,
  revokeAdvisorAccessGrant,
} from "./advisorAccess";

const TENANT_ID = "tenant-1";

function activeGrant(overrides: Partial<AdvisorAccessGrant> = {}): AdvisorAccessGrant {
  return {
    id: "grant-active",
    tenantId: TENANT_ID,
    advisorName: "山田太郎",
    advisorEmail: "advisor@example.com",
    scopes: ["transactions", "filingDrafts"],
    status: "active",
    inviteToken: "token-active",
    createdAt: "2026-01-01T00:00:00.000Z",
    activatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidAdvisorEmail", () => {
  it("accepts a normal-looking email address", () => {
    expect(isValidAdvisorEmail("advisor@example.com")).toBe(true);
  });

  it("rejects strings without an @ or a domain part", () => {
    expect(isValidAdvisorEmail("not-an-email")).toBe(false);
    expect(isValidAdvisorEmail("missing-domain@")).toBe(false);
    expect(isValidAdvisorEmail("@missing-local.com")).toBe(false);
    expect(isValidAdvisorEmail("no-tld@example")).toBe(false);
    expect(isValidAdvisorEmail("")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(isValidAdvisorEmail("  advisor@example.com  ")).toBe(true);
  });
});

describe("createAdvisorAccessInvite", () => {
  it("creates a pending grant with a token, defaulting to all scopes", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const grant = createAdvisorAccessInvite([], {
      tenantId: TENANT_ID,
      advisorName: "山田太郎",
      advisorEmail: "new-advisor@example.com",
      id: "grant-1",
      token: "fixed-token",
      now,
    });

    expect(grant.status).toBe("pending");
    expect(grant.id).toBe("grant-1");
    expect(grant.inviteToken).toBe("fixed-token");
    expect(grant.tenantId).toBe(TENANT_ID);
    expect(grant.advisorEmail).toBe("new-advisor@example.com");
    expect(grant.scopes).toEqual(ADVISOR_ACCESS_SCOPES);
    expect(grant.createdAt).toBe(now.toISOString());
    expect(grant.activatedAt).toBeUndefined();
    expect(grant.revokedAt).toBeUndefined();
    expect(grant.expiresAt).toBeUndefined();
  });

  it("respects an explicit, narrower scope list", () => {
    const grant = createAdvisorAccessInvite([], {
      tenantId: TENANT_ID,
      advisorName: "山田太郎",
      advisorEmail: "new-advisor@example.com",
      scopes: ["invoices"],
      id: "grant-1",
      token: "fixed-token",
    });

    expect(grant.scopes).toEqual(["invoices"]);
  });

  it("computes expiresAt from expiresInDays relative to now", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const grant = createAdvisorAccessInvite([], {
      tenantId: TENANT_ID,
      advisorName: "山田太郎",
      advisorEmail: "new-advisor@example.com",
      expiresInDays: 30,
      id: "grant-1",
      token: "fixed-token",
      now,
    });

    expect(grant.expiresAt).toBe(new Date("2026-07-31T00:00:00.000Z").toISOString());
  });

  it("throws on an invalid email format", () => {
    expect(() =>
      createAdvisorAccessInvite([], {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "not-an-email",
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("throws when advisorName is empty", () => {
    expect(() =>
      createAdvisorAccessInvite([], {
        tenantId: TENANT_ID,
        advisorName: "   ",
        advisorEmail: "advisor@example.com",
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("throws when scopes is an empty array", () => {
    expect(() =>
      createAdvisorAccessInvite([], {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "advisor@example.com",
        scopes: [],
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("throws on an unknown scope value", () => {
    expect(() =>
      createAdvisorAccessInvite([], {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "advisor@example.com",
        // @ts-expect-error intentionally invalid scope for the test
        scopes: ["not-a-real-scope"],
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("throws when expiresInDays is not a positive number", () => {
    expect(() =>
      createAdvisorAccessInvite([], {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "advisor@example.com",
        expiresInDays: 0,
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("throws when the advisor already has a pending or active grant for the tenant (case-insensitive)", () => {
    const existing = [activeGrant({ status: "pending", advisorEmail: "advisor@example.com" })];

    expect(() =>
      createAdvisorAccessInvite(existing, {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "ADVISOR@Example.com",
      }),
    ).toThrow(AdvisorAccessError);
  });

  it("allows re-inviting an advisor whose previous grant was revoked", () => {
    const existing = [activeGrant({ status: "revoked", advisorEmail: "advisor@example.com" })];

    expect(() =>
      createAdvisorAccessInvite(existing, {
        tenantId: TENANT_ID,
        advisorName: "山田太郎",
        advisorEmail: "advisor@example.com",
        id: "grant-2",
        token: "fixed-token",
      }),
    ).not.toThrow();
  });

  it("generates a token automatically when none is provided", () => {
    const grant = createAdvisorAccessInvite([], {
      tenantId: TENANT_ID,
      advisorName: "山田太郎",
      advisorEmail: "advisor@example.com",
    });

    expect(grant.inviteToken.length).toBeGreaterThan(0);
  });
});

describe("activateAdvisorAccessGrant", () => {
  it("moves a pending grant to active and stamps activatedAt", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    const pending = createAdvisorAccessInvite([], {
      tenantId: TENANT_ID,
      advisorName: "山田太郎",
      advisorEmail: "advisor@example.com",
      id: "grant-1",
      token: "fixed-token",
    });

    const result = activateAdvisorAccessGrant([pending], pending.id, now);

    expect(result[0].status).toBe("active");
    expect(result[0].activatedAt).toBe(now.toISOString());
  });

  it("throws when the grant is already active", () => {
    expect(() => activateAdvisorAccessGrant([activeGrant()], "grant-active")).toThrow(
      InvalidAdvisorAccessTransitionError,
    );
  });

  it("throws when the grant does not exist", () => {
    expect(() => activateAdvisorAccessGrant([], "missing")).toThrow(AdvisorAccessError);
  });
});

describe("revokeAdvisorAccessGrant", () => {
  it("revokes an active grant and stamps revokedAt", () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const result = revokeAdvisorAccessGrant([activeGrant()], "grant-active", now);

    expect(result[0].status).toBe("revoked");
    expect(result[0].revokedAt).toBe(now.toISOString());
  });

  it("revokes a still-pending grant", () => {
    const pending = activeGrant({ status: "pending", activatedAt: undefined });
    const result = revokeAdvisorAccessGrant([pending], "grant-active");
    expect(result[0].status).toBe("revoked");
  });

  it("throws when the grant is already revoked", () => {
    const revoked = activeGrant({ status: "revoked", revokedAt: "2026-01-05T00:00:00.000Z" });
    expect(() => revokeAdvisorAccessGrant([revoked], "grant-active")).toThrow(InvalidAdvisorAccessTransitionError);
  });

  it("throws when the grant does not exist", () => {
    expect(() => revokeAdvisorAccessGrant([], "missing")).toThrow(AdvisorAccessError);
  });

  it("leaves the original array untouched (returns a new array)", () => {
    const grants = [activeGrant()];
    const result = revokeAdvisorAccessGrant(grants, "grant-active");
    expect(grants[0].status).toBe("active");
    expect(result[0].status).toBe("revoked");
  });
});

describe("listAdvisorAccessGrantsByStatus", () => {
  it("filters by tenant and status", () => {
    const grants = [
      activeGrant({ id: "a", status: "active" }),
      activeGrant({ id: "b", status: "pending", advisorEmail: "pending@example.com" }),
      activeGrant({ id: "c", status: "revoked", advisorEmail: "revoked@example.com" }),
      activeGrant({ id: "d", tenantId: "tenant-2", status: "active", advisorEmail: "other@example.com" }),
    ];

    expect(listAdvisorAccessGrantsByStatus(grants, TENANT_ID, "active").map((g) => g.id)).toEqual(["a"]);
    expect(listAdvisorAccessGrantsByStatus(grants, TENANT_ID, "pending").map((g) => g.id)).toEqual(["b"]);
    expect(listAdvisorAccessGrantsByStatus(grants, TENANT_ID, "revoked").map((g) => g.id)).toEqual(["c"]);
  });

  it("returns an empty array when there are no matches", () => {
    expect(listAdvisorAccessGrantsByStatus([], TENANT_ID, "active")).toEqual([]);
  });
});

describe("expiry logic", () => {
  const expiring = activeGrant({ expiresAt: "2026-08-31T00:00:00.000Z" });

  it("isAdvisorAccessGrantExpired is false before the expiry date", () => {
    expect(isAdvisorAccessGrantExpired(expiring, new Date("2026-08-01T00:00:00.000Z"))).toBe(false);
  });

  it("isAdvisorAccessGrantExpired is true after the expiry date", () => {
    expect(isAdvisorAccessGrantExpired(expiring, new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
  });

  it("a grant with no expiresAt never expires", () => {
    expect(isAdvisorAccessGrantExpired(activeGrant({ expiresAt: undefined }), new Date("2099-01-01T00:00:00.000Z"))).toBe(
      false,
    );
  });

  it("isAdvisorAccessGrantValid is true for an active, unexpired grant", () => {
    expect(isAdvisorAccessGrantValid(expiring, new Date("2026-08-01T00:00:00.000Z"))).toBe(true);
  });

  it("isAdvisorAccessGrantValid is false once the grant has expired", () => {
    expect(isAdvisorAccessGrantValid(expiring, new Date("2026-09-01T00:00:00.000Z"))).toBe(false);
  });

  it("isAdvisorAccessGrantValid is false for a pending grant even without an expiry", () => {
    expect(isAdvisorAccessGrantValid(activeGrant({ status: "pending", activatedAt: undefined }))).toBe(false);
  });

  it("isAdvisorAccessGrantValid is false for a revoked grant", () => {
    expect(isAdvisorAccessGrantValid(activeGrant({ status: "revoked" }))).toBe(false);
  });
});

describe("isAdvisorAccessEligible", () => {
  it("is true when the subscription is active and the plan includes advisor access", () => {
    expect(
      isAdvisorAccessEligible({ subscriptionStatus: "active", planIncludesAdvisorAccess: true }),
    ).toBe(true);
  });

  it("is true while trialing, as long as the plan includes advisor access", () => {
    expect(
      isAdvisorAccessEligible({ subscriptionStatus: "trialing", planIncludesAdvisorAccess: true }),
    ).toBe(true);
  });

  it("is false when the plan/add-on does not include advisor access", () => {
    expect(
      isAdvisorAccessEligible({ subscriptionStatus: "active", planIncludesAdvisorAccess: false }),
    ).toBe(false);
  });

  it("is false when the subscription is past_due, even if the plan includes advisor access", () => {
    expect(
      isAdvisorAccessEligible({ subscriptionStatus: "past_due", planIncludesAdvisorAccess: true }),
    ).toBe(false);
  });

  it("is false when the subscription is canceled, even if the plan includes advisor access", () => {
    expect(
      isAdvisorAccessEligible({ subscriptionStatus: "canceled", planIncludesAdvisorAccess: true }),
    ).toBe(false);
  });
});
