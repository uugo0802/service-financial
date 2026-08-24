import { describe, expect, it } from "vitest";
import { getIndividualEstimatedTaxObligations } from "./individualEstimatedTax";

describe("getIndividualEstimatedTaxObligations - obligation threshold boundary", () => {
  it("does not require estimated tax when the obligation base is exactly ¥150,000", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 150_000,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    expect(result.obligationBaseAmount).toBe(150_000);
    expect(result.required).toBe(false);
    expect(result.installments).toEqual([]);
    expect(result.totalInstallmentAmount).toBe(0);
  });

  it("requires estimated tax just above the ¥150,000 threshold, with each installment as 1/3 floored to the nearest ¥1,000", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 150_001,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    expect(result.required).toBe(true);
    expect(result.installments).toHaveLength(2);
    // floor(150001 / 3 / 1000) * 1000 = floor(50.0003) * 1000 = 50000
    expect(result.installments[0].amount).toBe(50_000);
    expect(result.installments[1].amount).toBe(50_000);
    expect(result.totalInstallmentAmount).toBe(100_000);
  });

  it("does not require estimated tax when the obligation base is below ¥150,000", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 149_999,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    expect(result.required).toBe(false);
    expect(result.installments).toEqual([]);
  });
});

describe("getIndividualEstimatedTaxObligations - obligation base calculation", () => {
  it("computes the obligation base as confirmed income tax minus withholding tax", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 900_000,
      priorYearWithholdingTax: 300_000,
      taxYear: 2026,
    });

    expect(result.obligationBaseAmount).toBe(600_000);
    expect(result.required).toBe(true);
    // floor(600000 / 3 / 1000) * 1000 = 200000
    expect(result.installments[0].amount).toBe(200_000);
    expect(result.installments[1].amount).toBe(200_000);
  });

  it("clamps the obligation base to zero when withholding tax exceeds confirmed income tax, instead of going negative", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 200_000,
      priorYearWithholdingTax: 500_000,
      taxYear: 2026,
    });

    expect(result.obligationBaseAmount).toBe(0);
    expect(result.required).toBe(false);
    expect(result.installments).toEqual([]);
  });

  it("clamps negative input figures to zero rather than producing a negative-derived obligation", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: -100_000,
      priorYearWithholdingTax: -50_000,
      taxYear: 2026,
    });

    expect(result.priorYearConfirmedIncomeTax).toBe(0);
    expect(result.priorYearWithholdingTax).toBe(0);
    expect(result.obligationBaseAmount).toBe(0);
    expect(result.required).toBe(false);
  });
});

describe("getIndividualEstimatedTaxObligations - installment amount rounding", () => {
  it("floors each installment to the nearest ¥1,000 rather than rounding", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 1_000_000,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    // obligationBaseAmount = 1,000,000; /3 = 333,333.33; floored to nearest 1000 = 333,000
    expect(result.obligationBaseAmount).toBe(1_000_000);
    expect(result.installments[0].amount).toBe(333_000);
    expect(result.installments[1].amount).toBe(333_000);
    expect(result.totalInstallmentAmount).toBe(666_000);
  });
});

describe("getIndividualEstimatedTaxObligations - due dates", () => {
  it("sets the first installment period to July 1-31 and the second to November 1-30 of the given tax year", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 1_000_000,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    expect(result.installments[0].id).toBe("first");
    expect(result.installments[0].periodStart).toBe("2026-07-01");
    expect(result.installments[0].periodEnd).toBe("2026-07-31");

    expect(result.installments[1].id).toBe("second");
    expect(result.installments[1].periodStart).toBe("2026-11-01");
    expect(result.installments[1].periodEnd).toBe("2026-11-30");
  });

  it("uses the given taxYear for both installment periods, not the current calendar year", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 1_000_000,
      priorYearWithholdingTax: 0,
      taxYear: 2030,
    });

    expect(result.installments[0].periodEnd).toBe("2030-07-31");
    expect(result.installments[1].periodEnd).toBe("2030-11-30");
  });
});

describe("getIndividualEstimatedTaxObligations - urgency and days-remaining classification", () => {
  const baseInput = {
    priorYearConfirmedIncomeTax: 1_000_000,
    priorYearWithholdingTax: 0,
    taxYear: 2026,
  };

  it("classifies exactly 14 days remaining before the first installment's due date as urgent (boundary)", () => {
    const result = getIndividualEstimatedTaxObligations({ ...baseInput, referenceDate: "2026-07-17" });
    expect(result.installments[0].daysRemaining).toBe(14);
    expect(result.installments[0].urgency).toBe("urgent");
  });

  it("classifies exactly 45 days remaining as warning (boundary), 46 as normal", () => {
    const at45 = getIndividualEstimatedTaxObligations({ ...baseInput, referenceDate: "2026-06-16" });
    expect(at45.installments[0].daysRemaining).toBe(45);
    expect(at45.installments[0].urgency).toBe("warning");

    const at46 = getIndividualEstimatedTaxObligations({ ...baseInput, referenceDate: "2026-06-15" });
    expect(at46.installments[0].daysRemaining).toBe(46);
    expect(at46.installments[0].urgency).toBe("normal");
  });

  it("keeps reporting an overdue installment as urgent with a negative daysRemaining, rather than hiding it", () => {
    const result = getIndividualEstimatedTaxObligations({ ...baseInput, referenceDate: "2026-08-10" });
    expect(result.installments[0].daysRemaining).toBe(-10);
    expect(result.installments[0].urgency).toBe("urgent");
    // the second installment (November) should still be far in the future
    expect(result.installments[1].urgency).toBe("normal");
  });

  it("defaults referenceDate to the current date when omitted, still returning well-formed installments", () => {
    const result = getIndividualEstimatedTaxObligations(baseInput);
    expect(typeof result.installments[0].daysRemaining).toBe("number");
    expect(["urgent", "warning", "normal"]).toContain(result.installments[0].urgency);
  });
});

describe("getIndividualEstimatedTaxObligations - malformed date inputs", () => {
  it("throws on a referenceDate string that doesn't match YYYY-MM-DD", () => {
    expect(() =>
      getIndividualEstimatedTaxObligations({
        priorYearConfirmedIncomeTax: 1_000_000,
        priorYearWithholdingTax: 0,
        taxYear: 2026,
        referenceDate: "2026/07/01",
      })
    ).toThrow(/Invalid date string/);
  });

  it("accepts a Date object for referenceDate, matching the string-based result", () => {
    const fromString = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 1_000_000,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
      referenceDate: "2026-07-01",
    });
    const fromDate = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 1_000_000,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
      referenceDate: new Date(2026, 6, 1), // local July 1, 2026
    });

    expect(fromDate.installments[0].daysRemaining).toBe(fromString.installments[0].daysRemaining);
  });
});

describe("getIndividualEstimatedTaxObligations - assumptions disclosure", () => {
  it("always discloses the reduction-application pointer, the rounding convention, and the non-advice disclaimer", () => {
    const result = getIndividualEstimatedTaxObligations({
      priorYearConfirmedIncomeTax: 0,
      priorYearWithholdingTax: 0,
      taxYear: 2026,
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("減額申請"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("1,000円未満"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("個別の税務相談"))).toBe(true);
  });
});
