import { describe, expect, it } from "vitest";
import {
  HIGH_VALUE_ASSET_DISCLAIMER,
  HIGH_VALUE_ASSET_PRICE_THRESHOLD,
  MANDATORY_TAXABLE_PERIOD_COUNT,
  determineHighValueAssetTaxableStatus,
  type TaxPeriod,
} from "./highValueAssetTaxableStatus";

// 5期分の連続した課税期間（各1年、1月1日〜12月31日）を用意しておく。
const FISCAL_YEARS: TaxPeriod[] = [
  { startDate: "2024-01-01", endDate: "2024-12-31", label: "2024年分" },
  { startDate: "2025-01-01", endDate: "2025-12-31", label: "2025年分" },
  { startDate: "2026-01-01", endDate: "2026-12-31", label: "2026年分" },
  { startDate: "2027-01-01", endDate: "2027-12-31", label: "2027年分" },
  { startDate: "2028-01-01", endDate: "2028-12-31", label: "2028年分" },
];

describe("determineHighValueAssetTaxableStatus — しきい値未満（影響なし）", () => {
  it("does not flag an acquisition below the ¥10,000,000 threshold", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [
        { acquisitionDate: "2026-06-15", taxExcludedPrice: HIGH_VALUE_ASSET_PRICE_THRESHOLD - 1 },
      ],
    });

    expect(result.hasHighValueAcquisition).toBe(false);
    expect(result.combinedMandatoryTaxablePeriods).toEqual([]);
    expect(result.latestMandatoryTaxableEndDate).toBeNull();
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0].meetsThreshold).toBe(false);
    expect(result.evaluations[0].mandatoryTaxablePeriods).toBeNull();
    expect(result.evaluations[0].acquisitionPeriod).toBeNull();
    expect(result.disclaimer).toBe(HIGH_VALUE_ASSET_DISCLAIMER);
  });
});

describe("determineHighValueAssetTaxableStatus — ちょうど1,000万円（しきい値は「以上」）", () => {
  it("triggers exactly at the ¥10,000,000 threshold ('以上', not '超える')", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [
        { acquisitionDate: "2026-06-15", taxExcludedPrice: HIGH_VALUE_ASSET_PRICE_THRESHOLD },
      ],
    });

    expect(result.hasHighValueAcquisition).toBe(true);
    const evaluation = result.evaluations[0];
    expect(evaluation.meetsThreshold).toBe(true);
    expect(evaluation.acquisitionPeriod).toEqual(FISCAL_YEARS[2]);
    expect(evaluation.mandatoryTaxablePeriods).toEqual([FISCAL_YEARS[2], FISCAL_YEARS[3], FISCAL_YEARS[4]]);
  });
});

describe("determineHighValueAssetTaxableStatus — しきい値超過（強制期間の計算）", () => {
  it("computes the acquisition period plus the following two tax periods as the mandatory window", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [
        {
          acquisitionDate: "2025-04-01",
          taxExcludedPrice: 15_000_000,
          description: "業務用機械装置",
        },
      ],
    });

    expect(result.hasHighValueAcquisition).toBe(true);
    const evaluation = result.evaluations[0];
    expect(evaluation.meetsThreshold).toBe(true);
    expect(evaluation.acquisitionPeriod).toEqual(FISCAL_YEARS[1]);
    expect(evaluation.mandatoryTaxablePeriods).toHaveLength(MANDATORY_TAXABLE_PERIOD_COUNT);
    expect(evaluation.mandatoryTaxablePeriods).toEqual([FISCAL_YEARS[1], FISCAL_YEARS[2], FISCAL_YEARS[3]]);
    expect(evaluation.notes.join(" ")).toMatch(/消費税法12条の4/);

    expect(result.combinedMandatoryTaxablePeriods).toEqual([FISCAL_YEARS[1], FISCAL_YEARS[2], FISCAL_YEARS[3]]);
    expect(result.latestMandatoryTaxableEndDate).toBe("2027-12-31");
  });

  it("returns only the periods available when taxPeriods does not extend far enough into the future", () => {
    const truncatedPeriods = FISCAL_YEARS.slice(0, 3); // 2024, 2025, 2026 のみ
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: truncatedPeriods,
      acquisitions: [{ acquisitionDate: "2026-03-01", taxExcludedPrice: 20_000_000 }],
    });

    const evaluation = result.evaluations[0];
    expect(evaluation.acquisitionPeriod).toEqual(truncatedPeriods[2]);
    expect(evaluation.mandatoryTaxablePeriods).toEqual([truncatedPeriods[2]]);
    expect(evaluation.notes.some((n) => n.includes("データが揃っていない"))).toBe(true);
  });

  it("flags an acquisition whose date is not covered by any provided tax period", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [{ acquisitionDate: "2030-01-01", taxExcludedPrice: 12_000_000 }],
    });

    expect(result.hasHighValueAcquisition).toBe(false);
    const evaluation = result.evaluations[0];
    expect(evaluation.meetsThreshold).toBe(true);
    expect(evaluation.acquisitionPeriod).toBeNull();
    expect(evaluation.mandatoryTaxablePeriods).toBeNull();
    expect(evaluation.notes.join(" ")).toMatch(/見つからない/);
  });
});

