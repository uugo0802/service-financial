import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PasswordResetError,
  buildPasswordResetUrl,
  checkPasswordStrength,
  createPasswordResetRequest,
  describeInvalidReason,
  isPasswordResetTokenExpired,
  resetPassword,
  validatePasswordResetToken,
} from "./passwordReset";

const STRONG_PASSWORD = "Str0ng!Passw0rd";

describe("createPasswordResetRequest", () => {
  it("creates a token record with a normalized email and default TTL", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const record = createPasswordResetRequest({ email: "  User@Example.com  ", now });

    expect(record.email).toBe("user@example.com");
    expect(record.createdAt).toBe(now.toISOString());
    expect(record.expiresAt).toBe(new Date("2026-07-31T00:30:00.000Z").toISOString());
    expect(record.used).toBe(false);
    expect(record.token).toBeTruthy();
  });

  it("generates a different token on each call when none is provided", () => {
    const a = createPasswordResetRequest({ email: "user@example.com" });
    const b = createPasswordResetRequest({ email: "user@example.com" });
    expect(a.token).not.toBe(b.token);
  });

  it("uses a provided token and ttlMinutes override", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const record = createPasswordResetRequest({ email: "user@example.com", now, token: "fixed-token", ttlMinutes: 5 });

    expect(record.token).toBe("fixed-token");
    expect(record.expiresAt).toBe(new Date("2026-07-31T00:05:00.000Z").toISOString());
  });

  it("throws a PasswordResetError on an empty email", () => {
    expect(() => createPasswordResetRequest({ email: "" })).toThrow(PasswordResetError);
    expect(() => createPasswordResetRequest({ email: "   " })).toThrow(PasswordResetError);
  });

  it("throws a PasswordResetError on an email without an @", () => {
    expect(() => createPasswordResetRequest({ email: "not-an-email" })).toThrow(PasswordResetError);
  });
});

describe("buildPasswordResetUrl", () => {
  it("builds a relative path when no origin is given", () => {
    expect(buildPasswordResetUrl("abc123")).toBe("/reset-password?token=abc123");
  });

  it("builds an absolute URL when an origin is given, stripping a trailing slash", () => {
    expect(buildPasswordResetUrl("abc123", "https://example.com/")).toBe("https://example.com/reset-password?token=abc123");
  });

  it("URL-encodes a token containing characters that are unsafe in a query string", () => {
    expect(buildPasswordResetUrl("ab c+12/34")).toBe("/reset-password?token=ab%20c%2B12%2F34");
  });
});

describe("isPasswordResetTokenExpired", () => {
  it("is false before the expiry time", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", now: new Date("2026-07-31T00:00:00.000Z") });
    expect(isPasswordResetTokenExpired(record, new Date("2026-07-31T00:29:59.000Z"))).toBe(false);
  });

  it("is true after the expiry time", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", now: new Date("2026-07-31T00:00:00.000Z") });
    expect(isPasswordResetTokenExpired(record, new Date("2026-07-31T00:30:01.000Z"))).toBe(true);
  });
});

