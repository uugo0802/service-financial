import { describe, expect, it } from "vitest";
import { calculateYearEndAdjustment } from "./yearEndAdjustment";
import { calculateMonthlyWithholding } from "./withholding";
import { calculateBonusWithholding } from "./bonusWithholding";
import { buildWithholdingSlip, formatFiscalYearLabel, sumWithheldTax } from "./withholdingSlip";

const SAMPLE_PAYER = { companyName: "今ごえん合同会社" };
const SAMPLE_EMPLOYEE = { name: "山田 太郎" };

describe("formatFiscalYearLabel", () => {
  it("formats a Reiwa-era year with the era number and the western year", () => {
    expect(formatFiscalYearLabel(2026)).toBe("令和8年分（2026年）");
  });

  it("uses 元 for the first year of the Reiwa era (2019)", () => {
    expect(formatFiscalYearLabel(2019)).toBe("令和元年分（2019年）");
  });

  it("falls back to a western-year-only label before the Reiwa era", () => {
    expect(formatFiscalYearLabel(2015)).toBe("2015年分");
  });
});

describe("buildWithholdingSlip", () => {
  const yearEndAdjustment = calculateYearEndAdjustment({
    annualGrossCompensation: 4_000_000,
    annualSocialInsurancePremium: 500_000,
    dependentCount: 1,
    monthlyWithholdingTotal: 100_000,
  });

  it("maps the year-end adjustment result onto the four standard withholding-slip boxes", () => {
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });

    // 支払金額
    expect(slip.paymentAmount).toBe(yearEndAdjustment.annualGrossCompensation);
    // 給与所得控除後の金額
    expect(slip.amountAfterSalaryIncomeDeduction).toBe(yearEndAdjustment.salaryIncome);
    // 所得控除の額の合計額 = 社会保険料控除 + 基礎控除 + 扶養控除
    expect(slip.totalIncomeDeductions).toBe(
      yearEndAdjustment.annualSocialInsurancePremium + yearEndAdjustment.basicDeduction + yearEndAdjustment.dependentDeduction
    );
    // 源泉徴収税額
    expect(slip.withholdingTaxAmount).toBe(yearEndAdjustment.totalAnnualTaxDue);
  });

  it("carries over identifying fields, dependent count, and social insurance amount", () => {
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: { name: "鈴木 花子", address: "東京都千代田区1-1-1", employeeNumber: "E001" },
      payer: { companyName: "サンプル株式会社", address: "東京都港区2-2-2", corporateNumber: "1234567890123" },
      yearEndAdjustment,
    });

    expect(slip.employee.name).toBe("鈴木 花子");
    expect(slip.employee.employeeNumber).toBe("E001");
    expect(slip.payer.companyName).toBe("サンプル株式会社");
    expect(slip.payer.corporateNumber).toBe("1234567890123");
    expect(slip.dependentCount).toBe(yearEndAdjustment.dependentCount);
    expect(slip.socialInsurancePremiumAmount).toBe(yearEndAdjustment.annualSocialInsurancePremium);
    expect(slip.fiscalYearLabel).toBe("令和8年分（2026年）");
  });

  it("defaults paymentKind to 給与・賞与 and allows overriding it", () => {
    const defaultSlip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });
    expect(defaultSlip.paymentKind).toBe("給与・賞与");

    const overriddenSlip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
      paymentKind: "役員報酬",
    });
    expect(overriddenSlip.paymentKind).toBe("役員報酬");
  });

  it("carries over the year-end adjustment outcome and difference for reference", () => {
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });

    expect(slip.yearEndAdjustmentOutcome).toBe(yearEndAdjustment.outcome);
    expect(slip.yearEndAdjustmentDifference).toBe(yearEndAdjustment.difference);
    expect(slip.alreadyWithheld).toBe(yearEndAdjustment.alreadyWithheld);
  });

  it("lists unsupported fields (life insurance deduction, housing loan deduction, etc.) that are left blank", () => {
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });

    expect(slip.unsupportedFields.length).toBeGreaterThan(0);
    expect(slip.unsupportedFields.some((f) => f.includes("生命保険料"))).toBe(true);
    expect(slip.unsupportedFields.some((f) => f.includes("住宅借入金等特別控除"))).toBe(true);
  });

  it("includes assumptions carried over from yearEndAdjustment plus a note about not collecting the individual number (マイナンバー)", () => {
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });

    // yearEndAdjustment.tsのassumptionsがすべて含まれている
    for (const a of yearEndAdjustment.assumptions) {
      expect(slip.assumptions).toContain(a);
    }
    expect(slip.assumptions.some((a) => a.includes("個人番号") && a.includes("マイナンバー"))).toBe(true);
    expect(slip.assumptions.some((a) => a.includes("下書き"))).toBe(true);
  });

  it("throws when the employee name is empty", () => {
    expect(() =>
      buildWithholdingSlip({
        fiscalYear: 2026,
        employee: { name: "" },
        payer: SAMPLE_PAYER,
        yearEndAdjustment,
      })
    ).toThrow();
  });

  it("throws when the payer company name is empty", () => {
    expect(() =>
      buildWithholdingSlip({
        fiscalYear: 2026,
        employee: SAMPLE_EMPLOYEE,
        payer: { companyName: "   " },
        yearEndAdjustment,
      })
    ).toThrow();
  });

  it("throws for a non-integer fiscal year", () => {
    expect(() =>
      buildWithholdingSlip({
        fiscalYear: 2026.5,
        employee: SAMPLE_EMPLOYEE,
        payer: SAMPLE_PAYER,
        yearEndAdjustment,
      })
    ).toThrow();
  });

  it("throws for a fiscal year outside the supported range", () => {
    expect(() =>
      buildWithholdingSlip({
        fiscalYear: 1500,
        employee: SAMPLE_EMPLOYEE,
        payer: SAMPLE_PAYER,
        yearEndAdjustment,
      })
    ).toThrow();
  });
});

