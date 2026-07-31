import { describe, expect, it } from "vitest";
import {
  applyCorporateLossCarryforward,
  applyIndividualLossCarryforward,
  CORPORATE_LOSS_CARRYFORWARD_WINDOW_YEARS,
  deriveUnusedPriorLosses,
  INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS,
} from "./lossCarryforward";

describe("applyIndividualLossCarryforward", () => {
  it("returns no deduction and passes income through unchanged when no prior losses are given", () => {
    const result = applyIndividualLossCarryforward(2026, 3_000_000, []);

    expect(result.totalDeduction).toBe(0);
    expect(result.incomeAfterCarryforward).toBe(3_000_000);
    expect(result.usage).toEqual([]);
  });

  it("also returns no deduction when priorLosses defaults to an empty array", () => {
    const result = applyIndividualLossCarryforward(2026, 3_000_000);
    expect(result.totalDeduction).toBe(0);
    expect(result.incomeAfterCarryforward).toBe(3_000_000);
  });

  it("fully absorbs a single prior-year loss smaller than this year's income", () => {
    const result = applyIndividualLossCarryforward(2026, 3_000_000, [{ fiscalYear: 2025, remainingLoss: 1_000_000 }]);

    expect(result.totalDeduction).toBe(1_000_000);
    expect(result.incomeAfterCarryforward).toBe(2_000_000);
    expect(result.usage).toEqual([
      { fiscalYear: 2025, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 1_000_000, status: "used" },
    ]);
  });

  it("caps the deduction at this year's income, leaving the remainder for a future year (partial use)", () => {
    const result = applyIndividualLossCarryforward(2026, 800_000, [{ fiscalYear: 2025, remainingLoss: 1_000_000 }]);

    expect(result.totalDeduction).toBe(800_000);
    expect(result.incomeAfterCarryforward).toBe(0);
    expect(result.usage).toEqual([
      { fiscalYear: 2025, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 800_000, status: "partially_used" },
    ]);
  });

  it("applies multiple prior-year losses oldest-first (FIFO), spilling into a second year's income", () => {
    const result = applyIndividualLossCarryforward(2026, 1_500_000, [
      { fiscalYear: 2024, remainingLoss: 1_000_000 },
      { fiscalYear: 2025, remainingLoss: 1_000_000 },
    ]);

    // 2024 fully absorbed first (1,000,000), then 500,000 of 2025's loss
    expect(result.totalDeduction).toBe(1_500_000);
    expect(result.incomeAfterCarryforward).toBe(0);
    expect(result.usage).toEqual([
      { fiscalYear: 2024, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 1_000_000, status: "used" },
      { fiscalYear: 2025, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 500_000, status: "partially_used" },
    ]);
  });

  it("treats a loss exactly at the 3-year boundary as still usable, and one year past it as expired", () => {
    const stillUsable = applyIndividualLossCarryforward(2026, 5_000_000, [
      { fiscalYear: 2023, remainingLoss: 200_000 }, // age = 3 (within window)
    ]);
    expect(stillUsable.usage[0].status).toBe("used");
    expect(stillUsable.totalDeduction).toBe(200_000);

    const expired = applyIndividualLossCarryforward(2026, 5_000_000, [
      { fiscalYear: 2022, remainingLoss: 200_000 }, // age = 4 (past the 3-year window)
    ]);
    expect(expired.usage[0].status).toBe("expired");
    expect(expired.totalDeduction).toBe(0);
    expect(expired.incomeAfterCarryforward).toBe(5_000_000);
    expect(expired.notes.join(" ")).toContain("繰越期限");
  });

  it("skips an invalid entry whose fiscalYear is the current year or later, without throwing", () => {
    const result = applyIndividualLossCarryforward(2026, 1_000_000, [{ fiscalYear: 2026, remainingLoss: 500_000 }]);

    expect(result.usage).toEqual([]);
    expect(result.totalDeduction).toBe(0);
    expect(result.incomeAfterCarryforward).toBe(1_000_000);
  });

  it("applies no deduction when this year's income before carryforward is zero or negative", () => {
    const zero = applyIndividualLossCarryforward(2026, 0, [{ fiscalYear: 2025, remainingLoss: 500_000 }]);
    expect(zero.totalDeduction).toBe(0);
    expect(zero.incomeAfterCarryforward).toBe(0);
    expect(zero.usage[0].status).toBe("unused");

    const negative = applyIndividualLossCarryforward(2026, -300_000, [{ fiscalYear: 2025, remainingLoss: 500_000 }]);
    expect(negative.totalDeduction).toBe(0);
    expect(negative.incomeAfterCarryforward).toBe(-300_000);
  });

  it("uses the exported 3-year window constant", () => {
    expect(INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS).toBe(3);
  });

  it("ignores a non-positive remainingLoss entry (zero or negative) instead of treating it as usable", () => {
    const zero = applyIndividualLossCarryforward(2026, 1_000_000, [{ fiscalYear: 2025, remainingLoss: 0 }]);
    expect(zero.usage).toEqual([]);
    expect(zero.totalDeduction).toBe(0);

    const negative = applyIndividualLossCarryforward(2026, 1_000_000, [{ fiscalYear: 2025, remainingLoss: -500 }]);
    expect(negative.usage).toEqual([]);
    expect(negative.totalDeduction).toBe(0);
  });

  it("does not mutate the input priorLosses array (sorts internally on a copy)", () => {
    const priorLosses: PriorYearLoss[] = [
      { fiscalYear: 2025, remainingLoss: 500_000 },
      { fiscalYear: 2024, remainingLoss: 300_000 },
    ];
    const snapshot = priorLosses.map((l) => ({ ...l }));

    applyIndividualLossCarryforward(2026, 2_000_000, priorLosses);

    expect(priorLosses).toEqual(snapshot);
  });
});

