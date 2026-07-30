import { describe, expect, it } from "vitest";
import {
  buildReferralShareUrl,
  createInviteRecord,
  generateReferralCode,
  InvalidInviteTransitionError,
  isRewardEligible,
  markInviteJoined,
  markInviteRewarded,
  summarizeInvites,
  tryMarkInviteRewarded,
} from "./inviteProgram";

describe("generateReferralCode", () => {
  it("is deterministic for the same userId", () => {
    expect(generateReferralCode("user-123")).toBe(generateReferralCode("user-123"));
  });

  it("produces different codes for different userIds", () => {
    expect(generateReferralCode("user-123")).not.toBe(generateReferralCode("user-456"));
  });

  it("returns an 8-character uppercase alphanumeric code", () => {
    const code = generateReferralCode("shugo@example.com");
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("trims surrounding whitespace before hashing, so it doesn't affect the result", () => {
    expect(generateReferralCode("  user-123  ")).toBe(generateReferralCode("user-123"));
  });

  it("throws on an empty userId", () => {
    expect(() => generateReferralCode("")).toThrow();
    expect(() => generateReferralCode("   ")).toThrow();
  });

  it("never includes visually-ambiguous characters (0, 1, I, O)", () => {
    const userIds = Array.from({ length: 50 }, (_, i) => `user-${i}@example.com`);
    for (const userId of userIds) {
      expect(generateReferralCode(userId)).not.toMatch(/[01IO]/);
    }
  });
});

describe("buildReferralShareUrl", () => {
  it("builds a relative path when no origin is given", () => {
    expect(buildReferralShareUrl("ABC12345")).toBe("/invite?ref=ABC12345");
  });

  it("builds an absolute URL when an origin is given, stripping a trailing slash", () => {
    expect(buildReferralShareUrl("ABC12345", "https://example.com/")).toBe("https://example.com/invite?ref=ABC12345");
  });

  it("falls back to a relative path when origin is an empty string (falsy)", () => {
    expect(buildReferralShareUrl("ABC12345", "")).toBe("/invite?ref=ABC12345");
  });

  it("URL-encodes a referral code containing characters that are unsafe in a query string", () => {
    expect(buildReferralShareUrl("AB C+12/34")).toBe("/invite?ref=AB%20C%2B12%2F34");
  });
});

describe("createInviteRecord", () => {
  it("creates a pending invite with a referral code derived from the referrer", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com", now });

    expect(invite.status).toBe("pending");
    expect(invite.referralCode).toBe(generateReferralCode("user-123"));
    expect(invite.referrerUserId).toBe("user-123");
    expect(invite.inviteeContact).toBe("friend@example.com");
    expect(invite.createdAt).toBe(now.toISOString());
    expect(invite.rewards).toEqual([]);
    expect(invite.joinedAt).toBeUndefined();
    expect(invite.rewardedAt).toBeUndefined();
  });

  it("trims whitespace from referrerUserId and inviteeContact", () => {
    const invite = createInviteRecord({ referrerUserId: "  user-123  ", inviteeContact: "  friend@example.com  " });
    expect(invite.referrerUserId).toBe("user-123");
    expect(invite.inviteeContact).toBe("friend@example.com");
  });

  it("throws when referrerUserId or inviteeContact is empty", () => {
    expect(() => createInviteRecord({ referrerUserId: "", inviteeContact: "friend@example.com" })).toThrow();
    expect(() => createInviteRecord({ referrerUserId: "user-123", inviteeContact: "  " })).toThrow();
  });
});

describe("markInviteJoined", () => {
  it("transitions a pending invite to joined", () => {
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" });
    const now = new Date("2026-07-02T00:00:00.000Z");

    const joined = markInviteJoined(invite, now);

    expect(joined.status).toBe("joined");
    expect(joined.joinedAt).toBe(now.toISOString());
    // 元のオブジェクトは変更しない（イミュータブル）
    expect(invite.status).toBe("pending");
  });

  it("throws InvalidInviteTransitionError when the invite is not pending", () => {
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" });
    const joined = markInviteJoined(invite);

    expect(() => markInviteJoined(joined)).toThrow(InvalidInviteTransitionError);
  });
});

describe("isRewardEligible", () => {
  it("returns false while the invite is still pending, even if the qualifying action happened", () => {
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" });
    expect(isRewardEligible(invite, { refereeCompletedFirstCsvImport: true })).toBe(false);
  });

  it("returns false when joined but the qualifying action has not happened", () => {
    const invite = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" }));
    expect(isRewardEligible(invite, { refereeCompletedFirstCsvImport: false })).toBe(false);
  });

  it("returns true when joined and the friend completed their first CSV import", () => {
    const invite = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" }));
    expect(isRewardEligible(invite, { refereeCompletedFirstCsvImport: true })).toBe(true);
  });
});

describe("markInviteRewarded", () => {
  it("grants a free month to both the referrer and the referee when eligible", () => {
    const joined = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" }));
    const now = new Date("2026-07-03T00:00:00.000Z");

    const rewarded = markInviteRewarded(joined, { refereeCompletedFirstCsvImport: true }, now);

    expect(rewarded.status).toBe("rewarded");
    expect(rewarded.rewardedAt).toBe(now.toISOString());
    expect(rewarded.rewards).toEqual([
      { type: "free_month", grantedTo: "referrer" },
      { type: "free_month", grantedTo: "referee" },
    ]);
  });

  it("throws InvalidInviteTransitionError when not eligible (still pending)", () => {
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" });
    expect(() => markInviteRewarded(invite, { refereeCompletedFirstCsvImport: true })).toThrow(InvalidInviteTransitionError);
  });

  it("throws InvalidInviteTransitionError when joined but the qualifying action hasn't happened", () => {
    const joined = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" }));
    expect(() => markInviteRewarded(joined, { refereeCompletedFirstCsvImport: false })).toThrow(InvalidInviteTransitionError);
  });
});

describe("tryMarkInviteRewarded", () => {
  it("returns the invite unchanged when not eligible instead of throwing", () => {
    const invite = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" });
    const result = tryMarkInviteRewarded(invite, { refereeCompletedFirstCsvImport: true });
    expect(result).toEqual(invite);
  });

  it("rewards the invite when eligible", () => {
    const joined = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "friend@example.com" }));
    const result = tryMarkInviteRewarded(joined, { refereeCompletedFirstCsvImport: true });
    expect(result.status).toBe("rewarded");
  });
});

describe("summarizeInvites", () => {
  it("counts invites by status and totals the referrer's earned free months", () => {
    const pending = createInviteRecord({ referrerUserId: "user-123", inviteeContact: "a@example.com" });
    const joined = markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "b@example.com" }));
    const rewarded = markInviteRewarded(
      markInviteJoined(createInviteRecord({ referrerUserId: "user-123", inviteeContact: "c@example.com" })),
      { refereeCompletedFirstCsvImport: true },
    );

    const summary = summarizeInvites([pending, joined, rewarded]);

    expect(summary).toEqual({ total: 3, pending: 1, joined: 1, rewarded: 1, freeMonthsEarned: 1 });
  });

  it("returns all zeros for an empty list", () => {
    expect(summarizeInvites([])).toEqual({ total: 0, pending: 0, joined: 0, rewarded: 0, freeMonthsEarned: 0 });
  });
});
