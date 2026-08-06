import { describe, expect, it } from "vitest";
import { calculateEntertainmentExpenseLimit, ENTERTAINMENT_EXPENSE_LIMIT_DISCLAIMER } from "./entertainmentExpenseLimit";

describe("calculateEntertainmentExpenseLimit", () => {
  it("favors the fixed deduction limit when entertainment meal expense is small relative to the total", () => {
    // 交際費等600万円のうち接待飲食費が200万円 → 定額控除は600万円全額損金算入、
    // 接待飲食費50%は100万円のみ。定額控除の方が有利。
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 6_000_000,
      entertainmentMealExpense: 2_000_000,
      fiscalYearMonths: 12,
    });

    expect(result.roundedFiscalYearMonths).toBe(12);
    expect(result.fixedDeductionLimit).toBe(8_000_000);
    expect(result.fixedDeductionDeductibleAmount).toBe(6_000_000);
    expect(result.halfOfEntertainmentMealExpenseAmount).toBe(1_000_000);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(6_000_000);
    expect(result.nonDeductibleAmount).toBe(0);
    expect(result.disclaimer).toBe(ENTERTAINMENT_EXPENSE_LIMIT_DISCLAIMER);
  });

  it("favors half of entertainment meal expense when the total greatly exceeds the fixed limit", () => {
    // 交際費等3,000万円のうち接待飲食費が2,800万円 → 定額控除は800万円までしか損金算入
    // できないが、接待飲食費の50%は1,400万円まで損金算入できるため、こちらが有利。
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 30_000_000,
      entertainmentMealExpense: 28_000_000,
      fiscalYearMonths: 12,
    });

    expect(result.fixedDeductionLimit).toBe(8_000_000);
    expect(result.fixedDeductionDeductibleAmount).toBe(8_000_000);
    expect(result.halfOfEntertainmentMealExpenseAmount).toBe(14_000_000);
    expect(result.favorableOption).toBe("half_of_entertainment_meal_expense");
    expect(result.deductibleAmount).toBe(14_000_000);
    expect(result.nonDeductibleAmount).toBe(30_000_000 - 14_000_000);
  });

  it("prorates the ¥8,000,000 fixed deduction limit by month for a non-12-month fiscal year, rounding up partial months", () => {
    // 6.2か月の事業年度 → 1か月未満切り上げで7か月として月割り。
    // 定額控除限度額 = floor(8,000,000 * 7 / 12) = floor(4,666,666.67) = 4,666,666円
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 5_000_000,
      entertainmentMealExpense: 1_000_000,
      fiscalYearMonths: 6.2,
    });

    expect(result.roundedFiscalYearMonths).toBe(7);
    expect(result.fixedDeductionLimit).toBe(4_666_666);
    expect(result.fixedDeductionDeductibleAmount).toBe(4_666_666);
    expect(result.halfOfEntertainmentMealExpenseAmount).toBe(500_000);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(4_666_666);
    expect(result.nonDeductibleAmount).toBe(5_000_000 - 4_666_666);
  });

  it("treats an exact 6-month fiscal year as 6 months (no rounding up needed)", () => {
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 3_000_000,
      entertainmentMealExpense: 0,
      fiscalYearMonths: 6,
    });

    expect(result.roundedFiscalYearMonths).toBe(6);
    expect(result.fixedDeductionLimit).toBe(4_000_000);
  });

  it("results in zero non-deductible amount when total entertainment expense is exactly at the ¥8,000,000 threshold", () => {
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 8_000_000,
      entertainmentMealExpense: 0,
      fiscalYearMonths: 12,
    });

    expect(result.fixedDeductionLimit).toBe(8_000_000);
    expect(result.fixedDeductionDeductibleAmount).toBe(8_000_000);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(8_000_000);
    expect(result.nonDeductibleAmount).toBe(0);
  });

  it("treats a single yen above the ¥8,000,000 threshold as fully non-deductible under the fixed option", () => {
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 8_000_001,
      entertainmentMealExpense: 0,
      fiscalYearMonths: 12,
    });

    expect(result.fixedDeductionDeductibleAmount).toBe(8_000_000);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(8_000_000);
    expect(result.nonDeductibleAmount).toBe(1);
  });

  it("handles the zero-expense edge case with no deduction and no non-deductible amount", () => {
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 0,
      entertainmentMealExpense: 0,
      fiscalYearMonths: 12,
    });

    expect(result.fixedDeductionLimit).toBe(8_000_000);
    expect(result.fixedDeductionDeductibleAmount).toBe(0);
    expect(result.halfOfEntertainmentMealExpenseAmount).toBe(0);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(0);
    expect(result.nonDeductibleAmount).toBe(0);
  });

  it("throws when entertainment meal expense exceeds the total entertainment expense", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 1_500_000,
        fiscalYearMonths: 12,
      })
    ).toThrow();
  });

  it("throws for a negative total entertainment expense", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: -1,
        entertainmentMealExpense: 0,
        fiscalYearMonths: 12,
      })
    ).toThrow();
  });

  it("throws when fiscal year months is zero or negative", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 0,
        fiscalYearMonths: 0,
      })
    ).toThrow();
  });

  it("throws when fiscal year months exceeds 12", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 0,
        fiscalYearMonths: 13,
      })
    ).toThrow();
  });

  it("throws when fiscal year months is negative", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 0,
        fiscalYearMonths: -1,
      })
    ).toThrow();
  });

  it("throws when fiscal year months is NaN or Infinity", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 0,
        fiscalYearMonths: NaN,
      })
    ).toThrow();
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: 0,
        fiscalYearMonths: Infinity,
      })
    ).toThrow();
  });

  it("throws for a negative entertainment meal expense", () => {
    expect(() =>
      calculateEntertainmentExpenseLimit({
        totalEntertainmentExpense: 1_000_000,
        entertainmentMealExpense: -1,
        fiscalYearMonths: 12,
      })
    ).toThrow();
  });

  it("picks the fixed deduction limit when both options produce exactly the same deductible amount (a documented tie-break)", () => {
    // total=16,000,000・meal=16,000,000・12か月 -> 定額控除限度額は800万円で頭打ち(=8,000,000)、
    // 接待飲食費の50%も floor(16,000,000×0.5)=8,000,000 で、両者が完全に一致する。
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 16_000_000,
      entertainmentMealExpense: 16_000_000,
      fiscalYearMonths: 12,
    });

    expect(result.fixedDeductionDeductibleAmount).toBe(8_000_000);
    expect(result.halfOfEntertainmentMealExpenseAmount).toBe(8_000_000);
    expect(result.favorableOption).toBe("fixed_deduction_limit");
    expect(result.deductibleAmount).toBe(8_000_000);
  });

  it("tolerates a fiscalYearMonths value that is floating-point-epsilon below an integer (e.g. 12 represented as 11.999999999)", () => {
    const result = calculateEntertainmentExpenseLimit({
      totalEntertainmentExpense: 1_000_000,
      entertainmentMealExpense: 0,
      fiscalYearMonths: 11.999999999,
    });

    expect(result.roundedFiscalYearMonths).toBe(12);
    expect(result.fixedDeductionLimit).toBe(8_000_000);
  });
});
