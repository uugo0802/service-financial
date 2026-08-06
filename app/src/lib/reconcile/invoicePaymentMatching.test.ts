import { describe, expect, it } from "vitest";
import { ReceivableInvoiceInput } from "../invoice/receivables";
import { fuzzyPayerNameMatches, matchInvoicePayments } from "./invoicePaymentMatching";

function invoice(overrides: Partial<ReceivableInvoiceInput> & Pick<ReceivableInvoiceInput, "invoiceNumber" | "clientName" | "grandTotal">): ReceivableInvoiceInput {
  return {
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    ...overrides,
  };
}

describe("matchInvoicePayments - exact amount match", () => {
  it("matches a deposit to the single invoice whose outstanding amount matches exactly, with high confidence", () => {
    const invoices = [invoice({ invoiceNumber: "INV-0001", clientName: "A社", grandTotal: 330000 })];
    const transactions = [
      { id: "tx-1", date: "2026-06-15", description: "フリコミ）エイシヤ", amount: 330000 },
    ];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(1);
    expect(result.highConfidenceMatches[0]).toMatchObject({
      invoiceNumber: "INV-0001",
      confidence: "high",
      invoiceOutstandingAmount: 330000,
    });
    expect(result.mediumConfidenceMatches).toHaveLength(0);
    expect(result.partialPaymentCandidates).toHaveLength(0);
    expect(result.combinedPaymentReviewItems).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.unmatchedInvoices).toHaveLength(0);
  });

  it("does not match invoices that are already fully paid (outstandingAmount = 0)", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "A社", grandTotal: 100000, paidAt: "2026-06-10" }),
    ];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "入金 A社", amount: 100000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(1);
  });
});

describe("matchInvoicePayments - fuzzy payer name match", () => {
  it("resolves amount ties across multiple invoices using a fuzzy substring match on the client name", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "A社", grandTotal: 200000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "B社", grandTotal: 200000 }),
    ];
    const transactions = [
      { id: "tx-1", date: "2026-06-15", description: "コンサルティングフィー入金（B社）", amount: 200000 },
    ];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.mediumConfidenceMatches).toHaveLength(1);
    expect(result.mediumConfidenceMatches[0]).toMatchObject({
      invoiceNumber: "INV-0002",
      clientName: "B社",
      confidence: "medium",
    });
    expect(result.unmatchedInvoices.map((i) => i.invoiceNumber)).toEqual(["INV-0001"]);
  });

  it("leaves the deposit unmatched when an amount tie cannot be resolved by name at all", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "A社", grandTotal: 200000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "B社", grandTotal: 200000 }),
    ];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "振込入金", amount: 200000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.mediumConfidenceMatches).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(1);
    expect(result.unmatchedDeposits[0].reason).toContain("同額の請求書が2件");
  });

  it("fuzzyPayerNameMatches ignores common corporate-suffix noise and whitespace", () => {
    expect(fuzzyPayerNameMatches("フリコミ）カブシキガイシャ　ホゲホゲ", "株式会社ホゲホゲ")).toBe(true);
    expect(fuzzyPayerNameMatches("全く関係ない摘要", "株式会社ホゲホゲ")).toBe(false);
  });
});

describe("matchInvoicePayments - partial payment", () => {
  it("flags a deposit smaller than the invoice total as a distinct partial-payment candidate, not a false match", () => {
    const invoices = [invoice({ invoiceNumber: "INV-0001", clientName: "C社", grandTotal: 500000 })];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "入金 C社分", amount: 300000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.mediumConfidenceMatches).toHaveLength(0);
    expect(result.partialPaymentCandidates).toHaveLength(1);
    expect(result.partialPaymentCandidates[0]).toMatchObject({
      invoiceNumber: "INV-0001",
      confidence: "partial",
      remainingBalanceAfterMatch: 200000,
    });
    expect(result.unmatchedDeposits).toHaveLength(0);
  });
});

describe("matchInvoicePayments - ambiguous combined (multi-invoice sum) payment", () => {
  it("flags a lump-sum deposit matching the sum of two invoices for the same client as requiring manual review, instead of silently reporting no match", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "D社", grandTotal: 150000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "D社", grandTotal: 250000 }),
    ];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "フリコミ）ディーシャ", amount: 400000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.mediumConfidenceMatches).toHaveLength(0);
    expect(result.partialPaymentCandidates).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.combinedPaymentReviewItems).toHaveLength(1);
    expect(result.combinedPaymentReviewItems[0].candidateInvoiceNumbers.sort()).toEqual(["INV-0001", "INV-0002"]);
    expect(result.combinedPaymentReviewItems[0].note).toContain("まとめて");
    expect(result.unmatchedInvoices).toHaveLength(0);
  });
});

