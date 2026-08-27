import { describe, expect, it } from "vitest";
import {
  buildLoanAmortizationSchedule,
  installmentsWithinPeriod,
  Loan,
  outstandingPrincipalAsOf,
  summarizeLoanForPeriod,
} from "./loanAmortization";

describe("buildLoanAmortizationSchedule", () => {
  it("computes an equal-principal (元金均等) schedule with constant principal payments", () => {
    const loan: Loan = {
      id: "loan-1",
      name: "テスト融資（元金均等）",
      principalAmount: 1_200_000,
      interestRate: 0.06, // 年利6%、月利0.5%
      startDate: "2026-01-15",
      termMonths: 12,
      repaymentType: "equal-principal",
    };

    const schedule = buildLoanAmortizationSchedule(loan);

    expect(schedule.repaymentType).toBe("equal-principal");
    expect(schedule.installments).toHaveLength(12);

    // 初回返済日は借入日の1ヶ月後、同じ日にち
    expect(schedule.installments[0].paymentDate).toBe("2026-02-15");
    expect(schedule.installments[11].paymentDate).toBe("2027-01-15");

    // 元金均等: 毎回の元本返済額は一定（1,200,000 / 12 = 100,000）
    for (const installment of schedule.installments) {
      expect(installment.principalPayment).toBe(100_000);
    }

    // 初回の利息 = 1,200,000 * 0.06 / 12 = 6,000円
    expect(schedule.installments[0].interestPayment).toBe(6_000);
    // 利息は元本残高の減少にあわせて毎回減っていく
    expect(schedule.installments[1].interestPayment).toBeLessThan(schedule.installments[0].interestPayment);

    // 最終回で残高がちょうど0円になる
    expect(schedule.installments[11].closingPrincipal).toBe(0);
    expect(schedule.totalPrincipal).toBe(1_200_000);
  });

  it("computes an equal-payment (元利均等) schedule with a constant total payment", () => {
    const loan: Loan = {
      id: "loan-2",
      name: "テスト融資（元利均等）",
      principalAmount: 1_200_000,
      interestRate: 0.06,
      startDate: "2026-01-15",
      termMonths: 12,
      repaymentType: "equal-payment",
    };

    const schedule = buildLoanAmortizationSchedule(loan);

    expect(schedule.repaymentType).toBe("equal-payment");
    expect(schedule.installments).toHaveLength(12);

    // 元利均等: 毎回の返済額（元本＋利息）はほぼ一定（最終回は端数調整のためズレうる）
    const firstPayment = schedule.installments[0].totalPayment;
    for (const installment of schedule.installments.slice(0, -1)) {
      expect(installment.totalPayment).toBe(firstPayment);
    }

    // 元本返済額は回を追うごとに増加し、利息は減少する
    expect(schedule.installments[1].principalPayment).toBeGreaterThan(schedule.installments[0].principalPayment);
    expect(schedule.installments[1].interestPayment).toBeLessThan(schedule.installments[0].interestPayment);

    // 最終回で残高がちょうど0円になり、元本返済額の合計は借入元本と一致する
    expect(schedule.installments[11].closingPrincipal).toBe(0);
    expect(schedule.totalPrincipal).toBe(1_200_000);
  });

  it("treats a missing repaymentType as equal-principal", () => {
    const loan: Loan = {
      id: "loan-3",
      name: "返済方式未指定",
      principalAmount: 600_000,
      interestRate: 0.02,
      startDate: "2026-04-01",
      termMonths: 6,
    };

    const schedule = buildLoanAmortizationSchedule(loan);
    expect(schedule.repaymentType).toBe("equal-principal");
    expect(schedule.installments[0].principalPayment).toBe(100_000);
  });

  it("handles a zero interest rate by dividing principal evenly with no interest", () => {
    const loan: Loan = {
      id: "loan-4",
      name: "無利息融資",
      principalAmount: 300_000,
      interestRate: 0,
      startDate: "2026-01-01",
      termMonths: 3,
      repaymentType: "equal-payment",
    };

    const schedule = buildLoanAmortizationSchedule(loan);
    for (const installment of schedule.installments) {
      expect(installment.interestPayment).toBe(0);
      expect(installment.principalPayment).toBe(100_000);
    }
  });

  it("rolls the payment date to the last day of a shorter month when the day-of-month doesn't exist", () => {
    const loan: Loan = {
      id: "loan-5",
      name: "月末繰り下げ確認",
      principalAmount: 100_000,
      interestRate: 0,
      startDate: "2026-01-31",
      termMonths: 2,
    };

    const schedule = buildLoanAmortizationSchedule(loan);
    // 2026年は平年なので2月は28日まで
    expect(schedule.installments[0].paymentDate).toBe("2026-02-28");
    expect(schedule.installments[1].paymentDate).toBe("2026-03-31");
  });
});

