import { describe, expect, it } from "vitest";
import {
  getCrossSellRecommendations,
  INVESTMENT_PROFIT_THRESHOLD_YEN,
  REAL_ESTATE_PROFIT_THRESHOLD_YEN,
  type CrossSellRecommendation,
} from "./crossSell";

function categories(items: CrossSellRecommendation[]): string[] {
  return items.map((i) => i.category);
}

describe("getCrossSellRecommendations", () => {
  it("returns no recommendations when there is no data (null profit)", () => {
    expect(getCrossSellRecommendations({ annualProfitYen: null })).toEqual([]);
  });

  it("returns no recommendations for non-finite profit values", () => {
    expect(getCrossSellRecommendations({ annualProfitYen: NaN })).toEqual([]);
    expect(getCrossSellRecommendations({ annualProfitYen: Infinity })).toEqual([]);
  });

  it("returns only the loan item for negative profit with no cash trend given", () => {
    const result = getCrossSellRecommendations({ annualProfitYen: -500_000 });
    expect(categories(result)).toEqual(["loan"]);
  });

  it("returns nothing for exactly zero profit with a flat cash trend", () => {
    const result = getCrossSellRecommendations({ annualProfitYen: 0, cashTrend: "flat" });
    expect(result).toEqual([]);
  });

  it("adds the loan item for zero/positive profit when cash trend is decreasing", () => {
    const result = getCrossSellRecommendations({ annualProfitYen: 0, cashTrend: "decreasing" });
    expect(categories(result)).toEqual(["loan"]);
  });

  it("adds the insurance item once profit is positive, below the investment threshold", () => {
    const result = getCrossSellRecommendations({ annualProfitYen: 1_000_000 });
    expect(categories(result)).toEqual(["insurance"]);
  });

  it("does not duplicate the loan item when both profit is negative and cash trend is decreasing", () => {
    const result = getCrossSellRecommendations({ annualProfitYen: -100_000, cashTrend: "decreasing" });
    expect(categories(result)).toEqual(["loan"]);
  });

  it("adds the investment item exactly at the investment profit threshold (boundary, inclusive)", () => {
    const below = getCrossSellRecommendations({ annualProfitYen: INVESTMENT_PROFIT_THRESHOLD_YEN - 1 });
    expect(categories(below)).toEqual(["insurance"]);

    const atThreshold = getCrossSellRecommendations({ annualProfitYen: INVESTMENT_PROFIT_THRESHOLD_YEN });
    expect(categories(atThreshold)).toEqual(["insurance", "investment"]);
  });

  it("adds the real estate item only at/above its threshold when cash trend is not decreasing", () => {
    const below = getCrossSellRecommendations({
      annualProfitYen: REAL_ESTATE_PROFIT_THRESHOLD_YEN - 1,
      cashTrend: "increasing",
    });
    expect(categories(below)).toEqual(["insurance", "investment"]);

    const atThreshold = getCrossSellRecommendations({
      annualProfitYen: REAL_ESTATE_PROFIT_THRESHOLD_YEN,
      cashTrend: "increasing",
    });
    expect(categories(atThreshold)).toEqual(["insurance", "investment", "realEstate"]);
  });

  it("suppresses the real estate item when cash trend is decreasing, even above the threshold", () => {
    const result = getCrossSellRecommendations({
      annualProfitYen: REAL_ESTATE_PROFIT_THRESHOLD_YEN + 1_000_000,
      cashTrend: "decreasing",
    });
    expect(categories(result)).toEqual(["loan", "insurance", "investment"]);
  });

  it("returns all four categories for a highly profitable, cash-healthy business", () => {
    const result = getCrossSellRecommendations({
      annualProfitYen: REAL_ESTATE_PROFIT_THRESHOLD_YEN + 5_000_000,
      cashTrend: "increasing",
    });
    expect(categories(result)).toEqual(["insurance", "investment", "realEstate"]);
  });

  it("every recommendation has a non-empty disclaimer mentioning it is not individualized advice, and no named products/companies", () => {
    const result = getCrossSellRecommendations({
      annualProfitYen: REAL_ESTATE_PROFIT_THRESHOLD_YEN + 5_000_000,
      cashTrend: "increasing",
    });
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.disclaimer).toContain("個別");
      expect(item.disclaimer).toContain("専門家");
      // 実在しそうな固有の会社名・商品名を含まないことの簡易チェック
      expect(item.title + item.description).not.toMatch(/freee|マネーフォワード|楽天|SBI|三井住友/);
    }
  });

  it("produces a deterministic, stable ordering for the same input", () => {
    const input = { annualProfitYen: 9_000_000, cashTrend: "flat" as const };
    const first = getCrossSellRecommendations(input);
    const second = getCrossSellRecommendations(input);
    expect(first).toEqual(second);
  });
});