describe("applyCorporateLossCarryforward", () => {
  it("returns no deduction and passes income through unchanged when no prior losses are given", () => {
    const result = applyCorporateLossCarryforward(2026, 5_000_000, []);
    expect(result.totalDeduction).toBe(0);
    expect(result.incomeAfterCarryforward).toBe(5_000_000);
  });

  it("fully absorbs a prior-year loss (default 100% cap, no ratio specified)", () => {
    const result = applyCorporateLossCarryforward(2026, 5_000_000, [{ fiscalYear: 2025, remainingLoss: 2_000_000 }]);

    expect(result.totalDeduction).toBe(2_000_000);
    expect(result.incomeAfterCarryforward).toBe(3_000_000);
    expect(result.usage[0].status).toBe("used");
  });

  it("uses the 10-year corporate carryforward window: usable at exactly 10 years, expired at 11", () => {
    const usable = applyCorporateLossCarryforward(2026, 1_000_000, [{ fiscalYear: 2016, remainingLoss: 300_000 }]);
    expect(usable.usage[0].status).toBe("used");

    const expired = applyCorporateLossCarryforward(2026, 1_000_000, [{ fiscalYear: 2015, remainingLoss: 300_000 }]);
    expect(expired.usage[0].status).toBe("expired");
    expect(expired.totalDeduction).toBe(0);
  });

  it("applies multiple prior-year losses oldest-first across several fiscal years, partially carrying the newest forward", () => {
    const result = applyCorporateLossCarryforward(2026, 2_500_000, [
      { fiscalYear: 2023, remainingLoss: 1_000_000 },
      { fiscalYear: 2024, remainingLoss: 1_000_000 },
      { fiscalYear: 2025, remainingLoss: 1_000_000 },
    ]);

    expect(result.totalDeduction).toBe(2_500_000);
    expect(result.incomeAfterCarryforward).toBe(0);
    expect(result.usage).toEqual([
      { fiscalYear: 2023, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 1_000_000, status: "used" },
      { fiscalYear: 2024, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 1_000_000, status: "used" },
      { fiscalYear: 2025, unusedLossBeforeThisYear: 1_000_000, usedThisYear: 500_000, status: "partially_used" },
    ]);
  });

  it("applies a deductionCapRatio (e.g. a large-corporation 50% limit) to cap total deduction below full income", () => {
    const result = applyCorporateLossCarryforward(
      2026,
      1_000_000,
      [{ fiscalYear: 2025, remainingLoss: 900_000 }],
      { deductionCapRatio: 0.5 }
    );

    // Cap = floor(1,000,000 * 0.5) = 500,000, even though the loss and income could otherwise cover more
    expect(result.totalDeduction).toBe(500_000);
    expect(result.incomeAfterCarryforward).toBe(500_000);
    expect(result.usage[0].status).toBe("partially_used");
    expect(result.notes.join(" ")).toContain("50%");
  });

  it("uses the exported 10-year window constant", () => {
    expect(CORPORATE_LOSS_CARRYFORWARD_WINDOW_YEARS).toBe(10);
  });
});