describe("sumWithheldTax", () => {
  it("sums the withholdingTax field across monthly withholding results", () => {
    const monthly = Array.from({ length: 12 }, () =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 300_000, dependentCount: 0, insurancePremium: 0 })
    );
    const total = sumWithheldTax(monthly);
    expect(total).toBe(monthly[0].withholdingTax * 12);
  });

  it("sums across a mix of monthly and bonus withholding results", () => {
    const monthly = calculateMonthlyWithholding({
      monthlyGrossCompensation: 300_000,
      dependentCount: 0,
      insurancePremium: 0,
    });
    const bonus = calculateBonusWithholding({
      bonusGrossAmount: 500_000,
      bonusInsurancePremium: 0,
      previousMonthSalaryAfterInsurance: 300_000,
      dependentCount: 0,
    });

    expect(sumWithheldTax([monthly, bonus])).toBe(monthly.withholdingTax + bonus.withholdingTax);
  });

  it("returns 0 for an empty list", () => {
    expect(sumWithheldTax([])).toBe(0);
  });
});

describe("end-to-end: withholding.ts + bonusWithholding.ts -> yearEndAdjustment.ts -> withholdingSlip.ts", () => {
  it("builds a withholding slip from a full year of monthly withholding plus one bonus, feeding through calculateYearEndAdjustment", () => {
    const monthlyRecords = Array.from({ length: 12 }, () =>
      calculateMonthlyWithholding({ monthlyGrossCompensation: 300_000, dependentCount: 0, insurancePremium: 20_000 })
    );
    const bonusRecord = calculateBonusWithholding({
      bonusGrossAmount: 600_000,
      bonusInsurancePremium: 40_000,
      previousMonthSalaryAfterInsurance: 280_000,
      dependentCount: 0,
    });

    const annualGrossCompensation =
      monthlyRecords.reduce((s, m) => s + m.monthlyGrossCompensation, 0) + bonusRecord.bonusGrossAmount;
    const annualSocialInsurancePremium =
      monthlyRecords.reduce((s, m) => s + m.insurancePremium, 0) + bonusRecord.bonusInsurancePremium;
    const alreadyWithheldTotal = sumWithheldTax([...monthlyRecords, bonusRecord]);

    const yearEndAdjustment = calculateYearEndAdjustment({
      annualGrossCompensation,
      annualSocialInsurancePremium,
      dependentCount: 0,
      monthlyWithholdingTotal: alreadyWithheldTotal,
    });

    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: SAMPLE_EMPLOYEE,
      payer: SAMPLE_PAYER,
      yearEndAdjustment,
    });

    expect(slip.paymentAmount).toBe(annualGrossCompensation);
    expect(slip.socialInsurancePremiumAmount).toBe(annualSocialInsurancePremium);
    expect(slip.alreadyWithheld).toBe(alreadyWithheldTotal);
    expect(slip.withholdingTaxAmount).toBe(yearEndAdjustment.totalAnnualTaxDue);
  });
});
