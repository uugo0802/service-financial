import { describe, expect, it } from "vitest";
import { buildYearArchive, YearlyFilingRecord } from "./yearArchive";

function record(overrides: Partial<YearlyFilingRecord>): YearlyFilingRecord {
  return {
    fiscalYear: 2024,
    revenue: 0,
    expenses: 0,
    estimatedTax: 0,
    ...overrides,
  };
}

describe("buildYearArchive", () => {
  it("returns an all-empty view model for no data", () => {
    const result = buildYearArchive([]);

    expect(result.entries).toEqual([]);
    expect(result.yearsRecorded).toBe(0);
    expect(result.continuousYearsStreak).toBe(0);
    expect(result.hasGaps).toBe(false);
    expect(result.earliestFiscalYear).toBeNull();
    expect(result.latestFiscalYear).toBeNull();
  });

  it("handles a single year with no prior year to compare against", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2024, revenue: 8_000_000, expenses: 3_000_000, estimatedTax: 500_000 }),
    ]);

    expect(result.yearsRecorded).toBe(1);
    expect(result.continuousYearsStreak).toBe(1);
    expect(result.hasGaps).toBe(false);
    expect(result.earliestFiscalYear).toBe(2024);
    expect(result.latestFiscalYear).toBe(2024);

    const [entry] = result.entries;
    expect(entry.profit).toBe(5_000_000);
    expect(entry.revenueChangePct).toBeNull();
    expect(entry.profitChangePct).toBeNull();
    expect(entry.isGapYear).toBe(false);
  });

  it("sorts unordered input ascending and computes year-over-year deltas", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2024, revenue: 11_000_000, expenses: 5_000_000, estimatedTax: 900_000 }),
      record({ fiscalYear: 2022, revenue: 8_000_000, expenses: 4_000_000, estimatedTax: 600_000 }),
      record({ fiscalYear: 2023, revenue: 10_000_000, expenses: 4_000_000, estimatedTax: 800_000 }),
    ]);

    expect(result.entries.map((e) => e.fiscalYear)).toEqual([2022, 2023, 2024]);
    expect(result.continuousYearsStreak).toBe(3);
    expect(result.hasGaps).toBe(false);

    const [y2022, y2023, y2024] = result.entries;
    expect(y2022.revenueChangePct).toBeNull();
    expect(y2022.profitChangePct).toBeNull();

    // 売上: 8,000,000 -> 10,000,000 = +25%
    expect(y2023.revenueChangePct).toBe(25);
    // 利益: 4,000,000 -> 6,000,000 = +50%
    expect(y2023.profitChangePct).toBe(50);
    expect(y2023.isGapYear).toBe(false);

    // 売上: 10,000,000 -> 11,000,000 = +10%
    expect(y2024.revenueChangePct).toBe(10);
    // 利益: 6,000,000 -> 6,000,000 = 0%
    expect(y2024.profitChangePct).toBe(0);
    expect(y2024.isGapYear).toBe(false);
  });

  it("flags gap years and only counts the trailing unbroken streak", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2020, revenue: 5_000_000, expenses: 2_000_000, estimatedTax: 300_000 }),
      record({ fiscalYear: 2021, revenue: 5_500_000, expenses: 2_200_000, estimatedTax: 320_000 }),
      // 2022年分の記録が欠落
      record({ fiscalYear: 2023, revenue: 6_000_000, expenses: 2_500_000, estimatedTax: 350_000 }),
      record({ fiscalYear: 2024, revenue: 6_600_000, expenses: 2_700_000, estimatedTax: 400_000 }),
    ]);

    expect(result.entries.map((e) => e.fiscalYear)).toEqual([2020, 2021, 2023, 2024]);
    expect(result.hasGaps).toBe(true);
    // 最新2024から遡ると2023はあるが2022が欠けているため、連続は2024・2023の2年のみ
    expect(result.continuousYearsStreak).toBe(2);

    const [y2020, y2021, y2023, y2024] = result.entries;
    expect(y2020.isGapYear).toBe(false); // 先頭年度は比較対象がないので常にfalse
    expect(y2021.isGapYear).toBe(false); // 2020->2021は連続
    expect(y2023.isGapYear).toBe(true); // 2021->2023は1年飛んでいる
    expect(y2024.isGapYear).toBe(false); // 2023->2024は連続

    // ギャップをまたいでいても、直前に記録がある年度とは増減率自体は計算する
    expect(y2023.revenueChangePct).not.toBeNull();
  });

  it("treats a zero-revenue or zero-profit prior year as an incomputable percentage (null, not Infinity)", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2022, revenue: 0, expenses: 0, estimatedTax: 0 }),
      record({ fiscalYear: 2023, revenue: 3_000_000, expenses: 1_000_000, estimatedTax: 200_000 }),
    ]);

    const [, y2023] = result.entries;
    expect(y2023.revenueChangePct).toBeNull();
    expect(y2023.profitChangePct).toBeNull();
  });

  it("de-duplicates repeated fiscal years, keeping the last occurrence", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2024, revenue: 1_000_000, expenses: 500_000, estimatedTax: 50_000 }),
      record({ fiscalYear: 2024, revenue: 9_000_000, expenses: 4_000_000, estimatedTax: 700_000 }),
    ]);

    expect(result.yearsRecorded).toBe(1);
    expect(result.entries[0].revenue).toBe(9_000_000);
  });

  it("allows negative profit years (loss) without breaking percentage math", () => {
    const result = buildYearArchive([
      record({ fiscalYear: 2023, revenue: 1_000_000, expenses: 3_000_000, estimatedTax: 0 }),
      record({ fiscalYear: 2024, revenue: 1_000_000, expenses: 1_500_000, estimatedTax: 0 }),
    ]);

    const [y2023, y2024] = result.entries;
    expect(y2023.profit).toBe(-2_000_000);
    expect(y2024.profit).toBe(-500_000);
    // -2,000,000 -> -500,000 = +75%（絶対値を分母にした改善率）
    expect(y2024.profitChangePct).toBe(75);
  });
});
