import { describe, expect, it } from "vitest";
import { calculateFamilyEmployeeSalary } from "./familyEmployeeSalary";

const BASE_INPUT = {
  declaredMaxAmount: 1_800_000,
  actualPaidAmount: 1_500_000,
  familyMemberBirthdate: "1990-05-10",
  taxYear: 2026,
  cohabiting: true,
  primarilyEngaged: true,
};

describe("calculateFamilyEmployeeSalary", () => {
  it("treats a fully eligible family employee within the declared cap as fully deductible", () => {
    const result = calculateFamilyEmployeeSalary(BASE_INPUT);

    expect(result.eligible).toBe(true);
    expect(result.exceedsDeclaredCap).toBe(false);
    expect(result.deductibleAmount).toBe(1_500_000);
    expect(result.eligibilityChecklist).toHaveLength(3);
    expect(result.eligibilityChecklist.every((c) => c.met)).toBe(true);
    // 扶養控除・配偶者控除との重複禁止、届出前提の注意喚起は常に含まれる
    expect(result.warnings.some((w) => w.includes("控除対象扶養親族"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("届出書"))).toBe(true);
    expect(result.notes.some((n) => n.includes("給与所得"))).toBe(true);
  });

  it("caps the deductible amount at the declared max when the actual salary exceeds it", () => {
    const result = calculateFamilyEmployeeSalary({
      ...BASE_INPUT,
      declaredMaxAmount: 1_000_000,
      actualPaidAmount: 1_200_000,
    });

    expect(result.eligible).toBe(true);
    expect(result.exceedsDeclaredCap).toBe(true);
    expect(result.deductibleAmount).toBe(1_000_000);
    expect(result.warnings.some((w) => w.includes("上限額"))).toBe(true);
  });

  it("does not flag exceedsDeclaredCap when the actual salary exactly equals the declared cap", () => {
    const result = calculateFamilyEmployeeSalary({
      ...BASE_INPUT,
      declaredMaxAmount: 1_000_000,
      actualPaidAmount: 1_000_000,
    });

    expect(result.exceedsDeclaredCap).toBe(false);
    expect(result.deductibleAmount).toBe(1_000_000);
  });

  it("is not eligible and has zero deductible amount when not living with the filer (生計を一にしない)", () => {
    const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, cohabiting: false });

    expect(result.eligible).toBe(false);
    expect(result.deductibleAmount).toBe(0);
    const cohabitingCriterion = result.eligibilityChecklist.find((c) => c.key === "cohabiting")!;
    expect(cohabitingCriterion.met).toBe(false);
    expect(result.warnings.some((w) => w.includes("生計を一にする"))).toBe(true);
  });

  it("is not eligible and has zero deductible amount when not primarily engaged in the business (専ら従事しない)", () => {
    const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, primarilyEngaged: false });

    expect(result.eligible).toBe(false);
    expect(result.deductibleAmount).toBe(0);
    const engagedCriterion = result.eligibilityChecklist.find((c) => c.key === "primarilyEngaged")!;
    expect(engagedCriterion.met).toBe(false);
    expect(result.warnings.some((w) => w.includes("専ら従事"))).toBe(true);
  });

  it("is not eligible and has zero deductible amount when under the minimum age", () => {
    const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, familyMemberBirthdate: "2015-01-01" });

    expect(result.eligible).toBe(false);
    expect(result.deductibleAmount).toBe(0);
    const ageCriterion = result.eligibilityChecklist.find((c) => c.key === "age")!;
    expect(ageCriterion.met).toBe(false);
  });

  it("still reports exceedsDeclaredCap and a zero deductible amount when ineligible AND over the cap", () => {
    const result = calculateFamilyEmployeeSalary({
      ...BASE_INPUT,
      cohabiting: false,
      declaredMaxAmount: 1_000_000,
      actualPaidAmount: 1_200_000,
    });

    expect(result.eligible).toBe(false);
    expect(result.exceedsDeclaredCap).toBe(true);
    expect(result.deductibleAmount).toBe(0);
  });

  describe("age-15-by-December-15 boundary", () => {
    it("counts a family member born exactly 15 years before December 15 as meeting the age requirement", () => {
      const result = calculateFamilyEmployeeSalary({
        ...BASE_INPUT,
        taxYear: 2026,
        familyMemberBirthdate: "2011-12-15",
      });

      expect(result.ageAsOfCheckDate).toBe(15);
      const ageCriterion = result.eligibilityChecklist.find((c) => c.key === "age")!;
      expect(ageCriterion.met).toBe(true);
      expect(result.eligible).toBe(true);
    });

    it("does not count a family member turning 15 the day after December 15 as meeting the age requirement", () => {
      const result = calculateFamilyEmployeeSalary({
        ...BASE_INPUT,
        taxYear: 2026,
        familyMemberBirthdate: "2011-12-16",
      });

      expect(result.ageAsOfCheckDate).toBe(14);
      const ageCriterion = result.eligibilityChecklist.find((c) => c.key === "age")!;
      expect(ageCriterion.met).toBe(false);
      expect(result.eligible).toBe(false);
    });
  });

  it("throws for a non-finite (NaN) declared max amount", () => {
    expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, declaredMaxAmount: NaN })).toThrow();
  });

  it("throws for a negative actual paid amount", () => {
    expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, actualPaidAmount: -1 })).toThrow();
  });

  it("throws for a tax year outside the supported range", () => {
    expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 1900 })).toThrow();
  });

  it("throws for an unparseable birthdate", () => {
    expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, familyMemberBirthdate: "not-a-date" })).toThrow();
  });

  it("throws for an empty birthdate", () => {
    expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, familyMemberBirthdate: "" })).toThrow();
  });

  it("throws for a birthdate after the tax year's age check date", () => {
    expect(() =>
      calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 2026, familyMemberBirthdate: "2027-01-01" })
    ).toThrow();
  });

  describe("zero and boundary amounts", () => {
    it("treats a zero declared cap and zero actual payment as eligible with a zero deductible amount and no cap-exceeded warning", () => {
      const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, declaredMaxAmount: 0, actualPaidAmount: 0 });

      expect(result.eligible).toBe(true);
      expect(result.exceedsDeclaredCap).toBe(false);
      expect(result.deductibleAmount).toBe(0);
      expect(result.warnings.some((w) => w.includes("上限額"))).toBe(false);
    });

    it("flags exceedsDeclaredCap when the declared cap is zero but a positive salary was actually paid", () => {
      const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, declaredMaxAmount: 0, actualPaidAmount: 1 });

      expect(result.exceedsDeclaredCap).toBe(true);
      expect(result.deductibleAmount).toBe(0);
      expect(result.warnings.some((w) => w.includes("上限額"))).toBe(true);
    });

    it("handles very large (but finite) salary amounts without overflow or precision loss", () => {
      const large = Number.MAX_SAFE_INTEGER;
      const result = calculateFamilyEmployeeSalary({ ...BASE_INPUT, declaredMaxAmount: large, actualPaidAmount: large });

      expect(result.eligible).toBe(true);
      expect(result.exceedsDeclaredCap).toBe(false);
      expect(result.deductibleAmount).toBe(large);
    });

    it("throws for an Infinity declared max amount (not finite)", () => {
      expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, declaredMaxAmount: Infinity })).toThrow();
    });
  });

  describe("multiple failing eligibility criteria at once", () => {
    it("reports all three unmet criteria plus the two standing warnings when nothing is eligible", () => {
      const result = calculateFamilyEmployeeSalary({
        ...BASE_INPUT,
        cohabiting: false,
        primarilyEngaged: false,
        familyMemberBirthdate: "2015-01-01",
      });

      expect(result.eligible).toBe(false);
      expect(result.deductibleAmount).toBe(0);
      expect(result.eligibilityChecklist.every((c) => !c.met)).toBe(true);
      // 3件の要件未達 + 扶養控除等の注意 + 届出前提の注意 = 5件（上限超過なしのため）
      expect(result.warnings).toHaveLength(5);
    });
  });

  describe("tax year range boundaries", () => {
    it("accepts the minimum supported tax year without throwing", () => {
      expect(() =>
        calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 2000, familyMemberBirthdate: "1990-05-10" })
      ).not.toThrow();
    });

    it("accepts the maximum supported tax year without throwing", () => {
      expect(() =>
        calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 2100, familyMemberBirthdate: "1990-05-10" })
      ).not.toThrow();
    });

    it("throws for a tax year just above the maximum supported range", () => {
      expect(() =>
        calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 2101, familyMemberBirthdate: "1990-05-10" })
      ).toThrow();
    });

    it("throws for a non-integer tax year", () => {
      expect(() => calculateFamilyEmployeeSalary({ ...BASE_INPUT, taxYear: 2026.5 })).toThrow();
    });
  });

  it("does not throw when the family member's birthdate falls exactly on the age check date of the tax year itself (age 0)", () => {
    const result = calculateFamilyEmployeeSalary({
      ...BASE_INPUT,
      taxYear: 2026,
      familyMemberBirthdate: "2026-12-15",
    });

    expect(result.ageAsOfCheckDate).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it("throws when cohabiting is passed as a non-boolean value", () => {
    expect(() =>
      calculateFamilyEmployeeSalary({ ...BASE_INPUT, cohabiting: "yes" as unknown as boolean })
    ).toThrow();
  });

  it("throws when primarilyEngaged is passed as a non-boolean value", () => {
    expect(() =>
      calculateFamilyEmployeeSalary({ ...BASE_INPUT, primarilyEngaged: 1 as unknown as boolean })
    ).toThrow();
  });
});
