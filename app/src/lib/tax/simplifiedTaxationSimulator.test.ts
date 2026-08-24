import { describe, expect, it } from "vitest";
import {
  SIMPLIFIED_TAXATION_ELIGIBILITY_THRESHOLD,
  SIMPLIFIED_TAXATION_SIMULATOR_DISCLAIMER,
  TWO_YEAR_LOCK_IN_WARNING,
  simulateSimplifiedVsGeneralTaxation,
} from "./simplifiedTaxationSimulator";

describe("simulateSimplifiedVsGeneralTaxation — 簡易課税が有利なケース", () => {
  it("recommends the simplified method when the deemed purchase rate exceeds the actual input tax ratio", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
      actualTaxablePurchases: 3_000_000,
    });

    expect(result.eligible).toBe(true);
    expect(result.totalTaxableSales).toBe(10_000_000);
    expect(result.taxOnSales).toBe(1_000_000);

    // 第一種事業（卸売業）: みなし仕入率90% → 控除900,000円、納税額100,000円
    expect(result.simplified.deductibleInputTax).toBe(900_000);
    expect(result.simplified.taxDue).toBe(100_000);
    expect(result.simplified.categoryBreakdown).toHaveLength(1);
    expect(result.simplified.categoryBreakdown[0].deemedPurchaseRate).toBe(0.9);
    expect(result.simplified.categoryBreakdown[0].categoryLabel).toContain("卸売業");

    // 原則課税: 実額仕入300万円 → 控除300,000円、納税額700,000円
    expect(result.general.deductibleInputTax).toBe(300_000);
    expect(result.general.taxDue).toBe(700_000);

    expect(result.cheaperMethod).toBe("simplified");
    expect(result.recommendedMethod).toBe("simplified");
    expect(result.taxDueDelta).toBe(600_000);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 原則課税が有利なケース", () => {
  it("recommends the general method when actual input tax credit exceeds the deemed purchase rate", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      businessCategoryBreakdown: [{ category: 6, taxableSales: 10_000_000 }],
      actualTaxablePurchases: 9_000_000,
    });

    // 第六種事業（不動産業）: みなし仕入率40% → 控除400,000円、納税額600,000円
    expect(result.simplified.deductibleInputTax).toBe(400_000);
    expect(result.simplified.taxDue).toBe(600_000);

    // 原則課税: 実額仕入900万円 → 控除900,000円、納税額100,000円
    expect(result.general.deductibleInputTax).toBe(900_000);
    expect(result.general.taxDue).toBe(100_000);

    expect(result.cheaperMethod).toBe("general");
    expect(result.recommendedMethod).toBe("general");
    expect(result.taxDueDelta).toBe(500_000);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 両方式の納税額が一致するケース", () => {
  it("reports a tie when both methods produce the same estimated tax due", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      // 第五種事業（サービス業等）: みなし仕入率50% → 控除500,000円、納税額500,000円
      businessCategoryBreakdown: [{ category: 5, taxableSales: 10_000_000 }],
      // 実額仕入500万円 → 控除500,000円、納税額500,000円（簡易課税と一致）
      actualTaxablePurchases: 5_000_000,
    });

    expect(result.simplified.taxDue).toBe(500_000);
    expect(result.general.taxDue).toBe(500_000);
    expect(result.cheaperMethod).toBe("tie");
    expect(result.recommendedMethod).toBe("tie");
    expect(result.taxDueDelta).toBe(0);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 基準期間課税売上高が5,000万円を超え選択不可のケース", () => {
  it("marks the business as ineligible and forces the recommendation to general taxation", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: SIMPLIFIED_TAXATION_ELIGIBILITY_THRESHOLD + 1,
      businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
      actualTaxablePurchases: 3_000_000,
    });

    expect(result.eligible).toBe(false);
    // 金額だけで見れば簡易課税の方が安いままだが、選択できないので推奨は原則課税に固定される
    expect(result.cheaperMethod).toBe("simplified");
    expect(result.recommendedMethod).toBe("general");
    expect(result.eligibilityNote).toMatch(/選択できません/);
  });

  it("stays eligible exactly at the ¥50,000,000 threshold ('以下', not '未満')", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: SIMPLIFIED_TAXATION_ELIGIBILITY_THRESHOLD,
      businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
      actualTaxablePurchases: 3_000_000,
    });

    expect(result.eligible).toBe(true);
    expect(result.recommendedMethod).toBe(result.cheaperMethod);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 複数事業区分の内訳", () => {
  it("computes a blended deductible input tax across multiple business categories", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      businessCategoryBreakdown: [
        { category: 1, taxableSales: 5_000_000 }, // 90%
        { category: 6, taxableSales: 5_000_000 }, // 40%
      ],
      actualTaxablePurchases: 4_000_000,
    });

    expect(result.totalTaxableSales).toBe(10_000_000);
    // 500,000*0.9 + 500,000*0.4 = 450,000 + 200,000 = 650,000
    expect(result.simplified.deductibleInputTax).toBe(650_000);
    expect(result.simplified.taxDue).toBe(350_000);
    expect(result.simplified.categoryBreakdown).toHaveLength(2);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 事業区分ごとの端数処理の集計順序", () => {
  // Regression: computeSimplifiedEstimate used to truncate each business category's tax-on-sales
  // portion individually (floor(105*0.1)=10, floor(115*0.1)=11 -> summed to 21) instead of
  // truncating once on the combined taxable sales across categories (floor(220*0.1)=22), the same
  // per-subgroup-truncate-then-sum bug already fixed for consumptionTaxForm.ts (commit 2c20dc7) and
  // estimate.ts/corporateEstimate.ts (commit 023166e). This understated the simplified method's
  // taxDue base by 1 yen versus the already-correct top-level taxOnSales field, and the discrepancy
  // grows with the number of business categories.
  it("aggregates taxable sales across business categories before truncating once, matching taxOnSales, instead of truncating each category separately and summing", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      businessCategoryBreakdown: [
        { category: 1, taxableSales: 105 }, // floor(105*0.1) = 10 if truncated alone
        { category: 6, taxableSales: 115 }, // floor(115*0.1) = 11 if truncated alone
      ],
      actualTaxablePurchases: 0,
    });

    // Combined taxable sales = 220 -> floor(220*0.1) = 22 (correct), not 10+11=21 (per-category leak).
    expect(result.taxOnSales).toBe(22);
    // deductibleInputTax = floor(10*0.9) + floor(11*0.4) = 9 + 4 = 13 (per-category rates are
    // legitimately category-specific, only the taxOnSales base used for taxDue must be the
    // single aggregate truncation).
    expect(result.simplified.deductibleInputTax).toBe(13);
    expect(result.simplified.taxDue).toBe(22 - 13);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 固定文言", () => {
  it("always returns the two-year lock-in warning and the disclaimer verbatim", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 20_000_000,
      businessCategoryBreakdown: [{ category: 5, taxableSales: 10_000_000 }],
      actualTaxablePurchases: 5_000_000,
    });

    expect(result.twoYearLockInWarning).toBe(TWO_YEAR_LOCK_IN_WARNING);
    expect(result.twoYearLockInWarning).toMatch(/2年/);
    expect(result.disclaimer).toBe(SIMPLIFIED_TAXATION_SIMULATOR_DISCLAIMER);
    expect(result.disclaimer).toMatch(/税理士/);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — 入力検証", () => {
  it("throws for a negative base-year taxable sales value", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: -1,
        businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
        actualTaxablePurchases: 0,
      })
    ).toThrow(/0以上/);
  });

  it("throws for a NaN actual taxable purchases value", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: 10_000_000,
        businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
        actualTaxablePurchases: NaN,
      })
    ).toThrow(/数値で入力/);
  });

  it("throws when the business category breakdown is empty", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: 10_000_000,
        businessCategoryBreakdown: [],
        actualTaxablePurchases: 0,
      })
    ).toThrow(/事業区分別の課税売上高を1件以上/);
  });

  it("throws for a negative taxable sales value within the category breakdown", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: 10_000_000,
        businessCategoryBreakdown: [{ category: 2, taxableSales: -5 }],
        actualTaxablePurchases: 0,
      })
    ).toThrow(/0以上/);
  });

  it("throws for a negative actualTaxablePurchases value", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: 10_000_000,
        businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
        actualTaxablePurchases: -1,
      })
    ).toThrow(/0以上/);
  });

  it("throws for a non-finite (Infinity) base-year taxable sales value", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: Infinity,
        businessCategoryBreakdown: [{ category: 1, taxableSales: 10_000_000 }],
        actualTaxablePurchases: 0,
      })
    ).toThrow(/数値で入力/);
  });

  it("throws when businessCategoryBreakdown is missing entirely (not just an empty array)", () => {
    expect(() =>
      simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: 10_000_000,
        businessCategoryBreakdown: undefined as unknown as never,
        actualTaxablePurchases: 0,
      })
    ).toThrow(/事業区分別の課税売上高を1件以上/);
  });
});