describe("outstandingPrincipalAsOf", () => {
  const loan: Loan = {
    id: "loan-6",
    name: "残高確認用",
    principalAmount: 1_200_000,
    interestRate: 0.06,
    startDate: "2026-01-15",
    termMonths: 12,
    repaymentType: "equal-principal",
  };

  it("returns 0 before the loan's start date", () => {
    expect(outstandingPrincipalAsOf(loan, "2025-12-31")).toBe(0);
  });

  it("returns the full principal before the first repayment date", () => {
    expect(outstandingPrincipalAsOf(loan, "2026-02-01")).toBe(1_200_000);
  });

  it("reflects repayments made on or before the given date", () => {
    // 2026-02-15の返済（1回目）まで反映
    expect(outstandingPrincipalAsOf(loan, "2026-02-15")).toBe(1_100_000);
    // 2026-06-15までに5回返済済み
    expect(outstandingPrincipalAsOf(loan, "2026-06-15")).toBe(700_000);
  });

  it("returns 0 after the final installment", () => {
    expect(outstandingPrincipalAsOf(loan, "2027-01-15")).toBe(0);
    expect(outstandingPrincipalAsOf(loan, "2027-06-01")).toBe(0);
  });
});

describe("installmentsWithinPeriod / summarizeLoanForPeriod", () => {
  const loan: Loan = {
    id: "loan-7",
    name: "期間集計用",
    principalAmount: 1_200_000,
    interestRate: 0.06,
    startDate: "2026-01-15",
    termMonths: 12,
    repaymentType: "equal-principal",
  };

  it("extracts only the installments whose payment date falls within the period", () => {
    const monthly = installmentsWithinPeriod(loan, { start: "2026-04-01", end: "2026-04-30" });
    expect(monthly).toHaveLength(1);
    expect(monthly[0].paymentDate).toBe("2026-04-15");
  });

  it("summarizes a full fiscal year of repayments", () => {
    const summary = summarizeLoanForPeriod(loan, { start: "2026-01-01", end: "2026-12-31" });

    // 2026年中に返済日が到来するのは 2/15〜12/15 の11回
    expect(summary.installments).toHaveLength(11);
    expect(summary.totalPrincipalPayment).toBe(1_100_000);
    expect(summary.openingPrincipal).toBe(0); // 借入自体が期首(1/1)より後の1/15のため
    expect(summary.closingPrincipal).toBe(outstandingPrincipalAsOf(loan, "2026-12-31"));
  });

  it("computes a nonzero opening balance for a period that starts after the loan has been running", () => {
    // 2027年は最終回（12回目、2027-01-15）のみが期間内に含まれる
    const summary = summarizeLoanForPeriod(loan, { start: "2027-01-01", end: "2027-12-31" });
    expect(summary.openingPrincipal).toBe(100_000); // 2026年中の11回返済後の残高
    expect(summary.installments).toHaveLength(1);
    expect(summary.closingPrincipal).toBe(0);
  });
});
