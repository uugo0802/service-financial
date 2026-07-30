import { describe, expect, it } from "vitest";
import { getInterimPaymentObligations } from "./interimPayment";

describe("getInterimPaymentObligations - corporate tax threshold boundary", () => {
  it("does not require an interim corporate tax obligation exactly at the ¥200,000 threshold", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 200_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.corporateTax.required).toBe(false);
    expect(result.obligations.find((o) => o.kind === "corporateTax")).toBeUndefined();
  });

  it("requires an interim corporate tax obligation just above the ¥200,000 threshold, estimated at half of prior year's tax", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 200_001,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.corporateTax.required).toBe(true);
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation).toBeDefined();
    // floor(200001 / 2) = 100000 (yen fractions are floored, not rounded)
    expect(obligation?.estimatedAmount).toBe(100_000);
    expect(obligation?.needsManualReview).toBe(false);
  });
});

describe("getInterimPaymentObligations - consumption tax tiers", () => {
  it("does not require an interim consumption tax obligation exactly at the ¥480,000 threshold", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 480_000,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.consumptionTax.required).toBe(false);
    expect(result.consumptionTax.tier).toBe("none");
    expect(result.obligations.find((o) => o.kind === "consumptionTax")).toBeUndefined();
  });

  it("falls into the annual interim tier just above the ¥480,000 threshold", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 480_001,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.consumptionTax.required).toBe(true);
    expect(result.consumptionTax.tier).toBe("annual");
    const obligation = result.obligations.find((o) => o.kind === "consumptionTax");
    expect(obligation?.needsManualReview).toBe(false);
    // floor(480001 / 2) = 240000
    expect(obligation?.estimatedAmount).toBe(240_000);
    expect(obligation?.dueDate).not.toBeNull();
  });

  it("still treats exactly ¥4,000,000 as the annual tier (inclusive upper bound)", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 4_000_000,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.consumptionTax.tier).toBe("annual");
  });

  it("flags amounts above ¥4,000,000 as needing manual review instead of computing a date/amount", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 4_000_001,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.consumptionTax.required).toBe(true);
    expect(result.consumptionTax.tier).toBe("moreFrequent");
    const obligation = result.obligations.find((o) => o.kind === "consumptionTax");
    expect(obligation?.needsManualReview).toBe(true);
    expect(obligation?.dueDate).toBeNull();
    expect(obligation?.estimatedAmount).toBeNull();
    expect(obligation?.daysRemaining).toBeNull();
    expect(obligation?.urgency).toBeNull();
  });

  it("also flags very large amounts (e.g. the ¥48,000,000 monthly tier) as needing manual review, not a distinct third tier", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 60_000_000,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.consumptionTax.tier).toBe("moreFrequent");
  });
});

describe("getInterimPaymentObligations - negative/zero input handling", () => {
  it("clamps negative prior-year tax figures to zero instead of producing a negative-derived obligation", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: -50_000,
      priorYearConsumptionTax: -1,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.corporateTax.priorYearCorporateTax).toBe(0);
    expect(result.corporateTax.required).toBe(false);
    expect(result.consumptionTax.priorYearConsumptionTax).toBe(0);
    expect(result.consumptionTax.required).toBe(false);
  });

  it("returns an empty obligations list when both prior-year taxes are zero", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.obligations).toEqual([]);
  });
});

describe("getInterimPaymentObligations - due date calculation", () => {
  it("computes November 30 as the interim due date for a standard April 1 fiscal year start", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.dueDate).toBe("2026-11-30");
  });

  it("clamps to each month's last valid day when the fiscal year does not start on the 1st (e.g. Jan 31)", () => {
    // Jan 31 + 6 months = Jul 31 (valid); Jul 31 + 2 months would be "Sep 31",
    // clamped to Sep 30; minus one day = Sep 29.
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-01-31",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.dueDate).toBe("2026-09-29");
  });

  it("accepts a Date object for fiscalYearStartDate, matching the string-based result", () => {
    const fromString = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });
    const fromDate = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: new Date(2026, 3, 1), // local April 1, 2026
    });

    expect(fromDate.fiscalYearStartDate).toBe(fromString.fiscalYearStartDate);
    const dueFromDate = fromDate.obligations.find((o) => o.kind === "corporateTax")?.dueDate;
    const dueFromString = fromString.obligations.find((o) => o.kind === "corporateTax")?.dueDate;
    expect(dueFromDate).toBe(dueFromString);
  });
});

describe("getInterimPaymentObligations - urgency and days-remaining classification", () => {
  const baseInput = {
    priorYearCorporateTax: 500_000,
    priorYearConsumptionTax: 0,
    fiscalYearStartDate: "2026-04-01",
  };

  it("classifies exactly 14 days remaining as urgent (boundary)", () => {
    const result = getInterimPaymentObligations({ ...baseInput, referenceDate: "2026-11-16" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(14);
    expect(obligation?.urgency).toBe("urgent");
  });

  it("classifies exactly 45 days remaining as warning (boundary), 46 as normal", () => {
    const atForty5 = getInterimPaymentObligations({ ...baseInput, referenceDate: "2026-10-16" });
    const oblAt45 = atForty5.obligations.find((o) => o.kind === "corporateTax");
    expect(oblAt45?.daysRemaining).toBe(45);
    expect(oblAt45?.urgency).toBe("warning");

    const at46 = getInterimPaymentObligations({ ...baseInput, referenceDate: "2026-10-15" });
    const oblAt46 = at46.obligations.find((o) => o.kind === "corporateTax");
    expect(oblAt46?.daysRemaining).toBe(46);
    expect(oblAt46?.urgency).toBe("normal");
  });

  it("keeps reporting an overdue obligation as urgent with a negative daysRemaining, rather than hiding it", () => {
    const result = getInterimPaymentObligations({ ...baseInput, referenceDate: "2026-12-05" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(-5);
    expect(obligation?.urgency).toBe("urgent");
  });
});

describe("getInterimPaymentObligations - combined obligations and sorting", () => {
  it("includes both corporate and consumption tax obligations, sharing the same due date, when both thresholds are exceeded", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 1_000_000,
      priorYearConsumptionTax: 1_000_000,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.obligations).toHaveLength(2);
    expect(result.obligations.map((o) => o.id)).toEqual([
      "corporate-tax-interim",
      "consumption-tax-interim",
    ]);
    expect(result.obligations[0].dueDate).toBe(result.obligations[1].dueDate);
  });

  it("sorts a needs-manual-review (null due date) consumption tax entry after a dated corporate tax entry", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 1_000_000,
      priorYearConsumptionTax: 10_000_000,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.obligations).toHaveLength(2);
    expect(result.obligations[0].kind).toBe("corporateTax");
    expect(result.obligations[0].dueDate).not.toBeNull();
    expect(result.obligations[1].kind).toBe("consumptionTax");
    expect(result.obligations[1].dueDate).toBeNull();
  });
});

describe("getInterimPaymentObligations - assumptions disclosure", () => {
  it("always discloses the halving simplification, the out-of-scope consumption tax tiers, and the non-advice disclaimer", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("仮決算"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("年3回"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("個別の税務相談"))).toBe(true);
  });
});
