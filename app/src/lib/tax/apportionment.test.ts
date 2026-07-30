import { describe, expect, it } from "vitest";
import {
  APPORTIONMENT_DISCLAIMER,
  DEFAULT_TOTAL_HOURS_PER_WEEK,
  calculateApportionment,
  calculateApportionmentFromRatio,
} from "./apportionment";

describe("calculateApportionment — 床面積按分", () => {
  it("computes the deductible amount from a business-use floor area ratio", () => {
    const result = calculateApportionment({
      totalAmount: 100_000,
      basisInput: { basis: "floorArea", businessAreaSqm: 20, totalAreaSqm: 50 },
    });

    expect(result.businessUseRatioPercent).toBeCloseTo(40);
    expect(result.deductibleAmount).toBe(40_000); // 100,000 * 40%
    expect(result.basisDescription).toMatch(/床面積按分/);
    expect(result.disclaimer).toBe(APPORTIONMENT_DISCLAIMER);
  });

  it("treats a business area equal to the total area as 100% deductible", () => {
    const result = calculateApportionment({
      totalAmount: 80_000,
      basisInput: { basis: "floorArea", businessAreaSqm: 30, totalAreaSqm: 30 },
    });

    expect(result.businessUseRatioPercent).toBe(100);
    expect(result.deductibleAmount).toBe(80_000);
  });

  it("treats a business area of zero as 0% deductible", () => {
    const result = calculateApportionment({
      totalAmount: 80_000,
      basisInput: { basis: "floorArea", businessAreaSqm: 0, totalAreaSqm: 30 },
    });

    expect(result.businessUseRatioPercent).toBe(0);
    expect(result.deductibleAmount).toBe(0);
  });

  it("rejects a business area larger than the total area", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: 60, totalAreaSqm: 50 },
      })
    ).toThrow(/超える/);
  });

  it("rejects a negative business area", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: -5, totalAreaSqm: 50 },
      })
    ).toThrow(/0以上/);
  });

  it("rejects a total area of zero or less", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: 0, totalAreaSqm: 0 },
      })
    ).toThrow(/0より大きい/);
  });

  it("rejects NaN floor-area inputs", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: NaN, totalAreaSqm: 50 },
      })
    ).toThrow(/数値で入力/);
  });

  it("rejects a negative total area (checked before the '0以下' business-rule check)", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: 5, totalAreaSqm: -10 },
      })
    ).toThrow(/0以上/);
  });

  it("rejects an Infinite total area as non-finite rather than treating it as a valid (if extreme) number", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 100_000,
        basisInput: { basis: "floorArea", businessAreaSqm: 5, totalAreaSqm: Infinity },
      })
    ).toThrow(/数値で入力/);
  });
});

describe("calculateApportionment — 使用時間按分", () => {
  it("treats zero business hours as 0% deductible", () => {
    const result = calculateApportionment({
      totalAmount: 50_000,
      basisInput: { basis: "time", businessHoursPerWeek: 0 },
    });

    expect(result.businessUseRatioPercent).toBe(0);
    expect(result.deductibleAmount).toBe(0);
  });

  it("treats business hours equal to a custom total as 100% deductible", () => {
    const result = calculateApportionment({
      totalAmount: 40_000,
      basisInput: { basis: "time", businessHoursPerWeek: 56, totalHoursPerWeek: 56 },
    });

    expect(result.businessUseRatioPercent).toBe(100);
    expect(result.deductibleAmount).toBe(40_000);
  });

  it("rejects a negative total-hours-per-week distinctly from the zero case (0以上 check runs before the >0 check)", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 10_000,
        basisInput: { basis: "time", businessHoursPerWeek: 10, totalHoursPerWeek: -1 },
      })
    ).toThrow(/0以上/);
  });

  it("rejects a negative business-hours-per-week", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 10_000,
        basisInput: { basis: "time", businessHoursPerWeek: -5 },
      })
    ).toThrow(/0以上/);
  });

  it("computes the deductible amount from business hours per week against the default 168-hour week", () => {
    const result = calculateApportionment({
      totalAmount: 33_600,
      basisInput: { basis: "time", businessHoursPerWeek: 42 },
    });

    // 42 / 168 = 25%
    expect(result.businessUseRatioPercent).toBeCloseTo(25);
    expect(result.deductibleAmount).toBe(8_400);
    expect(result.basisDescription).toMatch(/使用時間按分/);
    expect(result.basisDescription).toMatch(new RegExp(String(DEFAULT_TOTAL_HOURS_PER_WEEK)));
  });

  it("honors a custom total-hours-per-week basis (e.g. business days/week model)", () => {
    // 5 business days out of 7 modeled as hours: 40 business hours out of a 56-hour reference week.
    const result = calculateApportionment({
      totalAmount: 70_000,
      basisInput: { basis: "time", businessHoursPerWeek: 40, totalHoursPerWeek: 56 },
    });

    expect(result.businessUseRatioPercent).toBeCloseTo((40 / 56) * 100);
    expect(result.deductibleAmount).toBe(Math.floor(70_000 * (40 / 56)));
  });

  it("rejects business hours exceeding the total hours", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 10_000,
        basisInput: { basis: "time", businessHoursPerWeek: 200 },
      })
    ).toThrow(/超える/);
  });

  it("rejects a non-positive total-hours-per-week", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: 10_000,
        basisInput: { basis: "time", businessHoursPerWeek: 10, totalHoursPerWeek: 0 },
      })
    ).toThrow(/0より大きい/);
  });
});

