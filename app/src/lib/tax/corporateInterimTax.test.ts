import { describe, expect, it } from "vitest";
import {
  CORPORATE_TAX_INTERIM_FILING_THRESHOLD,
  calculateProvisionalInterimTax,
  compareInterimTaxMethods,
  deriveInterimTaxFromClosing,
} from "./corporateInterimTax";
import { CorporateEstimate } from "./corporateEstimate";

function interimEstimate(overrides: Partial<CorporateEstimate> = {}): CorporateEstimate {
  return {
    revenue: 0,
    expenses: 0,
    taxableIncome: 0,
    corporateTax: 0,
    localCorporateTax: 0,
    perCapitaTaxReference: 70_000,
    totalNationalTax: 0,
    consumptionTax: { isLikelyExempt: true, salesTax: 0, purchaseTax: 0, payable: 0 },
    assumptions: [],
    ...overrides,
  };
}

describe("calculateProvisionalInterimTax", () => {
  it("halves the prior year's confirmed corporate/local corporate tax and rounds down to the nearest 10,000 yen", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 453_000,
      localCorporateTax: 46_600,
    });

    expect(result.required).toBe(true);
    // 453,000 / 2 = 226,500 -> floor to 10,000 -> 220,000
    expect(result.corporateTaxPrepayment).toBe(220_000);
    // 46,600 / 2 = 23,300 -> floor to 10,000 -> 20,000
    expect(result.localCorporateTaxPrepayment).toBe(20_000);
    expect(result.consumptionTaxPrepayment).toBeNull();
    expect(result.totalPrepayment).toBe(240_000);
  });

  it("halves consumption tax and rounds down to the nearest yen (not the nearest 10,000 yen) when provided", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 300_000,
      localCorporateTax: 30_900,
      consumptionTax: 601_111,
    });

    expect(result.priorYearConsumptionTax).toBe(601_111);
    // 601,111 / 2 = 300,555.5 -> floor to yen -> 300,555 (not floored to 10,000)
    expect(result.consumptionTaxPrepayment).toBe(300_555);
    expect(result.totalPrepayment).toBe(
      result.corporateTaxPrepayment + result.localCorporateTaxPrepayment + 300_555
    );
  });

  it("does not compute a consumption tax prepayment when consumptionTax is omitted", () => {
    const result = calculateProvisionalInterimTax({ corporateTax: 300_000, localCorporateTax: 30_000 });
    expect(result.priorYearConsumptionTax).toBeNull();
    expect(result.consumptionTaxPrepayment).toBeNull();
  });

  describe("the 200,000 yen skip-threshold boundary", () => {
    it("does NOT require interim filing when prior year corporate tax is exactly 200,000 yen", () => {
      const result = calculateProvisionalInterimTax({ corporateTax: 200_000, localCorporateTax: 20_000 });

      expect(CORPORATE_TAX_INTERIM_FILING_THRESHOLD).toBe(200_000);
      expect(result.required).toBe(false);
      expect(result.corporateTaxPrepayment).toBe(0);
      expect(result.localCorporateTaxPrepayment).toBe(0);
      expect(result.totalPrepayment).toBe(0);
    });

    it("does NOT require interim filing just below the threshold (199,999 yen)", () => {
      const result = calculateProvisionalInterimTax({ corporateTax: 199_999, localCorporateTax: 20_000 });
      expect(result.required).toBe(false);
      expect(result.totalPrepayment).toBe(0);
    });

    it("DOES require interim filing just above the threshold (200,001 yen)", () => {
      const result = calculateProvisionalInterimTax({ corporateTax: 200_001, localCorporateTax: 20_600 });
      expect(result.required).toBe(true);
      // 200,001 / 2 = 100,000.5 -> floor to 10,000 -> 100,000
      expect(result.corporateTaxPrepayment).toBe(100_000);
      expect(result.localCorporateTaxPrepayment).toBe(10_000);
    });

    it("checks the ORIGINAL prior-year corporate tax against the threshold, not the halved amount", () => {
      // Prior year corporate tax of 210,000 is above the 200,000 threshold (so filing IS required),
      // even though half of it (105,000, before rounding) is close to the 100,000 halved-threshold
      // some naive implementations might mistakenly compare against instead.
      const aboveThreshold = calculateProvisionalInterimTax({ corporateTax: 210_000, localCorporateTax: 21_000 });
      expect(aboveThreshold.required).toBe(true);

      // Conversely, a prior-year corporate tax of exactly 200,000 must be treated as NOT requiring
      // filing even though naively halving first (100,000) sits right at the halved-threshold value.
      const atThreshold = calculateProvisionalInterimTax({ corporateTax: 200_000, localCorporateTax: 20_000 });
      expect(atThreshold.required).toBe(false);
    });
  });

  it("treats negative inputs defensively as zero", () => {
    const result = calculateProvisionalInterimTax({ corporateTax: -50_000, localCorporateTax: -5_000 });
    expect(result.priorYearCorporateTax).toBe(0);
    expect(result.priorYearLocalCorporateTax).toBe(0);
    expect(result.required).toBe(false);
  });

  it("treats a negative consumption tax input defensively as zero, not as omitted (still returns a numeric prepayment, not null)", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 300_000,
      localCorporateTax: 30_000,
      consumptionTax: -10_000,
    });
    expect(result.priorYearConsumptionTax).toBe(0);
    expect(result.consumptionTaxPrepayment).toBe(0);
  });

  it("computes a zero (not null) consumption tax prepayment when consumptionTax is explicitly 0 (distinct from omitted)", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 300_000,
      localCorporateTax: 30_000,
      consumptionTax: 0,
    });
    expect(result.priorYearConsumptionTax).toBe(0);
    expect(result.consumptionTaxPrepayment).toBe(0);
  });

  it("does not compute a consumption tax prepayment when filing is not required, even if consumptionTax is provided", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 200_000,
      localCorporateTax: 20_000,
      consumptionTax: 500_000,
    });
    expect(result.required).toBe(false);
    expect(result.priorYearConsumptionTax).toBe(500_000);
    expect(result.consumptionTaxPrepayment).toBe(0);
  });

  it("floors a very small consumption tax prepayment (under 1 yen after halving) down to 0 yen, not the 10,000 yen unit used for corporate tax", () => {
    const result = calculateProvisionalInterimTax({
      corporateTax: 300_000,
      localCorporateTax: 30_000,
      consumptionTax: 1,
    });
    // 1 / 2 = 0.5 -> floor to yen -> 0 (must NOT be floored to the nearest 10,000 yen)
    expect(result.consumptionTaxPrepayment).toBe(0);
  });
});