describe("deriveUnusedPriorLosses", () => {
  it("returns an empty array when there is no loss-making year in the history", () => {
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2024, income: 1_000_000 },
        { fiscalYear: 2025, income: 2_000_000 },
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([]);
  });

  it("carries forward a single unabsorbed loss year", () => {
    const result = deriveUnusedPriorLosses(
      [{ fiscalYear: 2025, income: -400_000 }],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([{ fiscalYear: 2025, remainingLoss: 400_000 }]);
  });

  it("nets out a loss year against a later profitable year within history, leaving only the unused remainder", () => {
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2023, income: -1_000_000 },
        { fiscalYear: 2024, income: 600_000 }, // absorbs 600,000 of the 2023 loss
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([{ fiscalYear: 2023, remainingLoss: 400_000 }]);
  });

  it("fully absorbs an old loss within history and returns nothing outstanding", () => {
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2023, income: -500_000 },
        { fiscalYear: 2024, income: 900_000 },
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([]);
  });

  it("drops a loss that expired within the history window before asOfFiscalYear", () => {
    // 2020 loss would expire after 3 years (usable through 2023); by 2026 it's long gone even
    // though it was never absorbed by an intervening profitable year.
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2020, income: -1_000_000 },
        { fiscalYear: 2021, income: 0 },
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([]);
  });

  it("ignores history entries at or after asOfFiscalYear", () => {
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2025, income: -100_000 },
        { fiscalYear: 2026, income: -999_999 }, // should be ignored: not strictly before asOfFiscalYear
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([{ fiscalYear: 2025, remainingLoss: 100_000 }]);
  });

  it("carries an existing loss through a break-even (exactly zero income) year unabsorbed", () => {
    // A zero-income year is neither a loss-making year (no new loss recorded) nor a profitable
    // year (nothing to absorb the outstanding loss with), so the prior loss should pass through
    // unchanged rather than being silently dropped or partially consumed.
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2024, income: -1_000_000 },
        { fiscalYear: 2025, income: 0 },
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([{ fiscalYear: 2024, remainingLoss: 1_000_000 }]);
  });

  it("accepts unsorted history input and still nets losses against later profitable years correctly", () => {
    // Same scenario as the "nets out a loss year" test above, but with history rows deliberately
    // supplied out of fiscalYear order to guard the documented "history need not be sorted" contract.
    const result = deriveUnusedPriorLosses(
      [
        { fiscalYear: 2024, income: 600_000 },
        { fiscalYear: 2023, income: -1_000_000 },
      ],
      2026,
      INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS
    );
    expect(result).toEqual([{ fiscalYear: 2023, remainingLoss: 400_000 }]);
  });

  it("returns an empty array (no crash) for an empty history", () => {
    expect(deriveUnusedPriorLosses([], 2026, INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS)).toEqual([]);
  });
});