describe("determineHighValueAssetTaxableStatus — 複数の資産取得（異なる課税期間）", () => {
  it("combines mandatory periods from multiple qualifying acquisitions in different tax periods, deduplicated", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [
        { acquisitionDate: "2024-05-01", taxExcludedPrice: 11_000_000, description: "資産A" },
        { acquisitionDate: "2026-09-10", taxExcludedPrice: 30_000_000, description: "資産B" },
      ],
    });

    expect(result.hasHighValueAcquisition).toBe(true);
    expect(result.evaluations).toHaveLength(2);

    const [evalA, evalB] = result.evaluations;
    expect(evalA.acquisitionPeriod).toEqual(FISCAL_YEARS[0]);
    expect(evalA.mandatoryTaxablePeriods).toEqual([FISCAL_YEARS[0], FISCAL_YEARS[1], FISCAL_YEARS[2]]);

    expect(evalB.acquisitionPeriod).toEqual(FISCAL_YEARS[2]);
    expect(evalB.mandatoryTaxablePeriods).toEqual([FISCAL_YEARS[2], FISCAL_YEARS[3], FISCAL_YEARS[4]]);

    // 資産Aの強制期間（2024〜2026）と資産Bの強制期間（2026〜2028）が重なる2026年分は重複除去される。
    expect(result.combinedMandatoryTaxablePeriods).toEqual(FISCAL_YEARS);
    expect(result.latestMandatoryTaxableEndDate).toBe("2028-12-31");
  });

  it("ignores below-threshold acquisitions mixed in with a qualifying one, still computing the qualifying one's window", () => {
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: FISCAL_YEARS,
      acquisitions: [
        { acquisitionDate: "2025-02-01", taxExcludedPrice: 3_000_000 },
        { acquisitionDate: "2026-11-01", taxExcludedPrice: 10_500_000 },
      ],
    });

    expect(result.hasHighValueAcquisition).toBe(true);
    expect(result.evaluations[0].meetsThreshold).toBe(false);
    expect(result.evaluations[1].meetsThreshold).toBe(true);
    expect(result.combinedMandatoryTaxablePeriods).toEqual([FISCAL_YEARS[2], FISCAL_YEARS[3], FISCAL_YEARS[4]]);
  });

  it("returns hasHighValueAcquisition=false and empty evaluations for an empty acquisitions list", () => {
    const result = determineHighValueAssetTaxableStatus({ taxPeriods: FISCAL_YEARS, acquisitions: [] });

    expect(result.hasHighValueAcquisition).toBe(false);
    expect(result.evaluations).toEqual([]);
    expect(result.combinedMandatoryTaxablePeriods).toEqual([]);
    expect(result.latestMandatoryTaxableEndDate).toBeNull();
  });
});

describe("determineHighValueAssetTaxableStatus — 入力検証", () => {
  it("throws when taxPeriods is empty", () => {
    expect(() => determineHighValueAssetTaxableStatus({ taxPeriods: [], acquisitions: [] })).toThrow(
      /課税期間/
    );
  });

  it("throws for a negative taxExcludedPrice", () => {
    expect(() =>
      determineHighValueAssetTaxableStatus({
        taxPeriods: FISCAL_YEARS,
        acquisitions: [{ acquisitionDate: "2026-01-01", taxExcludedPrice: -1 }],
      })
    ).toThrow(/0以上/);
  });

  it("throws for a NaN taxExcludedPrice", () => {
    expect(() =>
      determineHighValueAssetTaxableStatus({
        taxPeriods: FISCAL_YEARS,
        acquisitions: [{ acquisitionDate: "2026-01-01", taxExcludedPrice: NaN }],
      })
    ).toThrow(/数値で入力/);
  });

  it("throws for a malformed acquisitionDate", () => {
    expect(() =>
      determineHighValueAssetTaxableStatus({
        taxPeriods: FISCAL_YEARS,
        acquisitions: [{ acquisitionDate: "2026/01/01", taxExcludedPrice: 12_000_000 }],
      })
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws for a tax period whose startDate is after its endDate", () => {
    expect(() =>
      determineHighValueAssetTaxableStatus({
        taxPeriods: [{ startDate: "2026-12-31", endDate: "2026-01-01" }],
        acquisitions: [],
      })
    ).toThrow(/開始日が終了日より後/);
  });

  it("sorts unordered taxPeriods before matching acquisitions against them", () => {
    const shuffled = [FISCAL_YEARS[2], FISCAL_YEARS[0], FISCAL_YEARS[4], FISCAL_YEARS[1], FISCAL_YEARS[3]];
    const result = determineHighValueAssetTaxableStatus({
      taxPeriods: shuffled,
      acquisitions: [{ acquisitionDate: "2025-06-01", taxExcludedPrice: 12_000_000 }],
    });

    expect(result.evaluations[0].acquisitionPeriod).toEqual(FISCAL_YEARS[1]);
    expect(result.evaluations[0].mandatoryTaxablePeriods).toEqual([FISCAL_YEARS[1], FISCAL_YEARS[2], FISCAL_YEARS[3]]);
  });
});
