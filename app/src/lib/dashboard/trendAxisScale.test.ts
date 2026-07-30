import { describe, expect, it } from "vitest";
import { computeTrendAxisRange } from "./trendAxisScale";

describe("computeTrendAxisRange", () => {
  it("always includes 0 in the range even when all values are positive", () => {
    const { min, max } = computeTrendAxisRange([100, 200, 300]);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(300);
  });

  it("pads the min below the smallest negative value, but leaves the max unpadded on the low side", () => {
    // rawMin = -100, rawMax = 300 -> pad = (300 - -100) * 0.1 = 40
    const { min, max } = computeTrendAxisRange([-100, 300]);
    expect(min).toBeCloseTo(-140);
    expect(max).toBeCloseTo(340);
  });

  it("does not pad the min side when all values are non-negative (rawMin stays 0)", () => {
    const { min } = computeTrendAxisRange([50, 150]);
    expect(min).toBe(0);
  });

  it("returns tickCount + 1 evenly spaced ticks from min to max", () => {
    const { min, max, ticks } = computeTrendAxisRange([0, 400], { tickCount: 4 });
    expect(ticks).toHaveLength(5);
    expect(ticks[0]).toBeCloseTo(min);
    expect(ticks[4]).toBeCloseTo(max);
    // Evenly spaced: each step should be (max-min)/4
    const step = (max - min) / 4;
    expect(ticks[1] - ticks[0]).toBeCloseTo(step);
    expect(ticks[2] - ticks[1]).toBeCloseTo(step);
  });

  it("honors a custom tickCount", () => {
    const { ticks } = computeTrendAxisRange([0, 100], { tickCount: 2 });
    expect(ticks).toHaveLength(3);
  });

  describe("empty/all-zero input (e.g. a fiscal year with no transactions yet)", () => {
    it("falls back to a 0-1 padded range when floorMaxAtOne is set and there is no data", () => {
      // rawMax floored to 1 -> pad = (1-0)*0.1 = 0.1 -> max = 1.1
      const { min, max } = computeTrendAxisRange([], { floorMaxAtOne: true });
      expect(min).toBe(0);
      expect(max).toBeCloseTo(1.1);
    });

    it("without floorMaxAtOne, an empty/all-zero series collapses rawMax to 0 and falls back to a pad of 1", () => {
      // rawMax = 0, rawMin = 0 -> pad = (0-0)*0.1 || 1 = 1 (the `|| 1` fallback kicks in)
      const { min, max } = computeTrendAxisRange([], {});
      expect(min).toBe(0);
      expect(max).toBe(1);
    });

    it("treats an array of all zeros the same as an empty array", () => {
      const zero = computeTrendAxisRange([0, 0, 0]);
      const empty = computeTrendAxisRange([]);
      expect(zero).toEqual(empty);
    });
  });

  it("floors rawMax at 1 when all values are negative and floorMaxAtOne is set (TrendBarChart's all-losses case)", () => {
    // rawMax floored to 1, rawMin = -500 -> pad = (1 - -500) * 0.1 = 50.1
    const withFloor = computeTrendAxisRange([-500, -200], { floorMaxAtOne: true });
    const withoutFloor = computeTrendAxisRange([-500, -200]);

    expect(withFloor.max).toBeCloseTo(1 + (1 - -500) * 0.1);
    // Without the floor, rawMax stays 0 (via Math.max(0, ...values)), giving a smaller max.
    expect(withoutFloor.max).toBeLessThan(withFloor.max);
  });

  it("handles a single value", () => {
    const { min, max } = computeTrendAxisRange([42]);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(42);
  });
});