describe("validatePasswordResetToken", () => {
  it("returns valid:true for a fresh, matching, unused token", () => {
    const record = createPasswordResetRequest({
      email: "user@example.com",
      now: new Date("2026-07-31T00:00:00.000Z"),
      token: "tok-1",
    });

    expect(validatePasswordResetToken(record, "tok-1", new Date("2026-07-31T00:01:00.000Z"))).toEqual({ valid: true });
  });

  it("returns reason:'invalid' when no record is found", () => {
    expect(validatePasswordResetToken(null, "tok-1")).toEqual({ valid: false, reason: "invalid" });
    expect(validatePasswordResetToken(undefined, "tok-1")).toEqual({ valid: false, reason: "invalid" });
  });

  it("returns reason:'invalid' when the token string doesn't match the record", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", token: "tok-1" });
    expect(validatePasswordResetToken(record, "wrong-token")).toEqual({ valid: false, reason: "invalid" });
  });

  it("returns reason:'expired' for a token past its expiry", () => {
    const record = createPasswordResetRequest({
      email: "user@example.com",
      now: new Date("2026-07-31T00:00:00.000Z"),
      token: "tok-1",
    });

    expect(validatePasswordResetToken(record, "tok-1", new Date("2026-07-31T01:00:00.000Z"))).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("returns reason:'used' for an already-used token, even before its expiry", () => {
    const record = { ...createPasswordResetRequest({ email: "user@example.com", token: "tok-1" }), used: true };
    expect(validatePasswordResetToken(record, "tok-1")).toEqual({ valid: false, reason: "used" });
  });
});

describe("describeInvalidReason", () => {
  it("returns a distinct Japanese message per reason", () => {
    const messages = new Set([
      describeInvalidReason("expired"),
      describeInvalidReason("used"),
      describeInvalidReason("invalid"),
    ]);
    expect(messages.size).toBe(3);
  });
});

describe("checkPasswordStrength", () => {
  it("accepts a password meeting all requirements", () => {
    expect(checkPasswordStrength(STRONG_PASSWORD)).toEqual({ valid: true, reasons: [] });
  });

  it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
    const result = checkPasswordStrength("Sh0rt!Aa");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes(`${PASSWORD_MIN_LENGTH}文字以上`))).toBe(true);
  });

  it("rejects a password with no uppercase letters", () => {
    const result = checkPasswordStrength("weakpassword1!");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("大文字"))).toBe(true);
  });

  it("rejects a password with no lowercase letters", () => {
    const result = checkPasswordStrength("WEAKPASSWORD1!");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("小文字"))).toBe(true);
  });

  it("rejects a password with no digits", () => {
    const result = checkPasswordStrength("WeakPassword!!");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("数字"))).toBe(true);
  });

  it("rejects a password with no symbols", () => {
    const result = checkPasswordStrength("WeakPassword123");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("記号"))).toBe(true);
  });

  it("accumulates every unmet requirement (e.g. an all-lowercase short password)", () => {
    const result = checkPasswordStrength("weak");
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});

describe("resetPassword", () => {
  it("resets successfully with a valid token and a strong, matching password (happy path)", () => {
    const record = createPasswordResetRequest({
      email: "user@example.com",
      now: new Date("2026-07-31T00:00:00.000Z"),
      token: "tok-1",
    });
    const now = new Date("2026-07-31T00:05:00.000Z");

    const result = resetPassword({
      record,
      token: "tok-1",
      newPassword: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
      now,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.record.used).toBe(true);
      expect(result.record.usedAt).toBe(now.toISOString());
      // 元のレコードはイミュータブルなまま
      expect(record.used).toBe(false);
    }
  });

  it("rejects an expired token", () => {
    const record = createPasswordResetRequest({
      email: "user@example.com",
      now: new Date("2026-07-31T00:00:00.000Z"),
      token: "tok-1",
    });

    const result = resetPassword({
      record,
      token: "tok-1",
      newPassword: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
      now: new Date("2026-07-31T01:00:00.000Z"),
    });

    expect(result).toEqual({ success: false, error: describeInvalidReason("expired") });
  });

  it("rejects an already-used token (single-use enforcement)", () => {
    const record = {
      ...createPasswordResetRequest({ email: "user@example.com", token: "tok-1" }),
      used: true,
      usedAt: new Date("2026-07-31T00:01:00.000Z").toISOString(),
    };

    const result = resetPassword({
      record,
      token: "tok-1",
      newPassword: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    });

    expect(result).toEqual({ success: false, error: describeInvalidReason("used") });
  });

  it("rejects reusing a token that was just consumed by a prior successful reset", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", token: "tok-1" });

    const first = resetPassword({ record, token: "tok-1", newPassword: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD });
    expect(first.success).toBe(true);

    // 呼び出し側は成功後に返された（used: true の）レコードを永続化する想定。
    const persisted = first.success ? first.record : record;
    const second = resetPassword({ record: persisted, token: "tok-1", newPassword: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD });

    expect(second).toEqual({ success: false, error: describeInvalidReason("used") });
  });

  it("rejects a weak password without consuming the token", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", token: "tok-1" });

    const result = resetPassword({ record, token: "tok-1", newPassword: "weak", confirmPassword: "weak" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("rejects mismatched confirmation password", () => {
    const record = createPasswordResetRequest({ email: "user@example.com", token: "tok-1" });

    const result = resetPassword({
      record,
      token: "tok-1",
      newPassword: STRONG_PASSWORD,
      confirmPassword: `${STRONG_PASSWORD}x`,
    });

    expect(result).toEqual({ success: false, error: "確認用パスワードが一致しません。" });
  });

  it("rejects when no matching record exists (unknown token)", () => {
    const result = resetPassword({ record: null, token: "unknown", newPassword: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD });
    expect(result).toEqual({ success: false, error: describeInvalidReason("invalid") });
  });
});
