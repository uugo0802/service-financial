import { describe, expect, it } from "vitest";
import { calculateBonusWithholding } from "./bonusWithholding";

describe("calculateBonusWithholding", () => {
  it("returns zero withholding tax when the previous month's base is below the minimum threshold (68,000円)", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 67_000,
      dependentCount: 0,
    });

    expect(result.appliedRatePercent).toBe(0);
    expect(result.withholdingTax).toBe(0);
    expect(result.netPay).toBe(500_000);
  });

  it("applies the first non-zero bracket rate when the previous month's base is exactly at the boundary (300,000円)", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(result.appliedRatePercent).toBe(5.105);
    // 500,000 * 5.105% = 25,525
    expect(result.withholdingTax).toBe(25_525);
    expect(result.netPay).toBe(500_000 - 25_525);
  });

  it("jumps to the next bracket rate once the previous month's base exceeds a boundary", () => {
    const atBoundary = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });
    const justAbove = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_001,
      dependentCount: 0,
    });

    // Unlike the monthly withholding approximation (which uses a continuous
    // rate*base - deduction formula), the bonus rate table applies the rate
    // directly with no deduction, so crossing a bracket boundary in the
    // previous month's salary causes a real jump in the bonus tax amount.
    expect(atBoundary.appliedRatePercent).toBe(5.105);
    expect(justAbove.appliedRatePercent).toBe(10.21);
    expect(justAbove.withholdingTax).toBeGreaterThan(atBoundary.withholdingTax);
  });

  it("subtracts social insurance premiums on the bonus before computing the taxable base", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 45_000,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(result.bonusTaxableBase).toBe(455_000);
    // 455,000 * 5.105% = 23,227.75 → 23,227円
    expect(result.withholdingTax).toBe(23_227);
    expect(result.netPay).toBe(500_000 - 45_000 - 23_227);
  });

  it("reduces the applied rate bracket as the number of dependents increases", () => {
    const zeroDependents = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 332_000,
      dependentCount: 0,
    });
    const oneDependent = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 332_000,
      dependentCount: 1,
    });

    expect(zeroDependents.appliedRatePercent).toBe(10.21);
    expect(oneDependent.dependentDeductionApplied).toBe(32_000);
    expect(oneDependent.appliedRatePercent).toBe(5.105);
    expect(oneDependent.withholdingTax).toBeLessThan(zeroDependents.withholdingTax);
  });

  it("caps the dependent deduction at the previous month's base instead of going negative", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 50_000,
      dependentCount: 5, // requested deduction (160,000円) far exceeds the previous month's base
    });

    expect(result.dependentDeductionApplied).toBe(50_000);
    expect(result.appliedRatePercent).toBe(0);
    expect(result.withholdingTax).toBe(0);
  });

  it("computes a plausible amount for a high previous-month salary (top bracket)", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 4_000_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 4_000_000,
      dependentCount: 0,
    });

    expect(result.appliedRatePercent).toBe(45.945);
    // 4,000,000 * 45.945% = 1,837,800
    expect(result.withholdingTax).toBe(1_837_800);
  });

  it("warns when the bonus taxable base exceeds 10x the previous month's salary", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 600_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 50_000,
      dependentCount: 0,
    });

    expect(result.assumptions.some((a) => a.includes("実額とのずれが大きくなる可能性が高い"))).toBe(true);
  });

  it("does not add the 10x-ratio-specific warning when the bonus is within a normal range", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 400_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(result.assumptions.some((a) => a.includes("実額とのずれが大きくなる可能性が高い"))).toBe(false);
  });

  it("warns when there is no previous month's salary", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 0,
      dependentCount: 0,
    });

    expect(result.appliedRatePercent).toBe(0);
    expect(result.assumptions.some((a) => a.includes("前月の給与がない場合"))).toBe(true);
  });

  it("includes assumptions describing the approximation, 復興特別所得税 fold-in, and 年末調整 exclusion", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("復興特別所得税"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("年末調整"))).toBe(true);
  });

  it("throws for negative bonus gross amount", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: -1,
        bonusInsurancePremium: 0,
        previousMonthSalaryAfterInsurance: 300_000,
        dependentCount: 0,
      })
    ).toThrow();
  });

  it("throws for a non-finite bonus gross amount", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: NaN,
        bonusInsurancePremium: 0,
        previousMonthSalaryAfterInsurance: 300_000,
        dependentCount: 0,
      })
    ).toThrow();
  });

  it("throws for a negative dependent count", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: 500_000,
        bonusInsurancePremium: 0,
        previousMonthSalaryAfterInsurance: 300_000,
        dependentCount: -1,
      })
    ).toThrow();
  });

  it("throws for a non-integer dependent count", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: 500_000,
        bonusInsurancePremium: 0,
        previousMonthSalaryAfterInsurance: 300_000,
        dependentCount: 1.5,
      })
    ).toThrow();
  });

  it("throws for a negative previous month salary", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: 500_000,
        bonusInsurancePremium: 0,
        previousMonthSalaryAfterInsurance: -1,
        dependentCount: 0,
      })
    ).toThrow();
  });

  it("throws when bonus insurance premium exceeds the bonus gross amount", () => {
    expect(() =>
      calculateBonusWithholding({
        bonusGrossAmount: 100_000,
        bonusInsurancePremium: 200_000,
        previousMonthSalaryAfterInsurance: 300_000,
        dependentCount: 0,
      })
    ).toThrow();
  });

  it("returns zero withholding and full net pay for a zero bonus", () => {
    const result = calculateBonusWithholding({
      bonusGrossAmount: 0,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(result.withholdingTax).toBe(0);
    expect(result.netPay).toBe(0);
  });
});
