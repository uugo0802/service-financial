import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrendPoint } from "@/lib/tax/salesTrend";
import {
  EMPTY_PARTNER_REFERRAL_FORM,
  PARTNER_CATEGORIES,
  PartnerReferralFormValues,
  getPartnerCategory,
  isPartnerReferralFormValid,
  recommendPartnerCategories,
  submitPartnerReferralForm,
  validatePartnerReferralForm,
} from "./partnerReferral";

function trend(points: Array<Partial<TrendPoint> & { key: string }>): TrendPoint[] {
  return points.map((p) => ({ income: 0, expense: 0, profit: 0, ...p }));
}

function values(overrides: Partial<PartnerReferralFormValues> = {}): PartnerReferralFormValues {
  return {
    ...EMPTY_PARTNER_REFERRAL_FORM,
    name: "山田 太郎",
    email: "taro@example.com",
    phone: "090-1234-5678",
    entityType: "corp",
    category: "investment",
    message: "余剰資金の運用先について、提携先からの情報提供を受けたいです。",
    consent: true,
    ...overrides,
  };
}

describe("PARTNER_CATEGORIES / getPartnerCategory", () => {
  it("defines exactly investment, insurance, loan, and realestate", () => {
    expect(PARTNER_CATEGORIES.map((c) => c.id).sort()).toEqual(
      ["insurance", "investment", "loan", "realestate"].sort(),
    );
  });

  it("looks up a category definition by id", () => {
    expect(getPartnerCategory("loan").label).toBe("ローン");
  });

  it("throws for an unknown category id", () => {
    // @ts-expect-error - invalid id on purpose
    expect(() => getPartnerCategory("crypto")).toThrow(/unknown partner category id/);
  });
});

describe("recommendPartnerCategories", () => {
  it("returns nothing when there is no trend data", () => {
    expect(recommendPartnerCategories([])).toEqual([]);
  });

  it("returns nothing for a single loss-making year", () => {
    const result = recommendPartnerCategories(trend([{ key: "2025", income: 1_000_000, profit: -100_000 }]));
    expect(result).toEqual([]);
  });

  it("recommends insurance only for modest continuous profit", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 3_000_000, profit: 300_000 },
        { key: "2025", income: 3_100_000, profit: 300_000 },
      ]),
    );
    expect(result).toEqual(["insurance"]);
  });

  it("adds investment once average recent profit clears the threshold", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 8_000_000, profit: 1_200_000 },
        { key: "2025", income: 8_200_000, profit: 1_300_000 },
      ]),
    );
    expect(result).toEqual(["investment", "insurance"]);
  });

  it("adds realestate once average recent profit clears the higher threshold", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 30_000_000, profit: 6_000_000 },
        { key: "2025", income: 31_000_000, profit: 5_500_000 },
      ]),
    );
    expect(result).toEqual(["investment", "insurance", "realestate"]);
  });

  it("does not recommend insurance/investment/realestate if the latest year is not profitable", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 30_000_000, profit: 6_000_000 },
        { key: "2025", income: 5_000_000, profit: -1_000_000 },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("recommends loan when revenue grows fast year over year, even if not profitable yet", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 2_000_000, profit: -200_000 },
        { key: "2025", income: 3_000_000, profit: -100_000 },
      ]),
    );
    expect(result).toEqual(["loan"]);
  });

  it("does not recommend loan for modest revenue growth below the threshold", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2024", income: 2_000_000, profit: 300_000 },
        { key: "2025", income: 2_100_000, profit: 300_000 },
      ]),
    );
    expect(result.includes("loan")).toBe(false);
  });

  it("can recommend multiple categories at once, in PARTNER_CATEGORIES order", () => {
    const result = recommendPartnerCategories(
      trend([
        { key: "2023", income: 20_000_000, profit: 4_000_000 },
        { key: "2024", income: 25_000_000, profit: 5_500_000 },
        { key: "2025", income: 32_000_000, profit: 6_000_000 },
      ]),
    );
    expect(result).toEqual(["investment", "insurance", "loan", "realestate"]);
  });

  it("sorts unsorted input by key before evaluating", () => {
    const ascending = recommendPartnerCategories(
      trend([
        { key: "2024", income: 8_000_000, profit: 1_200_000 },
        { key: "2025", income: 8_200_000, profit: 1_300_000 },
      ]),
    );
    const descending = recommendPartnerCategories(
      trend([
        { key: "2025", income: 8_200_000, profit: 1_300_000 },
        { key: "2024", income: 8_000_000, profit: 1_200_000 },
      ]),
    );
    expect(descending).toEqual(ascending);
  });
});