describe("simulateSimplifiedVsGeneralTaxation — ゼロ値の境界", () => {
  it("treats all-zero sales/purchases as a tie with zero tax due on both methods", () => {
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 0,
      businessCategoryBreakdown: [{ category: 1, taxableSales: 0 }],
      actualTaxablePurchases: 0,
    });

    expect(result.eligible).toBe(true);
    expect(result.totalTaxableSales).toBe(0);
    expect(result.taxOnSales).toBe(0);
    expect(result.simplified.taxDue).toBe(0);
    expect(result.general.taxDue).toBe(0);
    expect(result.cheaperMethod).toBe("tie");
    expect(result.taxDueDelta).toBe(0);
  });

  it("floors fractional yen amounts consistently (Math.floor) rather than rounding", () => {
    // taxableSales=9 -> taxOnSales = floor(9*0.1) = 0, so deductibleInputTax also floors to 0
    const result = simulateSimplifiedVsGeneralTaxation({
      baseYearTaxableSales: 10_000_000,
      businessCategoryBreakdown: [{ category: 1, taxableSales: 9 }],
      actualTaxablePurchases: 9,
    });

    expect(result.taxOnSales).toBe(0);
    expect(result.simplified.deductibleInputTax).toBe(0);
    expect(result.general.deductibleInputTax).toBe(0);
  });
});
