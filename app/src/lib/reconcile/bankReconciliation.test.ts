import { describe, expect, it } from "vitest";
import { DEFAULT_TOLERANCE_YEN, reconcileBankBalance } from "./bankReconciliation";

describe("reconcileBankBalance - basic calculation", () => {
  it("computes expected closing balance as opening balance plus the net of all transactions", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 300000 }, { amount: -50000 }, { amount: -20000 }],
      openingBalance: 1000000,
      actualClosingBalance: 1230000,
    });

    expect(result.netTransactionAmount).toBe(230000);
    expect(result.expectedClosingBalance).toBe(1230000);
    expect(result.discrepancy).toBe(0);
    expect(result.transactionCount).toBe(3);
  });

  it("is reconciled when the actual closing balance matches exactly", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 100000 }, { amount: -40000 }],
      openingBalance: 500000,
      actualClosingBalance: 560000,
    });

    expect(result.isReconciled).toBe(true);
    expect(result.hint).toBeNull();
  });

  it("handles an empty transaction list (expected closing balance equals opening balance)", () => {
    const result = reconcileBankBalance({
      transactions: [],
      openingBalance: 200000,
      actualClosingBalance: 200000,
    });

    expect(result.transactionCount).toBe(0);
    expect(result.netTransactionAmount).toBe(0);
    expect(result.expectedClosingBalance).toBe(200000);
    expect(result.isReconciled).toBe(true);
  });
});

describe("reconcileBankBalance - tolerance", () => {
  it("uses the default tolerance of ¥1 when not specified", () => {
    expect(DEFAULT_TOLERANCE_YEN).toBe(1);

    const withinTolerance = reconcileBankBalance({
      transactions: [{ amount: 100000 }],
      openingBalance: 0,
      actualClosingBalance: 100001,
    });
    expect(withinTolerance.discrepancy).toBe(1);
    expect(withinTolerance.isReconciled).toBe(true);

    const outsideTolerance = reconcileBankBalance({
      transactions: [{ amount: 100000 }],
      openingBalance: 0,
      actualClosingBalance: 100002,
    });
    expect(outsideTolerance.discrepancy).toBe(2);
    expect(outsideTolerance.isReconciled).toBe(false);
  });

  it("respects a custom tolerance", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 100000 }],
      openingBalance: 0,
      actualClosingBalance: 100500,
      toleranceYen: 1000,
    });
    expect(result.discrepancy).toBe(500);
    expect(result.isReconciled).toBe(true);
  });

  it("treats a negative discrepancy within tolerance as reconciled too", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 100000 }],
      openingBalance: 0,
      actualClosingBalance: 99999,
    });
    expect(result.discrepancy).toBe(-1);
    expect(result.isReconciled).toBe(true);
  });
});

describe("reconcileBankBalance - negative/zero balances", () => {
  it("handles a negative opening balance (e.g. an overdrawn account) in the expected balance calculation", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 50000 }],
      openingBalance: -20000,
      actualClosingBalance: 30000,
    });

    expect(result.expectedClosingBalance).toBe(30000);
    expect(result.isReconciled).toBe(true);
  });

  it("flags a discrepancy hint when there are no transactions but the actual balance doesn't match the opening balance", () => {
    const result = reconcileBankBalance({
      transactions: [],
      openingBalance: 100000,
      actualClosingBalance: 90000,
    });

    expect(result.netTransactionAmount).toBe(0);
    expect(result.isReconciled).toBe(false);
    expect(result.discrepancy).toBe(-10000);
    expect(result.hint?.direction).toBe("surplus");
  });
});

describe("reconcileBankBalance - hints when not reconciled", () => {
  it("suggests a possible missing import (取込漏れ) when the actual balance is higher than expected", () => {
    // 実際の残高の方が多い＝取込データだけでは実際の入金額に届いていない（不足）
    const result = reconcileBankBalance({
      transactions: [{ amount: 100000 }, { amount: -30000 }],
      openingBalance: 0,
      actualClosingBalance: 500000, // 本来 70000 のはずが、実際はもっと多い
    });

    expect(result.isReconciled).toBe(false);
    expect(result.discrepancy).toBeGreaterThan(0);
    expect(result.hint).not.toBeNull();
    expect(result.hint?.direction).toBe("shortfall");
    expect(result.hint?.title).toContain("取込漏れ");
  });

  it("suggests a possible duplicate import (重複取込) when the expected balance is higher than actual", () => {
    // 計算上の残高の方が多い＝取込データが実際より過大に積み上がっている
    const result = reconcileBankBalance({
      transactions: [{ amount: 100000 }, { amount: 100000 }], // 同じ入金を誤って2回取り込んだ想定
      openingBalance: 0,
      actualClosingBalance: 100000,
    });

    expect(result.isReconciled).toBe(false);
    expect(result.discrepancy).toBeLessThan(0);
    expect(result.hint).not.toBeNull();
    expect(result.hint?.direction).toBe("surplus");
    expect(result.hint?.title).toContain("重複取込");
  });

  it("returns no hint when reconciled", () => {
    const result = reconcileBankBalance({
      transactions: [{ amount: 50000 }],
      openingBalance: 100000,
      actualClosingBalance: 150000,
    });
    expect(result.hint).toBeNull();
  });
});
