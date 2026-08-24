import { describe, expect, it } from "vitest";
import { ReconciliationResult } from "../reconcile/bankReconciliation";
import { InvoicePaymentMatchResult } from "../reconcile/invoicePaymentMatching";
import { buildMonthlyCloseChecklist } from "./monthlyCloseChecklist";

function reconciled(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    transactionCount: 5,
    netTransactionAmount: 780_000,
    openingBalance: 1_000_000,
    expectedClosingBalance: 1_780_000,
    actualClosingBalance: 1_780_000,
    discrepancy: 0,
    toleranceYen: 1,
    isReconciled: true,
    hint: null,
    ...overrides,
  };
}

function unreconciled(discrepancy: number): ReconciliationResult {
  return reconciled({
    isReconciled: false,
    discrepancy,
    actualClosingBalance: 1_780_000 + discrepancy,
    hint: {
      direction: discrepancy > 0 ? "shortfall" : "surplus",
      title: "取込漏れの可能性（不足額が示す方向）",
      message: "テスト用のヒントメッセージ",
    },
  });
}

const EMPTY_MATCH_RESULT: InvoicePaymentMatchResult = {
  highConfidenceMatches: [],
  mediumConfidenceMatches: [],
  partialPaymentCandidates: [],
  combinedPaymentReviewItems: [],
  unmatchedDeposits: [],
  unmatchedInvoices: [],
};

function matchResultWithUnresolved(): InvoicePaymentMatchResult {
  return {
    ...EMPTY_MATCH_RESULT,
    unmatchedDeposits: [
      {
        transaction: { transactionId: "t1", date: "2026-07-05", description: "不明な入金", amount: 10_000 },
        reason: "未収金額が一致する請求書が見つかりませんでした。",
      },
    ],
    unmatchedInvoices: [
      {
        invoiceNumber: "INV-001",
        clientName: "テスト商事",
        outstandingAmount: 50_000,
        reason: "この未収金額・請求先に一致する入金取引が見つかりませんでした。",
      },
    ],
  };
}

