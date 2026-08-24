import { describe, expect, it } from "vitest";
import {
  BENCHMARK_DISCLAIMER,
  BENCHMARK_SEGMENTS,
  buildBenchmarkComparison,
} from "./benchmarkComparison";
import { CategorizedTransaction } from "../categorize/engine";
import { OTHER_ACCOUNT_LABEL } from "../tax/expenseBreakdown";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "経費合計",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildBenchmarkComparison - basic comparison", () => {
  it("computes each category's amount and percent-of-revenue, and pairs it with the benchmark reference value", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      tx({ id: "rent", account: "地代家賃", amount: -80_000 }),
      tx({ id: "comms", account: "通信費", amount: -30_000 }),
    ];

    const result = buildBenchmarkComparison(rows, "freelancer");

    expect(result.segment).toBe("freelancer");
    expect(result.segmentLabel).toBe("フリーランス・個人事業主");
    expect(result.revenue).toBe(1_000_000);
    expect(result.disclaimer).toBe(BENCHMARK_DISCLAIMER);

    const rent = result.categories.find((c) => c.account === "地代家賃");
    expect(rent).toBeDefined();
    expect(rent?.userAmount).toBe(80_000);
    expect(rent?.userPercentOfRevenue).toBeCloseTo(8);
    expect(rent?.benchmarkPercentOfRevenue).toBe(8);
    expect(rent?.differencePoints).toBeCloseTo(0);

    const comms = result.categories.find((c) => c.account === "通信費");
    expect(comms?.userPercentOfRevenue).toBeCloseTo(3);
    expect(comms?.benchmarkPercentOfRevenue).toBe(3);
  });

  it("sorts categories by expense amount, descending, matching the expense breakdown ordering", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 2_000_000 }),
      tx({ id: "small", account: "通信費", amount: -10_000 }),
      tx({ id: "big", account: "外注費", amount: -400_000 }),
    ];
    const result = buildBenchmarkComparison(rows, "freelancer");
    expect(result.categories.map((c) => c.account)).toEqual(["外注費", "通信費"]);
  });

  it("differencePoints is positive when the user spends more (as % of revenue) than the benchmark", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      tx({ id: "rent", account: "地代家賃", amount: -150_000 }), // 15% vs 8% benchmark
    ];
    const result = buildBenchmarkComparison(rows, "freelancer");
    const rent = result.categories.find((c) => c.account === "地代家賃");
    expect(rent?.userPercentOfRevenue).toBeCloseTo(15);
    expect(rent?.differencePoints).toBeCloseTo(7);
  });
});

describe("buildBenchmarkComparison - edge cases", () => {
  it("returns userPercentOfRevenue: null (not NaN/Infinity) when revenue is zero", () => {
    const rows = [tx({ id: "rent", account: "地代家賃", amount: -50_000 })];
    const result = buildBenchmarkComparison(rows, "freelancer");
    expect(result.revenue).toBe(0);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].userPercentOfRevenue).toBeNull();
    // benchmark data is still available for a zero-revenue user; only the user-side ratio is unknown
    expect(result.categories[0].benchmarkPercentOfRevenue).toBe(8);
    expect(result.categories[0].differencePoints).toBeNull();
  });

  it("returns an empty categories array (not a crash) when there is no expense data at all", () => {
    const rows = [tx({ id: "income", account: "売上高", amount: 500_000 })];
    const result = buildBenchmarkComparison(rows, "freelancer");
    expect(result.revenue).toBe(500_000);
    expect(result.categories).toEqual([]);
  });

  it("returns an empty comparison (no crash) for a completely empty transaction list (new user, no data yet)", () => {
    const result = buildBenchmarkComparison([], "freelancer");
    expect(result.revenue).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.disclaimer).toBe(BENCHMARK_DISCLAIMER);
  });

  it("handles a single expense category correctly", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 400_000 }),
      tx({ id: "only", account: "消耗品費", amount: -20_000 }),
    ];
    const result = buildBenchmarkComparison(rows, "freelancer");
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].account).toBe("消耗品費");
    expect(result.categories[0].userPercentOfRevenue).toBeCloseTo(5);
  });

  it("returns benchmarkPercentOfRevenue: null for an account with no reference data, without crashing", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      tx({ id: "misc", account: "雑費", amount: -10_000 }),
    ];
    const result = buildBenchmarkComparison(rows, "freelancer");
    const misc = result.categories.find((c) => c.account === "雑費");
    expect(misc?.benchmarkPercentOfRevenue).toBeNull();
    expect(misc?.differencePoints).toBeNull();
    expect(misc?.userPercentOfRevenue).toBeCloseTo(1);
  });

  it("always treats the aggregated その他 bucket as having no benchmark reference value", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      ...Array.from({ length: 8 }, (_, i) =>
        tx({ id: `misc-${i}`, account: `科目${i}`, amount: -1_000 * (i + 1) })
      ),
    ];
    const result = buildBenchmarkComparison(rows, "freelancer", 3);
    const other = result.categories.find((c) => c.account === OTHER_ACCOUNT_LABEL);
    expect(other).toBeDefined();
    expect(other?.benchmarkPercentOfRevenue).toBeNull();
    expect(other?.differencePoints).toBeNull();
  });

  it("falls back to the raw segment id as the label when given an unknown segment id", () => {
    // @ts-expect-error intentionally passing an invalid segment id to test the fallback / no-crash path
    const result = buildBenchmarkComparison([tx({ account: "売上高", amount: 100_000 })], "unknownSegment");
    expect(result.segmentLabel).toBe("unknownSegment");
    expect(result.categories).toEqual([]);
  });

  it("returns benchmarkPercentOfRevenue: null for every category when the segment has no distribution data", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      tx({ id: "rent", account: "地代家賃", amount: -50_000 }),
    ];
    // @ts-expect-error intentionally passing an invalid segment id to test missing-benchmark-data handling
    const result = buildBenchmarkComparison(rows, "doesNotExist");
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].benchmarkPercentOfRevenue).toBeNull();
  });

  it("computes revenue the same way as salesTrend.ts: excludeFromIncome rows are not counted as revenue", () => {
    const rows = [
      tx({ id: "income", account: "売上高", amount: 1_000_000 }),
      tx({ id: "loan", account: "借入金", amount: 3_000_000, excludeFromIncome: true }),
      tx({ id: "rent", account: "地代家賃", amount: -100_000 }),
    ];
    const result = buildBenchmarkComparison(rows, "freelancer");
    expect(result.revenue).toBe(1_000_000);
    expect(result.categories[0].userPercentOfRevenue).toBeCloseTo(10);
  });
});

describe("BENCHMARK_SEGMENTS", () => {
  it("exposes both the freelancer and micro-corporation segments with non-empty labels", () => {
    expect(BENCHMARK_SEGMENTS.map((s) => s.id)).toEqual(["freelancer", "microCorp"]);
    for (const s of BENCHMARK_SEGMENTS) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});
