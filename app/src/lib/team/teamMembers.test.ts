import { describe, expect, it } from "vitest";
import {
  TeamMember,
  TeamMemberError,
  LastOwnerError,
  InvalidTeamMemberTransitionError,
  acceptTeamMemberInvite,
  canEdit,
  canManageTeam,
  canView,
  changeTeamMemberRole,
  countOwners,
  inviteTeamMember,
  isLastOwner,
  isValidEmail,
  removeTeamMember,
} from "./teamMembers";

const TENANT_ID = "tenant-1";

function ownerMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "member-owner",
    tenantId: TENANT_ID,
    email: "owner@example.com",
    role: "owner",
    status: "active",
    invitedAt: "2026-01-01T00:00:00.000Z",
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function editorMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "member-editor",
    tenantId: TENANT_ID,
    email: "editor@example.com",
    role: "editor",
    status: "active",
    invitedAt: "2026-01-02T00:00:00.000Z",
    joinedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidEmail", () => {
  it("accepts a normal-looking email address", () => {
    expect(isValidEmail("bookkeeper@example.com")).toBe(true);
  });

  it("rejects strings without an @ or a domain part", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing-domain@")).toBe(false);
    expect(isValidEmail("@missing-local.com")).toBe(false);
    expect(isValidEmail("no-tld@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(isValidEmail("  bookkeeper@example.com  ")).toBe(true);
  });
});

describe("inviteTeamMember", () => {
  it("creates a pending invite with the given role", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const invite = inviteTeamMember([], {
      tenantId: TENANT_ID,
      email: "new-member@example.com",
      role: "viewer",
      now,
    });

    expect(invite.status).toBe("pending");
    expect(invite.role).toBe("viewer");
    expect(invite.tenantId).toBe(TENANT_ID);
    expect(invite.email).toBe("new-member@example.com");
    expect(invite.invitedAt).toBe(now.toISOString());
    expect(invite.joinedAt).toBeUndefined();
  });

  it("throws on an invalid email format", () => {
    expect(() =>
      inviteTeamMember([], { tenantId: TENANT_ID, email: "not-an-email", role: "editor" }),
    ).toThrow();
  });

  it("throws a TeamMemberError when inviting an email that is already a member (duplicate invite)", () => {
    const existing = [ownerMember()];

    expect(() =>
      inviteTeamMember(existing, { tenantId: TENANT_ID, email: "owner@example.com", role: "editor" }),
    ).toThrow(TeamMemberError);
  });

  it("treats duplicate email detection as case-insensitive", () => {
    const existing = [ownerMember({ email: "owner@example.com" })];

    expect(() =>
      inviteTeamMember(existing, { tenantId: TENANT_ID, email: "OWNER@Example.com", role: "viewer" }),
    ).toThrow(TeamMemberError);
  });

  it("also rejects duplicates against a still-pending invite", () => {
    const existing = [
      inviteTeamMember([], { tenantId: TENANT_ID, email: "pending@example.com", role: "viewer" }),
    ];

    expect(() =>
      inviteTeamMember(existing, { tenantId: TENANT_ID, email: "pending@example.com", role: "editor" }),
    ).toThrow(TeamMemberError);
  });

  it("allows the same email to be invited again in a different tenant", () => {
    const existing = [ownerMember({ tenantId: "tenant-2" })];

    expect(() =>
      inviteTeamMember(existing, { tenantId: TENANT_ID, email: "owner@example.com", role: "viewer" }),
    ).not.toThrow();
  });
});

describe("acceptTeamMemberInvite", () => {
  it("moves a pending member to active and stamps joinedAt", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    const pending = inviteTeamMember([], { tenantId: TENANT_ID, email: "friend@example.com", role: "editor" });

    const result = acceptTeamMemberInvite([pending], pending.id, now);

    expect(result[0].status).toBe("active");
    expect(result[0].joinedAt).toBe(now.toISOString());
  });

  it("throws when the member is already active", () => {
    const active = editorMember();
    expect(() => acceptTeamMemberInvite([active], active.id)).toThrow(InvalidTeamMemberTransitionError);
  });

  it("throws when the member does not exist", () => {
    expect(() => acceptTeamMemberInvite([], "missing")).toThrow();
  });
});

