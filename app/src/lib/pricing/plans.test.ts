import { describe, expect, it } from "vitest";
import { PRICING_PLANS, PricingPlan, TAX_ACCOUNTANT_MONTHLY_FEE_RANGE } from "./plans";

describe("PRICING_PLANS", () => {
  it("is non-empty and contains at least a freelance and a micro-corporation plan", () => {
    expect(PRICING_PLANS.length).toBeGreaterThanOrEqual(2);
    expect(PRICING_PLANS.some((p) => p.id === "freelance")).toBe(true);
    expect(PRICING_PLANS.some((p) => p.id === "micro-corp")).toBe(true);
  });

  it("has unique plan ids", () => {
    const ids = PRICING_PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-negative monthly prices", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.monthlyPriceFrom).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(plan.monthlyPriceFrom)).toBe(true);
    }
  });

  it("has a non-empty feature list with non-blank entries for every plan", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.features.length).toBeGreaterThan(0);
      for (const feature of plan.features) {
        expect(feature.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("has non-blank name and targetSegment for every plan", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.name.trim().length).toBeGreaterThan(0);
      expect(plan.targetSegment.trim().length).toBeGreaterThan(0);
    }
  });

  it("matches the business-plan.md §8 starting price points (freelance from ¥980, micro-corp from ¥2,980)", () => {
    const freelance = PRICING_PLANS.find((p) => p.id === "freelance") as PricingPlan;
    const microCorp = PRICING_PLANS.find((p) => p.id === "micro-corp") as PricingPlan;

    expect(freelance.monthlyPriceFrom).toBe(980);
    expect(microCorp.monthlyPriceFrom).toBe(2980);
  });

  it("keeps every plan cheaper than the low end of the typical tax-accountant retainer range", () => {
    // business-plan.md §8: 税理士顧問料（月2〜5万円）より圧倒的に安い月額、という差別化の前提を
    // データレベルでも壊さないようにする（将来価格改定で前提が崩れたら気付けるようにするための回帰テスト）。
    for (const plan of PRICING_PLANS) {
      expect(plan.monthlyPriceFrom).toBeLessThan(TAX_ACCOUNTANT_MONTHLY_FEE_RANGE.minYen);
    }
  });

  it("does not duplicate feature strings within a single plan", () => {
    for (const plan of PRICING_PLANS) {
      expect(new Set(plan.features).size).toBe(plan.features.length);
    }
  });
});
