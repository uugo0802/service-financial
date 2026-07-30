import { describe, expect, it } from "vitest";
import { calculateMonthlyWithholding } from "./withholding";

describe("calculateMonthlyWithholding", () => {
  it("returns zero withholding tax when the taxable base is at or below the minimum threshold (88,000円)", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 88_000,
      dependentCount: 0,
      insurancePremium: 0,
    });

    expect(result.taxableBase).toBe(88_000);
    expect(result.withholdingTax).toBe(0);
    expect(result.netPay).toBe(88_000);
  });

  it("computes withholding tax for a mid-range monthly director compensation with no dependents", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 0,
      insurancePremium: 0,
    });

    expect(result.taxableBase).toBe(300_000);
    expect(result.dependentDeductionApplied).toBe(0);
    // 300,000 * 5.105% - 4,492.4 = 10,822.6 → 円未満切り捨てで10,822円
    expect(result.withholdingTax).toBe(10_822);
    expect(result.netPay).toBe(300_000 - 10_822);
  });

  it("subtracts social insurance premiums before computing the taxable base", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 0,
      insurancePremium: 45_000,
    });

    expect(result.taxableBase).toBe(255_000);
    // 255,000 * 5.105% - 4,492.4 = 13,017.75 - 4,492.4 = 8,525.35 → 8,525円
    expect(result.withholdingTax).toBe(8_525);
    expect(result.netPay).toBe(300_000 - 45_000 - 8_525);
  });

  it("reduces withholding tax as the number of dependents increases", () => {
    const zeroDependents = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 0,
      insurancePremium: 0,
    });
    const oneDependent = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 1,
      insurancePremium: 0,
    });

    expect(oneDependent.dependentDeductionApplied).toBe(32_000);
    // 268,000 * 5.105% - 4,492.4 = 13,681.4 - 4,492.4 = 9,189.0 → 9,189円
    expect(oneDependent.withholdingTax).toBe(9_189);
    expect(oneDependent.withholdingTax).toBeLessThan(zeroDependents.withholdingTax);
  });

  it("caps the dependent deduction at the taxable base instead of going negative", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 50_000,
      dependentCount: 5, // requested deduction (160,000円) far exceeds the taxable base
      insurancePremium: 0,
    });

    expect(result.dependentDeductionApplied).toBe(50_000);
    expect(result.withholdingTax).toBe(0);
    expect(result.netPay).toBe(50_000);
  });

  it("supports more than 7 dependents (0-7+) by continuing the same linear approximation", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 500_000,
      dependentCount: 8,
      insurancePremium: 0,
    });

    expect(result.dependentDeductionApplied).toBe(8 * 32_000);
    expect(result.taxableBase).toBe(500_000);
    expect(result.withholdingTax).toBeGreaterThanOrEqual(0);
  });

  it("keeps the bracket formula continuous at the 550,000/1,000,000/2,000,000/3,500,000 boundaries", () => {
    for (const boundary of [550_000, 1_000_000, 2_000_000, 3_500_000]) {
      const below = calculateMonthlyWithholding({
        monthlyGrossCompensation: boundary,
        dependentCount: 0,
        insurancePremium: 0,
      });
      const above = calculateMonthlyWithholding({
        monthlyGrossCompensation: boundary + 1,
        dependentCount: 0,
        insurancePremium: 0,
      });

      // Neighbouring yen amounts across a bracket boundary should produce withholding
      // tax that differs by at most a few yen, not jump discontinuously.
      expect(Math.abs(above.withholdingTax - below.withholdingTax)).toBeLessThanOrEqual(2);
    }
  });

  it("computes a plausible amount for a high monthly director compensation (top bracket)", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 4_000_000,
      dependentCount: 0,
      insurancePremium: 0,
    });

    // 4,000,000 * 45.945% - 560,937.4 = 1,837,800 - 560,937.4 = 1,276,862.6 → 1,276,862円
    expect(result.withholdingTax).toBe(1_276_862);
    expect(result.netPay).toBe(4_000_000 - 1_276_862);
  });

  it("includes assumptions describing the approximation and the 復興特別所得税 fold-in", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 0,
      insurancePremium: 0,
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("復興特別所得税"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("年末調整"))).toBe(true);
  });

  it("throws for negative gross compensation", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: -1, dependentCount: 0, insurancePremium: 0 })
    ).toThrow();
  });

  it("throws for a non-finite gross compensation", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: NaN, dependentCount: 0, insurancePremium: 0 })
    ).toThrow();
  });

  it("throws for a negative dependent count", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 300_000, dependentCount: -1, insurancePremium: 0 })
    ).toThrow();
  });

  it("throws for a non-integer dependent count", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 300_000, dependentCount: 1.5, insurancePremium: 0 })
    ).toThrow();
  });

  it("throws for negative insurance premium", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 300_000, dependentCount: 0, insurancePremium: -1 })
    ).toThrow();
  });

  it("throws when insurance premium exceeds gross compensation", () => {
    expect(() =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 100_000, dependentCount: 0, insurancePremium: 200_000 })
    ).toThrow();
  });

  it("returns zero withholding and full net pay for zero compensation", () => {
    const result = calculateMonthlyWithholding({
      monthlyGrossCompensation: 0,
      dependentCount: 0,
      insurancePremium: 0,
    });

    expect(result.withholdingTax).toBe(0);
    expect(result.netPay).toBe(0);
  });
});