describe("changeTeamMemberRole", () => {
  it("changes the role of an active, non-owner member", () => {
    const members = [ownerMember(), editorMember()];

    const result = changeTeamMemberRole(members, "member-editor", "viewer");

    const updated = result.find((m) => m.id === "member-editor");
    expect(updated?.role).toBe("viewer");
    // untouched sibling stays as-is
    const owner = result.find((m) => m.id === "member-owner");
    expect(owner?.role).toBe("owner");
  });

  it("allows demoting an owner when another owner remains", () => {
    const members = [ownerMember(), ownerMember({ id: "member-owner-2", email: "owner2@example.com" })];

    const result = changeTeamMemberRole(members, "member-owner", "editor");

    expect(result.find((m) => m.id === "member-owner")?.role).toBe("editor");
  });

  it("throws a LastOwnerError when demoting the sole remaining owner", () => {
    const members = [ownerMember(), editorMember()];

    expect(() => changeTeamMemberRole(members, "member-owner", "editor")).toThrow(LastOwnerError);
    // state must be unchanged after the throw
    expect(members.find((m) => m.id === "member-owner")?.role).toBe("owner");
  });

  it("throws when the member does not exist", () => {
    expect(() => changeTeamMemberRole([], "missing", "editor")).toThrow();
  });

  it("does not throw a LastOwnerError when 'changing' the sole owner's role to owner (no-op)", () => {
    const members = [ownerMember()];
    const result = changeTeamMemberRole(members, "member-owner", "owner");
    expect(result.find((m) => m.id === "member-owner")?.role).toBe("owner");
  });
});

describe("removeTeamMember", () => {
  it("removes a non-owner member", () => {
    const members = [ownerMember(), editorMember()];

    const result = removeTeamMember(members, "member-editor");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("member-owner");
  });

  it("throws a LastOwnerError when removing the sole remaining owner", () => {
    const members = [ownerMember(), editorMember()];

    expect(() => removeTeamMember(members, "member-owner")).toThrow(LastOwnerError);
    // state must be unchanged after the throw
    expect(members).toHaveLength(2);
  });

  it("allows removing an owner when another owner remains", () => {
    const members = [ownerMember(), ownerMember({ id: "member-owner-2", email: "owner2@example.com" })];

    const result = removeTeamMember(members, "member-owner");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("member-owner-2");
  });
});

describe("countOwners / isLastOwner", () => {
  it("counts owners scoped to a single tenant", () => {
    const members = [
      ownerMember(),
      ownerMember({ id: "other-tenant-owner", tenantId: "tenant-2", email: "other@example.com" }),
    ];

    expect(countOwners(members, TENANT_ID)).toBe(1);
  });

  it("identifies the sole owner as the last owner", () => {
    const members = [ownerMember(), editorMember()];
    expect(isLastOwner(members, "member-owner")).toBe(true);
    expect(isLastOwner(members, "member-editor")).toBe(false);
  });

  it("returns false once a second owner exists", () => {
    const members = [ownerMember(), ownerMember({ id: "member-owner-2", email: "owner2@example.com" })];
    expect(isLastOwner(members, "member-owner")).toBe(false);
  });

  it("returns false for a memberId that does not exist", () => {
    const members = [ownerMember()];
    expect(isLastOwner(members, "does-not-exist")).toBe(false);
  });

  it("scoped tenant with zero owners (e.g. empty member list) counts as 0, not an error", () => {
    expect(countOwners([], TENANT_ID)).toBe(0);
  });
});

describe("role-permission checks", () => {
  it("canEdit is true for active owners and editors, false for viewers", () => {
    expect(canEdit(ownerMember())).toBe(true);
    expect(canEdit(editorMember())).toBe(true);
    expect(canEdit(editorMember({ role: "viewer" }))).toBe(false);
  });

  it("canEdit is false while the invite is still pending", () => {
    expect(canEdit(editorMember({ status: "pending", joinedAt: undefined }))).toBe(false);
  });

  it("canView is true for any active member regardless of role", () => {
    expect(canView(editorMember({ role: "viewer" }))).toBe(true);
    expect(canView(editorMember({ status: "pending", joinedAt: undefined }))).toBe(false);
  });

  it("canManageTeam is true only for an active owner", () => {
    expect(canManageTeam(ownerMember())).toBe(true);
    expect(canManageTeam(editorMember())).toBe(false);
    expect(canManageTeam(ownerMember({ status: "pending", joinedAt: undefined }))).toBe(false);
  });
});
