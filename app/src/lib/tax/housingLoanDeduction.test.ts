import { describe, expect, it } from "vitest";
import {
  HOUSING_LOAN_DEDUCTION_DISCLAIMER,
  HOUSING_LOAN_DEDUCTION_RATE,
  HOUSING_LOAN_DEDUCTION_SIMPLIFIED_ANNUAL_CAP,
  HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP,
  calculateHousingLoanDeduction,
} from "./housingLoanDeduction";

describe("calculateHousingLoanDeduction — 通常のケース（上限に達しない）", () => {
  it("年末残高2,000万円・控除率0.7%の場合、控除額は140,000円で上限には達しない", () => {
    const result = calculateHousingLoanDeduction({ yearEndLoanBalance: 20_000_000 });

    expect(result.creditRate).toBe(HOUSING_LOAN_DEDUCTION_RATE);
    expect(result.rawAnnualCredit).toBe(140_000);
    expect(result.annualCreditCap).toBe(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_ANNUAL_CAP);
    expect(result.cappedByLimit).toBe(false);
    expect(result.estimatedAnnualCredit).toBe(140_000);
    expect(result.disclaimer).toBe(HOUSING_LOAN_DEDUCTION_DISCLAIMER);
    expect(result.disclaimer).toContain("個別具体的な税務相談");
    expect(result.disclaimer).toContain("確定申告");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });
});

describe("calculateHousingLoanDeduction — 上限を超えるケース", () => {
  it("年末残高4,000万円の場合、素の控除額(280,000円)は簡易上限(210,000円)でキャップされる", () => {
    const result = calculateHousingLoanDeduction({ yearEndLoanBalance: 40_000_000 });

    expect(result.rawAnnualCredit).toBe(280_000);
    expect(result.annualCreditCap).toBe(210_000);
    expect(result.cappedByLimit).toBe(true);
    expect(result.estimatedAnnualCredit).toBe(210_000);
  });

  it("明示的に指定した上限（例: 既存住宅2,000万円相当=140,000円）でも正しくキャップされる", () => {
    const explicitCap = Math.floor((20_000_000 * HOUSING_LOAN_DEDUCTION_RATE) / 100) * 100; // 140,000円
    const result = calculateHousingLoanDeduction({
      yearEndLoanBalance: 30_000_000,
      annualCreditCap: explicitCap,
    });

    expect(result.rawAnnualCredit).toBe(210_000);
    expect(result.annualCreditCap).toBe(140_000);
    expect(result.cappedByLimit).toBe(true);
    expect(result.estimatedAnnualCredit).toBe(140_000);
  });
});

describe("calculateHousingLoanDeduction — 年末残高が0円のケース", () => {
  it("控除額は0円になる", () => {
    const result = calculateHousingLoanDeduction({ yearEndLoanBalance: 0 });

    expect(result.rawAnnualCredit).toBe(0);
    expect(result.cappedByLimit).toBe(false);
    expect(result.estimatedAnnualCredit).toBe(0);
  });
});

describe("calculateHousingLoanDeduction — 境界値（残高×控除率がちょうど上限と一致する）", () => {
  it("借入限度額3,000万円ちょうどの残高では、素の控除額と上限が完全に一致し、キャップは発生しない", () => {
    const result = calculateHousingLoanDeduction({
      yearEndLoanBalance: HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP,
    });

    expect(result.rawAnnualCredit).toBe(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_ANNUAL_CAP);
    expect(result.rawAnnualCredit).toBe(210_000);
    expect(result.annualCreditCap).toBe(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_ANNUAL_CAP);
    // ちょうど一致する場合は「超過」ではないため、cappedByLimit は false になる
    expect(result.cappedByLimit).toBe(false);
    expect(result.estimatedAnnualCredit).toBe(210_000);
  });

  it("境界値を1円超えると、キャップが発生し控除額は上限に抑えられる", () => {
    const balanceJustOver = HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP + 100_000; // 端数処理後も差が出る程度に超過させる
    const result = calculateHousingLoanDeduction({ yearEndLoanBalance: balanceJustOver });

    expect(result.rawAnnualCredit).toBeGreaterThan(result.annualCreditCap);
    expect(result.cappedByLimit).toBe(true);
    expect(result.estimatedAnnualCredit).toBe(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_ANNUAL_CAP);
  });
});

describe("calculateHousingLoanDeduction — 端数処理（100円未満切り捨て）", () => {
  it("年末残高×控除率が100円未満の端数を含む場合、切り捨てられる", () => {
    // 12,345,678円 × 0.7% = 86,419.746円 → 100円未満切り捨てで86,400円
    const result = calculateHousingLoanDeduction({ yearEndLoanBalance: 12_345_678 });

    expect(result.rawAnnualCredit).toBe(86_400);
    expect(result.estimatedAnnualCredit).toBe(86_400);
  });
});

describe("calculateHousingLoanDeduction — 入力バリデーション", () => {
  it("年末残高が負の数の場合はエラーを投げる", () => {
    expect(() => calculateHousingLoanDeduction({ yearEndLoanBalance: -1 })).toThrow();
  });

  it("年末残高が数値でない場合（NaN/Infinity）もエラーを投げる", () => {
    expect(() => calculateHousingLoanDeduction({ yearEndLoanBalance: NaN })).toThrow();
    expect(() => calculateHousingLoanDeduction({ yearEndLoanBalance: Infinity })).toThrow();
  });

  it("控除率や上限に負の数を指定した場合もエラーを投げる", () => {
    expect(() =>
      calculateHousingLoanDeduction({ yearEndLoanBalance: 10_000_000, creditRate: -0.01 })
    ).toThrow();
    expect(() =>
      calculateHousingLoanDeduction({ yearEndLoanBalance: 10_000_000, annualCreditCap: -1 })
    ).toThrow();
  });
});