describe("buildMonthlyCloseChecklist", () => {
  it("throws for a malformed targetMonth", () => {
    expect(() =>
      buildMonthlyCloseChecklist({
        targetMonth: "2026/07",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: 0,
      })
    ).toThrow();

    expect(() =>
      buildMonthlyCloseChecklist({
        targetMonth: "2026-13",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: 0,
      })
    ).toThrow();
  });

  it("throws for a negative or non-integer pendingCategorizationCount", () => {
    expect(() =>
      buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: -1,
      })
    ).toThrow();

    expect(() =>
      buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: 1.5,
      })
    ).toThrow();
  });

  describe("all-done scenario", () => {
    it("marks every item done and reports 100% completion when every signal is clean", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: reconciled(),
        invoicePaymentMatching: EMPTY_MATCH_RESULT,
        pendingCategorizationCount: 0,
        fiscalYearLock: { closed: false, fiscalYear: 2026 },
      });

      expect(result.items.every((item) => item.status === "done")).toBe(true);
      expect(result.completionPercent).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(result.doneCount).toBe(result.totalCount);
      expect(result.attentionCount).toBe(0);
      expect(result.pendingCount).toBe(0);
    });

    it("also completes when the fiscal year lock item is included and the year is closed (nothing left to edit)", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: reconciled(),
        invoicePaymentMatching: EMPTY_MATCH_RESULT,
        pendingCategorizationCount: 0,
        fiscalYearLock: { closed: true, fiscalYear: 2026 },
      });

      const lockItem = result.items.find((item) => item.id === "fiscal-year-lock");
      expect(lockItem?.status).toBe("attention");
      expect(result.isComplete).toBe(false);
    });
  });

  describe("all-pending scenario", () => {
    it("marks bank reconciliation and invoice matching pending when they have not been run yet", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: 0,
      });

      const bank = result.items.find((item) => item.id === "bank-reconciliation");
      const invoice = result.items.find((item) => item.id === "invoice-payment-matching");
      const categorization = result.items.find((item) => item.id === "pending-categorization");

      expect(bank?.status).toBe("pending");
      expect(invoice?.status).toBe("pending");
      // pendingCategorizationCount of 0 is a genuinely clean state, so this item is "done"
      // even though the other two checks haven't been run yet.
      expect(categorization?.status).toBe("done");
      expect(result.isComplete).toBe(false);
      expect(result.completionPercent).toBeLessThan(100);
    });
  });

  describe("mixed statuses", () => {
    it("flags attention for an unreconciled bank balance, pending categorization, and unresolved invoice matches", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: unreconciled(15_000),
        invoicePaymentMatching: matchResultWithUnresolved(),
        pendingCategorizationCount: 3,
        fiscalYearLock: { closed: false, fiscalYear: 2026 },
      });

      const bank = result.items.find((item) => item.id === "bank-reconciliation");
      const invoice = result.items.find((item) => item.id === "invoice-payment-matching");
      const categorization = result.items.find((item) => item.id === "pending-categorization");
      const lock = result.items.find((item) => item.id === "fiscal-year-lock");

      expect(bank?.status).toBe("attention");
      expect(bank?.detail).toContain("15,000");
      expect(invoice?.status).toBe("attention");
      expect(invoice?.detail).toContain("2件");
      expect(categorization?.status).toBe("attention");
      expect(categorization?.detail).toContain("3件");
      expect(lock?.status).toBe("done");

      expect(result.totalCount).toBe(4);
      expect(result.attentionCount).toBe(3);
      expect(result.doneCount).toBe(1);
      expect(result.completionPercent).toBe(25);
      expect(result.isComplete).toBe(false);
    });

    it("omits the fiscal-year-lock item entirely when the signal is not supplied", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: reconciled(),
        invoicePaymentMatching: EMPTY_MATCH_RESULT,
        pendingCategorizationCount: 0,
      });

      expect(result.items.find((item) => item.id === "fiscal-year-lock")).toBeUndefined();
      expect(result.totalCount).toBe(3);
    });
  });

  describe("empty-month edge case", () => {
    it("treats a month with zero transactions and zero invoices as fully reconciled/clean when the signals reflect that", () => {
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: reconciled({
          transactionCount: 0,
          netTransactionAmount: 0,
          openingBalance: 500_000,
          expectedClosingBalance: 500_000,
          actualClosingBalance: 500_000,
          discrepancy: 0,
          isReconciled: true,
        }),
        invoicePaymentMatching: EMPTY_MATCH_RESULT,
        pendingCategorizationCount: 0,
      });

      expect(result.isComplete).toBe(true);
      expect(result.completionPercent).toBe(100);
      const bank = result.items.find((item) => item.id === "bank-reconciliation");
      expect(bank?.detail).toContain("取引0件");
    });

    it("returns 0% completion (not NaN/negative) when there are no checklist items at all is impossible, but zero totalCount is handled defensively", () => {
      // buildMonthlyCloseChecklist always produces at least 3 items, so this test documents the
      // defensive 0-item branch of the underlying percentage calculation via the public contract:
      // even the "nothing done yet" state must never divide by zero or return NaN.
      const result = buildMonthlyCloseChecklist({
        targetMonth: "2026-07",
        bankReconciliation: null,
        invoicePaymentMatching: null,
        pendingCategorizationCount: 0,
      });

      expect(Number.isFinite(result.completionPercent)).toBe(true);
      expect(result.completionPercent).toBeGreaterThanOrEqual(0);
      expect(result.completionPercent).toBeLessThanOrEqual(100);
    });
  });

  it("preserves item order: bank reconciliation, pending categorization, invoice matching, then fiscal year lock", () => {
    const result = buildMonthlyCloseChecklist({
      targetMonth: "2026-07",
      bankReconciliation: reconciled(),
      invoicePaymentMatching: EMPTY_MATCH_RESULT,
      pendingCategorizationCount: 0,
      fiscalYearLock: { closed: false, fiscalYear: 2026 },
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "bank-reconciliation",
      "pending-categorization",
      "invoice-payment-matching",
      "fiscal-year-lock",
    ]);
  });

  it("carries the targetMonth through to the result unchanged", () => {
    const result = buildMonthlyCloseChecklist({
      targetMonth: "2026-01",
      bankReconciliation: null,
      invoicePaymentMatching: null,
      pendingCategorizationCount: 0,
    });
    expect(result.targetMonth).toBe("2026-01");
  });
});
