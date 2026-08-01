import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import {
  compareBudgetToActual,
  computeActualExpenseByCategory,
  formatPeriod,
  knownExpenseCategories,
  parseBudgetInputYen,
  removeCategoryBudget,
  upsertCategoryBudget,
} from "./budgetTracking";

function tx(overrides: Partial<CategorizedTransaction> & { id: string; amount: number; account: string }): CategorizedTransaction {
  return {
    date: "2026-06-01",
    description: "test",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("computeActualExpenseByCategory", () => {
  it("sums the absolute value of expense (negative amount) rows per category within the period", () => {
    const totals = computeActualExpenseByCategory(
      [
        tx({ id: "1", date: "2026-06-05", amount: -1000, account: "通信費" }),
        tx({ id: "2", date: "2026-06-20", amount: -500, account: "通信費" }),
        tx({ id: "3", date: "2026-06-10", amount: -2000, account: "旅費交通費" }),
      ],
      "2026-06"
    );
    expect(totals.get("通信費")).toBe(1500);
    expect(totals.get("旅費交通費")).toBe(2000);
  });

  it("excludes income rows (amount >= 0)", () => {
    const totals = computeActualExpenseByCategory(
      [tx({ id: "1", date: "2026-06-05", amount: 100000, account: "売上高" })],
      "2026-06"
    );
    expect(totals.size).toBe(0);
  });

  it("excludes rows outside the requested period", () => {
    const totals = computeActualExpenseByCategory(
      [tx({ id: "1", date: "2026-05-31", amount: -1000, account: "通信費" })],
      "2026-06"
    );
    expect(totals.size).toBe(0);
  });

  // 回帰テスト: personalDeductionOnly（国民健康保険・国民年金・生命保険料等）は
  // 個人事業主の所得控除項目であり事業の必要経費ではないため、estimate.ts /
  // individualForms.ts / consumptionTaxForm.ts と同様に実績支出から除外する必要がある。
  // 修正前は tx.amount < 0 であれば無条件に合算しており、この行も事業経費として
  // カウントしてしまっていた（budgetTracking.ts の computeActualExpenseByCategory）。
  it("excludes personalDeductionOnly rows (personal social insurance / life insurance) from the actual expense total", () => {
    const totals = computeActualExpenseByCategory(
      [
        tx({
          id: "1",
          date: "2026-06-05",
          amount: -30000,
          account: "社会保険料(個人)",
          personalDeductionOnly: true,
        }),
        tx({ id: "2", date: "2026-06-10", amount: -1000, account: "通信費" }),
      ],
      "2026-06"
    );
    expect(totals.has("社会保険料(個人)")).toBe(false);
    expect(totals.get("通信費")).toBe(1000);
  });

  it("does not let a personalDeductionOnly-only category surface in the comparison at all", () => {
    const result = compareBudgetToActual(
      [{ account: "社会保険料(個人)", monthlyBudgetYen: 20000 }],
      [
        tx({
          id: "1",
          date: "2026-06-05",
          amount: -30000,
          account: "社会保険料(個人)",
          personalDeductionOnly: true,
        }),
      ],
      "2026-06"
    );
    // 実績が0円扱いになるため under_budget（＝所得控除の支払いが「事業予算の超過」として
    // 誤って警告されない）
    const c = result.comparisons.find((x) => x.account === "社会保険料(個人)")!;
    expect(c.actualYen).toBe(0);
    expect(c.status).toBe("under_budget");
    expect(c.isOverBudget).toBe(false);
    expect(result.totalActualYen).toBe(0);
  });
});

describe("compareBudgetToActual", () => {
  it("flags a normal over-budget category and a normal under-budget category", () => {
    const result = compareBudgetToActual(
      [
        { account: "通信費", monthlyBudgetYen: 5000 },
        { account: "旅費交通費", monthlyBudgetYen: 10000 },
      ],
      [
        tx({ id: "1", date: "2026-06-05", amount: -8000, account: "通信費" }),
        tx({ id: "2", date: "2026-06-10", amount: -4000, account: "旅費交通費" }),
      ],
      "2026-06"
    );

    const comm = result.comparisons.find((c) => c.account === "通信費")!;
    expect(comm.status).toBe("over_budget");
    expect(comm.isOverBudget).toBe(true);
    expect(comm.varianceYen).toBe(5000 - 8000);
    expect(comm.overagePercent).toBeCloseTo(60);

    const travel = result.comparisons.find((c) => c.account === "旅費交通費")!;
    expect(travel.status).toBe("under_budget");
    expect(travel.isOverBudget).toBe(false);
    expect(travel.varianceYen).toBe(10000 - 4000);
    expect(travel.overagePercent).toBeCloseTo(-60);

    expect(result.overBudgetCount).toBe(1);
    expect(result.totalActualYen).toBe(12000);
    expect(result.totalBudgetYen).toBe(15000);
  });

  it("returns overagePercent: null (not NaN/Infinity) and status over_budget_no_cap for a zero budget with nonzero spend", () => {
    const result = compareBudgetToActual(
      [{ account: "接待交際費", monthlyBudgetYen: 0 }],
      [tx({ id: "1", date: "2026-06-05", amount: -3000, account: "接待交際費" })],
      "2026-06"
    );
    const c = result.comparisons[0];
    expect(c.status).toBe("over_budget_no_cap");
    expect(c.isOverBudget).toBe(true);
    expect(c.overagePercent).toBeNull();
    expect(c.varianceYen).toBe(-3000);
    expect(result.overBudgetCount).toBe(1);
  });

  it("treats a zero budget with zero spend as at_budget, not an error", () => {
    const result = compareBudgetToActual([{ account: "接待交際費", monthlyBudgetYen: 0 }], [], "2026-06");
    const c = result.comparisons[0];
    expect(c.status).toBe("at_budget");
    expect(c.isOverBudget).toBe(false);
    expect(c.overagePercent).toBeNull();
    expect(c.varianceYen).toBe(0);
  });

  it("handles no transactions yet in the period as full budget remaining (under_budget)", () => {
    const result = compareBudgetToActual([{ account: "通信費", monthlyBudgetYen: 5000 }], [], "2026-06");
    expect(result.comparisons).toHaveLength(1);
    const c = result.comparisons[0];
    expect(c.actualYen).toBe(0);
    expect(c.status).toBe("under_budget");
    expect(c.varianceYen).toBe(5000);
    expect(c.overagePercent).toBeCloseTo(-100);
    expect(result.totalActualYen).toBe(0);
  });

  it("marks a category with spend but no budget set (or a budget removed later) as no_budget_set", () => {
    const result = compareBudgetToActual(
      [],
      [tx({ id: "1", date: "2026-06-05", amount: -1200, account: "消耗品費" })],
      "2026-06"
    );
    const c = result.comparisons[0];
    expect(c.status).toBe("no_budget_set");
    expect(c.budgetYen).toBeNull();
    expect(c.varianceYen).toBeNull();
    expect(c.overagePercent).toBeNull();
    expect(c.isOverBudget).toBe(false);
    // no_budget_set は「超過」としてカウントしない（比較対象の予算が存在しないため）
    expect(result.overBudgetCount).toBe(0);
    // 予算未設定カテゴリの実績は totalBudgetYen には含まれないが、totalActualYen には含まれる
    expect(result.totalActualYen).toBe(1200);
    expect(result.totalBudgetYen).toBe(0);
  });

  it("treats a category at exactly its budget as at_budget", () => {
    const result = compareBudgetToActual(
      [{ account: "水道光熱費", monthlyBudgetYen: 4000 }],
      [tx({ id: "1", date: "2026-06-05", amount: -4000, account: "水道光熱費" })],
      "2026-06"
    );
    expect(result.comparisons[0].status).toBe("at_budget");
    expect(result.comparisons[0].isOverBudget).toBe(false);
    expect(result.comparisons[0].varianceYen).toBe(0);
  });

  it("omits categories that have neither a budget nor any spend in the period", () => {
    const result = compareBudgetToActual(
      [{ account: "通信費", monthlyBudgetYen: 5000 }],
      [tx({ id: "1", date: "2026-05-05", amount: -1000, account: "旅費交通費" })], // 別期間
      "2026-06"
    );
    expect(result.comparisons.map((c) => c.account)).toEqual(["通信費"]);
  });

  it("sorts comparisons and returns an empty result when there is nothing to compare", () => {
    const result = compareBudgetToActual([], [], "2026-06");
    expect(result.comparisons).toEqual([]);
    expect(result.overBudgetCount).toBe(0);
    expect(result.totalActualYen).toBe(0);
    expect(result.totalBudgetYen).toBe(0);
  });
});

describe("parseBudgetInputYen", () => {
  it("parses a valid numeric string and rounds to the nearest yen", () => {
    expect(parseBudgetInputYen("1500.6")).toBe(1501);
  });

  it("treats empty string, non-numeric input, negative numbers, NaN and Infinity as 0", () => {
    expect(parseBudgetInputYen("")).toBe(0);
    expect(parseBudgetInputYen("abc")).toBe(0);
    expect(parseBudgetInputYen("-100")).toBe(0);
    expect(parseBudgetInputYen("NaN")).toBe(0);
    expect(parseBudgetInputYen("Infinity")).toBe(0);
  });
});

describe("upsertCategoryBudget / removeCategoryBudget", () => {
  it("adds a new budget entry immutably", () => {
    const original = [{ account: "通信費", monthlyBudgetYen: 5000 }];
    const next = upsertCategoryBudget(original, "旅費交通費", 10000);
    expect(next).toHaveLength(2);
    expect(original).toHaveLength(1); // 元の配列は変更されない
  });

  it("updates an existing budget entry in place (by account) rather than duplicating it", () => {
    const original = [{ account: "通信費", monthlyBudgetYen: 5000 }];
    const next = upsertCategoryBudget(original, "通信費", 8000);
    expect(next).toEqual([{ account: "通信費", monthlyBudgetYen: 8000 }]);
  });

  it("removes a budget entry by account", () => {
    const original = [
      { account: "通信費", monthlyBudgetYen: 5000 },
      { account: "旅費交通費", monthlyBudgetYen: 10000 },
    ];
    const next = removeCategoryBudget(original, "通信費");
    expect(next).toEqual([{ account: "旅費交通費", monthlyBudgetYen: 10000 }]);
  });
});

describe("knownExpenseCategories", () => {
  it("returns a deduplicated list of account names reused from categorize/dictionary.ts", () => {
    const categories = knownExpenseCategories();
    expect(categories.length).toBe(new Set(categories).size);
    expect(categories).toContain("通信費");
    expect(categories).toContain("地代家賃");
  });
});

describe("formatPeriod", () => {
  it("formats a date as YYYY-MM with zero-padded month", () => {
    expect(formatPeriod(new Date(2026, 0, 15))).toBe("2026-01");
    expect(formatPeriod(new Date(2026, 10, 1))).toBe("2026-11");
  });
});
