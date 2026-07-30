import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdvisorReferralFormValues,
  EMPTY_ADVISOR_REFERRAL_FORM,
  isAdvisorReferralFormValid,
  submitAdvisorReferralForm,
  validateAdvisorReferralForm,
} from "./referralForm";

function values(overrides: Partial<AdvisorReferralFormValues> = {}): AdvisorReferralFormValues {
  return {
    ...EMPTY_ADVISOR_REFERRAL_FORM,
    name: "山田 太郎",
    email: "taro@example.com",
    phone: "090-1234-5678",
    entityType: "individual",
    topic: "確定申告全体の内容確認をしてほしい",
    message: "副業の雑所得と本業の給与所得の按分について、自動計算結果に不安があるため確認したいです。",
    consent: true,
    ...overrides,
  };
}

describe("validateAdvisorReferralForm", () => {
  it("returns no errors for a fully valid submission", () => {
    const errors = validateAdvisorReferralForm(values());
    expect(errors).toEqual({});
    expect(isAdvisorReferralFormValid(errors)).toBe(true);
  });

  it("treats phone as optional", () => {
    const errors = validateAdvisorReferralForm(values({ phone: "" }));
    expect(errors.phone).toBeUndefined();
    expect(isAdvisorReferralFormValid(errors)).toBe(true);
  });

  it("requires name", () => {
    const errors = validateAdvisorReferralForm(values({ name: "   " }));
    expect(errors.name).toBe("お名前・法人名を入力してください。");
  });

  it("rejects an overly long name", () => {
    const errors = validateAdvisorReferralForm(values({ name: "あ".repeat(61) }));
    expect(errors.name).toMatch(/60文字以内/);
  });

  it("accepts a name exactly at the 60-character limit (boundary, inclusive)", () => {
    const errors = validateAdvisorReferralForm(values({ name: "あ".repeat(60) }));
    expect(errors.name).toBeUndefined();
  });

  it("requires a valid email format", () => {
    expect(validateAdvisorReferralForm(values({ email: "" })).email).toBe(
      "メールアドレスを入力してください。",
    );
    expect(validateAdvisorReferralForm(values({ email: "not-an-email" })).email).toBe(
      "メールアドレスの形式が正しくありません。",
    );
    expect(validateAdvisorReferralForm(values({ email: "ok@example.com" })).email).toBeUndefined();
  });

  it("rejects an email with no domain suffix or with multiple @ symbols", () => {
    expect(validateAdvisorReferralForm(values({ email: "taro@example" })).email).toMatch(/形式/);
    expect(validateAdvisorReferralForm(values({ email: "ta@ro@example.com" })).email).toMatch(/形式/);
  });

  it("treats a whitespace-only email as missing rather than an invalid format", () => {
    const errors = validateAdvisorReferralForm(values({ email: "   " }));
    expect(errors.email).toBe("メールアドレスを入力してください。");
  });

  it("rejects an invalid phone number when provided", () => {
    const errors = validateAdvisorReferralForm(values({ phone: "abc-defg" }));
    expect(errors.phone).toMatch(/電話番号/);
  });

  it("rejects a phone number just below the minimum length (8 digits)", () => {
    const errors = validateAdvisorReferralForm(values({ phone: "1234-567" }));
    expect(errors.phone).toMatch(/電話番号/);
  });

  it("accepts phone numbers at the boundary lengths (9 and 15 characters)", () => {
    expect(validateAdvisorReferralForm(values({ phone: "123456789" })).phone).toBeUndefined();
    expect(validateAdvisorReferralForm(values({ phone: "123456789012345" })).phone).toBeUndefined();
  });

  it("rejects a phone number that exceeds the maximum length (16 characters)", () => {
    const errors = validateAdvisorReferralForm(values({ phone: "1234567890123456" }));
    expect(errors.phone).toMatch(/電話番号/);
  });

  it("rejects a phone number containing spaces or full-width digits", () => {
    expect(validateAdvisorReferralForm(values({ phone: "090 1234 5678" })).phone).toMatch(/電話番号/);
    expect(validateAdvisorReferralForm(values({ phone: "０９０１２３４５６７８" })).phone).toMatch(/電話番号/);
  });

  it("requires a consultation topic", () => {
    const errors = validateAdvisorReferralForm(values({ topic: "" }));
    expect(errors.topic).toBe("相談したい内容を選択してください。");
  });

  it("requires a message with enough detail", () => {
    expect(validateAdvisorReferralForm(values({ message: "" })).message).toBe(
      "相談内容の詳細を入力してください。",
    );
    expect(validateAdvisorReferralForm(values({ message: "短い" })).message).toMatch(/20文字以上/);
  });

  it("rejects an overly long message", () => {
    const errors = validateAdvisorReferralForm(values({ message: "あ".repeat(2001) }));
    expect(errors.message).toMatch(/2000文字以内/);
  });

  it("accepts a message exactly at the min (20) and max (2000) length boundaries", () => {
    expect(validateAdvisorReferralForm(values({ message: "あ".repeat(20) })).message).toBeUndefined();
    expect(validateAdvisorReferralForm(values({ message: "あ".repeat(2000) })).message).toBeUndefined();
  });

  it("rejects a message that is one character short of the minimum length", () => {
    const errors = validateAdvisorReferralForm(values({ message: "あ".repeat(19) }));
    expect(errors.message).toMatch(/20文字以上/);
  });

  it("trims surrounding whitespace before evaluating the message length requirement", () => {
    const errors = validateAdvisorReferralForm(values({ message: `  ${"あ".repeat(19)}  ` }));
    expect(errors.message).toMatch(/20文字以上/);
  });

  it("requires consent to be checked", () => {
    const errors = validateAdvisorReferralForm(values({ consent: false }));
    expect(errors.consent).toBe("提携税理士への情報連携について同意が必要です。");
  });

  it("collects multiple errors at once", () => {
    const errors = validateAdvisorReferralForm(
      values({ name: "", email: "", topic: "", message: "", consent: false }),
    );
    expect(Object.keys(errors).sort()).toEqual(["consent", "email", "message", "name", "topic"]);
    expect(isAdvisorReferralFormValid(errors)).toBe(false);
  });
});

describe("submitAdvisorReferralForm", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves with a timestamped submission payload", async () => {
    const input = values();
    const result = await submitAdvisorReferralForm(input);
    expect(result.values).toEqual(input);
    expect(result.submittedAt).toBe("2026-07-25T00:00:00.000Z");
    expect(console.info).toHaveBeenCalledWith(
      "[advisor-referral] submission (mock)",
      expect.objectContaining({ values: input }),
    );
  });
});