describe("matchInvoicePayments - no match", () => {
  it("surfaces a deposit with no matching invoice amount as unmatched, and an invoice with no matching deposit as unmatched", () => {
    const invoices = [invoice({ invoiceNumber: "INV-0001", clientName: "E社", grandTotal: 100000 })];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "謎の入金", amount: 999999 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.mediumConfidenceMatches).toHaveLength(0);
    expect(result.partialPaymentCandidates).toHaveLength(0);
    expect(result.combinedPaymentReviewItems).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(1);
    expect(result.unmatchedDeposits[0].transaction.transactionId).toBe("tx-1");
    expect(result.unmatchedInvoices).toHaveLength(1);
    expect(result.unmatchedInvoices[0].invoiceNumber).toBe("INV-0001");
  });

  it("ignores outgoing transactions (negative amounts) entirely", () => {
    const invoices = [invoice({ invoiceNumber: "INV-0001", clientName: "F社", grandTotal: 100000 })];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "経費支払い", amount: -100000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.unmatchedInvoices).toHaveLength(1);
  });

  it("handles empty invoice and transaction lists without throwing", () => {
    const result = matchInvoicePayments({ invoices: [], transactions: [] });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.unmatchedInvoices).toHaveLength(0);
  });

  it("ignores a zero-amount transaction entirely (neither a deposit nor an outgoing payment)", () => {
    const invoices = [invoice({ invoiceNumber: "INV-0001", clientName: "G社", grandTotal: 100000 })];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "残高照会", amount: 0 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.unmatchedInvoices).toHaveLength(1);
  });

  it("tolerates undefined invoices/transactions arrays without throwing (defensive against partial input)", () => {
    expect(() =>
      matchInvoicePayments({
        invoices: undefined as unknown as ReceivableInvoiceInput[],
        transactions: undefined as unknown as { id: string; date: string; description: string; amount: number }[],
      })
    ).not.toThrow();

    const result = matchInvoicePayments({
      invoices: undefined as unknown as ReceivableInvoiceInput[],
      transactions: undefined as unknown as { id: string; date: string; description: string; amount: number }[],
    });
    expect(result.highConfidenceMatches).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(0);
    expect(result.unmatchedInvoices).toHaveLength(0);
  });
});

describe("matchInvoicePayments - combined (lump-sum) payment edge cases", () => {
  it("does not detect a lump sum that only matches when three invoices (not a pair) are summed", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "H社", grandTotal: 100000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "H社", grandTotal: 100000 }),
      invoice({ invoiceNumber: "INV-0003", clientName: "H社", grandTotal: 100000 }),
    ];
    // 3件合計 (300000) と一致するが、2件の組み合わせでは一致しない金額
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "フリコミ）エイチシャ", amount: 300000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.combinedPaymentReviewItems).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(1);
    expect(result.unmatchedInvoices).toHaveLength(3);
  });

  it("does not treat a cross-client coincidental pair sum as a combined payment (grouping is per-client only)", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "I社", grandTotal: 150000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "J社", grandTotal: 250000 }),
    ];
    // 150000 + 250000 = 400000 と一致するが、請求先が異なるためまとめ入金として検出されるべきではない
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "謎の振込", amount: 400000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.combinedPaymentReviewItems).toHaveLength(0);
    expect(result.unmatchedDeposits).toHaveLength(1);
    expect(result.unmatchedInvoices).toHaveLength(2);
  });

  it("prefers the client named in the deposit description when two different clients each happen to have a pair summing to the deposit amount", () => {
    // X社・Y社のどちらの請求書ペアも合計300000円になるが、摘要は明確にY社を指している。
    // 請求先の推定を摘要から行わず、たまたま先に見つかった請求先グループ（配列順で先のX社）を
    // 返してしまう実装は、摘要が名指ししている請求先を無視した誤った候補を提示してしまう。
    const invoices = [
      invoice({ invoiceNumber: "INV-X1", clientName: "X社", grandTotal: 100000 }),
      invoice({ invoiceNumber: "INV-X2", clientName: "X社", grandTotal: 200000 }),
      invoice({ invoiceNumber: "INV-Y1", clientName: "Y社", grandTotal: 50000 }),
      invoice({ invoiceNumber: "INV-Y2", clientName: "Y社", grandTotal: 250000 }),
    ];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "フリコミ）Y社分", amount: 300000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.combinedPaymentReviewItems).toHaveLength(1);
    expect(result.combinedPaymentReviewItems[0].clientName).toBe("Y社");
    expect(result.combinedPaymentReviewItems[0].candidateInvoiceNumbers.sort()).toEqual(["INV-Y1", "INV-Y2"]);
  });
});

describe("matchInvoicePayments - multiple partial-payment candidates for the same client", () => {
  it("surfaces every outstanding invoice larger than the deposit as its own partial candidate when the payer name matches multiple invoices", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-0001", clientName: "K社", grandTotal: 500000 }),
      invoice({ invoiceNumber: "INV-0002", clientName: "K社", grandTotal: 800000 }),
    ];
    const transactions = [{ id: "tx-1", date: "2026-06-15", description: "入金 K社分", amount: 300000 }];

    const result = matchInvoicePayments({ invoices, transactions });

    expect(result.partialPaymentCandidates).toHaveLength(2);
    const remaining = result.partialPaymentCandidates.map((c) => c.remainingBalanceAfterMatch).sort((a, b) => a! - b!);
    expect(remaining).toEqual([200000, 500000]);
  });
});

describe("fuzzyPayerNameMatches - edge cases", () => {
  it("returns false when the client name is a single character (too short to reliably match)", () => {
    expect(fuzzyPayerNameMatches("A社からのフリコミ", "A")).toBe(false);
  });

  it("returns false for an empty description", () => {
    expect(fuzzyPayerNameMatches("", "株式会社ホゲホゲ")).toBe(false);
  });

  it("returns false for an empty client name", () => {
    expect(fuzzyPayerNameMatches("フリコミ）ホゲホゲ", "")).toBe(false);
  });
});