describe("deriveInterimTaxFromClosing", () => {
  it("passes through the interim closing's corporate/local corporate/consumption tax figures without reimplementing rate logic", () => {
    const sixMonthEstimate = interimEstimate({
      corporateTax: 180_000,
      localCorporateTax: 18_540,
      consumptionTax: { isLikelyExempt: false, salesTax: 400_000, purchaseTax: 150_000, payable: 250_000 },
    });

    const result = deriveInterimTaxFromClosing(sixMonthEstimate);

    expect(result.method).toBe("interimClosing");
    expect(result.corporateTax).toBe(180_000);
    expect(result.localCorporateTax).toBe(18_540);
    expect(result.consumptionTaxPayable).toBe(250_000);
    expect(result.totalPrepayment).toBe(180_000 + 18_540 + 250_000);
    expect(result.sourceEstimate).toBe(sixMonthEstimate);
  });

  it("excludes consumption tax from the total when includeConsumptionTax is false", () => {
    const sixMonthEstimate = interimEstimate({
      corporateTax: 100_000,
      localCorporateTax: 10_300,
      consumptionTax: { isLikelyExempt: false, salesTax: 400_000, purchaseTax: 150_000, payable: 250_000 },
    });

    const result = deriveInterimTaxFromClosing(sixMonthEstimate, { includeConsumptionTax: false });

    expect(result.consumptionTaxPayable).toBeNull();
    expect(result.totalPrepayment).toBe(100_000 + 10_300);
  });

  it("does not apply the 10,000 yen provisional-method rounding rule to the interim closing figures", () => {
    const sixMonthEstimate = interimEstimate({ corporateTax: 123_456, localCorporateTax: 12_710 });
    const result = deriveInterimTaxFromClosing(sixMonthEstimate, { includeConsumptionTax: false });

    expect(result.corporateTax).toBe(123_456);
    expect(result.localCorporateTax).toBe(12_710);
  });

  it("defaults includeConsumptionTax to true when options is omitted entirely", () => {
    const sixMonthEstimate = interimEstimate({
      corporateTax: 50_000,
      localCorporateTax: 5_150,
      consumptionTax: { isLikelyExempt: false, salesTax: 80_000, purchaseTax: 30_000, payable: 50_000 },
    });

    const result = deriveInterimTaxFromClosing(sixMonthEstimate);

    expect(result.consumptionTaxPayable).toBe(50_000);
    expect(result.totalPrepayment).toBe(50_000 + 5_150 + 50_000);
  });

  it("floors a negative consumption tax payable at zero rather than subtracting it from the total", () => {
    const sixMonthEstimate = interimEstimate({
      corporateTax: 50_000,
      localCorporateTax: 5_150,
      consumptionTax: { isLikelyExempt: false, salesTax: 10_000, purchaseTax: 90_000, payable: -80_000 },
    });

    const result = deriveInterimTaxFromClosing(sixMonthEstimate);

    expect(result.consumptionTaxPayable).toBe(0);
    expect(result.totalPrepayment).toBe(50_000 + 5_150);
  });
});

