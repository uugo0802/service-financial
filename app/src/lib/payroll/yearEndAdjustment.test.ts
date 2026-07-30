import { describe, expect, it } from "vitest";
import { calculateYearEndAdjustment } from "./yearEndAdjustment";

describe("calculateYearEndAdjustment", () => {
  it("computes a shortfall (徴収不足) when the withheld amount is less than the estimated annual tax", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });

    // 給与所得控除: 4,000,000 * 20% + 440,000 = 1,240,000
    expect(result.salaryIncomeDeduction).toBe(1_240_000);
    expect(result.salaryIncome).toBe(2_760_000);
    // 課税所得: 2,760,000 - 0(社保) - 480,000(基礎) - 0(扶養) = 2,280,000
    expect(result.taxableIncome).toBe(2_280_000);
    // 所得税: 2,280,000 * 10% - 97,500 = 130,500
    expect(result.incomeTax).toBe(130_500);
    // 復興特別所得税: floor(130,500 * 2.1%) = 2,740
    expect(result.reconstructionSurtax).toBe(2_740);
    expect(result.totalAnnualTaxDue).toBe(133_240);
    expect(result.alreadyWithheld).toBe(0);
    expect(result.difference).toBe(133_240);
    expect(result.outcome).toBe("shortfall");
  });

  it("computes a refund (過納還付) when the withheld amount exceeds the estimated annual tax", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 200_000,
    });

    expect(result.totalAnnualTaxDue).toBe(133_240);
    expect(result.alreadyWithheld).toBe(200_000);
    expect(result.difference).toBe(133_240 - 200_000);
    expect(result.difference).toBeLessThan(0);
    expect(result.outcome).toBe("refund");
  });

  it("accepts an array of monthly withholding amounts and sums them", () => {
    const monthly = Array(12).fill(11_000); // 132,000円合計

    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: monthly,
    });

    expect(result.alreadyWithheld).toBe(132_000);
    expect(result.difference).toBe(133_240 - 132_000);
    expect(result.outcome).toBe("shortfall");
  });

  it("returns an exact match (outcome: exact) when withheld tax equals the estimated annual tax", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 133_240,
    });

    expect(result.difference).toBe(0);
    expect(result.outcome).toBe("exact");
  });

  it("reduces taxable income and estimated tax as the number of dependents increases", () => {
    const zeroDependents = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });
    const twoDependents = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 2,
      monthlyWithholdingTotal: 0,
    });

    expect(twoDependents.dependentDeduction).toBe(760_000);
    expect(twoDependents.taxableIncome).toBeLessThan(zeroDependents.taxableIncome);
    expect(twoDependents.totalAnnualTaxDue).toBeLessThan(zeroDependents.totalAnnualTaxDue);
  });

  it("subtracts social insurance premiums before computing taxable income", () => {
    const withoutInsurance = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });
    const withInsurance = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 500_000,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });

    expect(withInsurance.taxableIncome).toBe(withoutInsurance.taxableIncome - 500_000);
    expect(withInsurance.totalAnnualTaxDue).toBeLessThan(withoutInsurance.totalAnnualTaxDue);
  });

  it("applies the flat 550,000円 salary income deduction at and below the 1,625,000円 boundary", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 1_625_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });

    expect(result.salaryIncomeDeduction).toBe(550_000);
  });

  it("computes the salary income deduction with the formula-based brackets above 1,625,000円", () => {
    const at3_600_000 = calculateYearEndAdjustment({
      annualGrossCompensation: 3_600_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });
    // 3,600,000 * 30% + 80,000 = 1,160,000
    expect(at3_600_000.salaryIncomeDeduction).toBe(1_160_000);

    const at8_500_000 = calculateYearEndAdjustment({
      annualGrossCompensation: 8_500_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });
    // 8,500,000 * 10% + 1,100,000 = 1,950,000 (上限と一致)
    expect(at8_500_000.salaryIncomeDeduction).toBe(1_950_000);
  });

  it("caps the salary income deduction at 1,950,000円 above 8,500,000円", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 20_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });

    expect(result.salaryIncomeDeduction).toBe(1_950_000);
  });

  it("returns zero taxable income and zero tax for a zero gross compensation, treating any withheld amount as a full refund", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 0,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 10_000,
    });

    expect(result.salaryIncomeDeduction).toBe(0);
    expect(result.taxableIncome).toBe(0);
    expect(result.incomeTax).toBe(0);
    expect(result.totalAnnualTaxDue).toBe(0);
    expect(result.difference).toBe(-10_000);
    expect(result.outcome).toBe("refund");
  });

  it("includes assumptions describing the excluded deductions (生命保険料控除・住宅ローン控除・ふるさと納税等)", () => {
    const result = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 0,
      dependentCount: 0,
      monthlyWithholdingTotal: 0,
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("生命保険料控除"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("住宅ローン控除"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("ふるさと納税"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("年末調整"))).toBe(true);
  });

  it("throws for negative annual gross compensation", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: -1,
        annualSocialInsurancePremium: 0,
        dependentCount: 0,
        monthlyWithholdingTotal: 0,
      })
    ).toThrow();
  });

  it("throws for a non-integer dependent count", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: 4_000_000,
        annualSocialInsurancePremium: 0,
        dependentCount: 1.5,
        monthlyWithholdingTotal: 0,
      })
    ).toThrow();
  });

  it("throws for a negative dependent count", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: 4_000_000,
        annualSocialInsurancePremium: 0,
        dependentCount: -1,
        monthlyWithholdingTotal: 0,
      })
    ).toThrow();
  });

  it("throws when annual social insurance premium exceeds annual gross compensation", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: 1_000_000,
        annualSocialInsurancePremium: 2_000_000,
        dependentCount: 0,
        monthlyWithholdingTotal: 0,
      })
    ).toThrow();
  });

  it("throws for a negative single monthlyWithholdingTotal value", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: 4_000_000,
        annualSocialInsurancePremium: 0,
        dependentCount: 0,
        monthlyWithholdingTotal: -1,
      })
    ).toThrow();
  });

  it("throws for a negative entry inside the monthlyWithholdingTotal array", () => {
    expect(() =>
      calculateYearEndAdjustment({
        annualGrossCompensation: 4_000_000,
        annualSocialInsurancePremium: 0,
        dependentCount: 0,
        monthlyWithholdingTotal: [10_000, -5_000, 10_000],
      })
    ).toThrow();
  });
});