describe("calculateApportionment — 端数処理（円未満切り捨て）", () => {
  it("truncates (does not round) a fractional yen result down to the whole yen", () => {
    // 10,000 * (1/3) = 3,333.33... -> must truncate to 3,333, never round to 3,333.33 or round up to 3,334.
    const result = calculateApportionment({
      totalAmount: 10_000,
      basisInput: { basis: "floorArea", businessAreaSqm: 1, totalAreaSqm: 3 },
    });

    expect(result.deductibleAmount).toBe(3_333);
  });

  it("returns 0 for a zero total amount regardless of ratio", () => {
    const result = calculateApportionment({
      totalAmount: 0,
      basisInput: { basis: "floorArea", businessAreaSqm: 20, totalAreaSqm: 50 },
    });

    expect(result.deductibleAmount).toBe(0);
    expect(result.businessUseRatioPercent).toBeCloseTo(40);
  });

  it("rejects a negative total amount", () => {
    expect(() =>
      calculateApportionment({
        totalAmount: -1,
        basisInput: { basis: "floorArea", businessAreaSqm: 20, totalAreaSqm: 50 },
      })
    ).toThrow(/0以上/);
  });
});

describe("calculateApportionmentFromRatio", () => {
  it("computes the deductible amount directly from a ratio percent", () => {
    const result = calculateApportionmentFromRatio(50_000, 30);
    expect(result.deductibleAmount).toBe(15_000);
    expect(result.businessUseRatioPercent).toBe(30);
    expect(result.disclaimer).toBe(APPORTIONMENT_DISCLAIMER);
  });

  it("accepts the 0% edge", () => {
    const result = calculateApportionmentFromRatio(50_000, 0);
    expect(result.deductibleAmount).toBe(0);
  });

  it("accepts the 100% edge", () => {
    const result = calculateApportionmentFromRatio(50_000, 100);
    expect(result.deductibleAmount).toBe(50_000);
  });

  it("rejects a negative ratio", () => {
    expect(() => calculateApportionmentFromRatio(50_000, -1)).toThrow(/0%〜100%/);
  });

  it("rejects a ratio greater than 100", () => {
    expect(() => calculateApportionmentFromRatio(50_000, 100.5)).toThrow(/0%〜100%/);
  });

  it("rejects a NaN ratio", () => {
    expect(() => calculateApportionmentFromRatio(50_000, NaN)).toThrow(/数値で入力/);
  });

  it("accepts a zero total amount, returning a zero deductible regardless of ratio", () => {
    const result = calculateApportionmentFromRatio(0, 50);
    expect(result.deductibleAmount).toBe(0);
  });

  it("rejects a negative total amount", () => {
    expect(() => calculateApportionmentFromRatio(-1, 50)).toThrow(/0以上/);
  });

  it("rejects a non-finite (Infinity) total amount", () => {
    expect(() => calculateApportionmentFromRatio(Infinity, 50)).toThrow(/数値で入力/);
  });

  it("rejects a NaN total amount", () => {
    expect(() => calculateApportionmentFromRatio(NaN, 50)).toThrow(/数値で入力/);
  });
});