describe("compareInterimTaxMethods", () => {
  it("favors the interim closing method when its total is lower than the provisional method's", () => {
    const provisional = calculateProvisionalInterimTax({ corporateTax: 800_000, localCorporateTax: 82_400 });
    // Provisional: floor(400,000/10000)*10000=400,000 + floor(41,200/10000)*10000=40,000 = 440,000
    expect(provisional.totalPrepayment).toBe(440_000);

    const interimClosing = deriveInterimTaxFromClosing(
      interimEstimate({ corporateTax: 100_000, localCorporateTax: 10_300 }),
      { includeConsumptionTax: false }
    );
    // Interim closing: 110,300 (business had a much weaker first half than the prior year)

    const comparison = compareInterimTaxMethods(provisional, interimClosing);

    expect(comparison.provisionalTotal).toBe(440_000);
    expect(comparison.interimClosingTotal).toBe(110_300);
    expect(comparison.favorableMethod).toBe("interimClosing");
    expect(comparison.savingsFromInterimClosing).toBe(440_000 - 110_300);
  });

  it("favors the provisional method when the interim closing's total is higher", () => {
    const provisional = calculateProvisionalInterimTax({ corporateTax: 300_000, localCorporateTax: 30_900 });
    const interimClosing = deriveInterimTaxFromClosing(
      interimEstimate({ corporateTax: 900_000, localCorporateTax: 92_700 }),
      { includeConsumptionTax: false }
    );

    const comparison = compareInterimTaxMethods(provisional, interimClosing);

    expect(comparison.favorableMethod).toBe("provisional");
    expect(comparison.savingsFromInterimClosing).toBeLessThan(0);
  });

  it("reports 'equal' when both methods produce the same total", () => {
    const provisional = calculateProvisionalInterimTax({ corporateTax: 400_000, localCorporateTax: 41_200 });
    // Provisional total: floor(200,000/10000)*10000=200,000 + floor(20,600/10000)*10000=20,000 = 220,000
    expect(provisional.totalPrepayment).toBe(220_000);

    const interimClosing = deriveInterimTaxFromClosing(
      interimEstimate({ corporateTax: 210_000, localCorporateTax: 10_000 }),
      { includeConsumptionTax: false }
    );
    // Interim closing total: 220,000 (matches provisional total exactly)

    const comparison = compareInterimTaxMethods(provisional, interimClosing);

    expect(comparison.favorableMethod).toBe("equal");
    expect(comparison.savingsFromInterimClosing).toBe(0);
  });

  it("returns null comparison fields when no interim closing has been computed yet", () => {
    const provisional = calculateProvisionalInterimTax({ corporateTax: 500_000, localCorporateTax: 51_500 });

    const comparison = compareInterimTaxMethods(provisional);

    expect(comparison.interimClosing).toBeNull();
    expect(comparison.interimClosingTotal).toBeNull();
    expect(comparison.favorableMethod).toBeNull();
    expect(comparison.savingsFromInterimClosing).toBeNull();
    expect(comparison.provisionalTotal).toBe(provisional.totalPrepayment);
  });
});