describe("validatePartnerReferralForm", () => {
  it("returns no errors for a fully valid submission", () => {
    const errors = validatePartnerReferralForm(values());
    expect(errors).toEqual({});
    expect(isPartnerReferralFormValid(errors)).toBe(true);
  });

  it("treats phone as optional", () => {
    const errors = validatePartnerReferralForm(values({ phone: "" }));
    expect(errors.phone).toBeUndefined();
    expect(isPartnerReferralFormValid(errors)).toBe(true);
  });

  it("requires name", () => {
    const errors = validatePartnerReferralForm(values({ name: "   " }));
    expect(errors.name).toBe("お名前・法人名を入力してください。");
  });

  it("rejects an overly long name", () => {
    const errors = validatePartnerReferralForm(values({ name: "あ".repeat(61) }));
    expect(errors.name).toMatch(/60文字以内/);
  });

  it("requires a valid email format", () => {
    expect(validatePartnerReferralForm(values({ email: "" })).email).toBe(
      "メールアドレスを入力してください。",
    );
    expect(validatePartnerReferralForm(values({ email: "not-an-email" })).email).toBe(
      "メールアドレスの形式が正しくありません。",
    );
    expect(validatePartnerReferralForm(values({ email: "ok@example.com" })).email).toBeUndefined();
  });

  it("rejects an invalid phone number when provided", () => {
    const errors = validatePartnerReferralForm(values({ phone: "abc-defg" }));
    expect(errors.phone).toMatch(/電話番号/);
  });

  it("requires a category to be selected", () => {
    const errors = validatePartnerReferralForm(values({ category: "" }));
    expect(errors.category).toBe("ご興味のあるカテゴリを選択してください。");
  });

  it("requires a message with enough detail", () => {
    expect(validatePartnerReferralForm(values({ message: "" })).message).toBe(
      "ご相談内容の詳細を入力してください。",
    );
    expect(validatePartnerReferralForm(values({ message: "短い" })).message).toMatch(/20文字以上/);
  });

  it("rejects an overly long message", () => {
    const errors = validatePartnerReferralForm(values({ message: "あ".repeat(2001) }));
    expect(errors.message).toMatch(/2000文字以内/);
  });

  it("requires consent to be checked", () => {
    const errors = validatePartnerReferralForm(values({ consent: false }));
    expect(errors.consent).toBe("提携先への情報連携について同意が必要です。");
  });

  it("collects multiple errors at once", () => {
    const errors = validatePartnerReferralForm(
      values({ name: "", email: "", category: "", message: "", consent: false }),
    );
    expect(Object.keys(errors).sort()).toEqual(["category", "consent", "email", "message", "name"]);
    expect(isPartnerReferralFormValid(errors)).toBe(false);
  });
});

describe("submitPartnerReferralForm", () => {
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
    const result = await submitPartnerReferralForm(input);
    expect(result.values).toEqual(input);
    expect(result.submittedAt).toBe("2026-07-25T00:00:00.000Z");
    expect(console.info).toHaveBeenCalledWith(
      "[partner-referral] submission (mock)",
      expect.objectContaining({ values: input }),
    );
  });
});
