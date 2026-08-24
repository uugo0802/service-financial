import { describe, expect, it } from "vitest";
import {
  GENERAL_ANNUAL_THRESHOLD,
  PaymentReportSourceRow,
  buildPaymentReportFromTransactions,
  buildPaymentReportLines,
  filterReportRequiredLines,
  PaymentReportTransactionInput,
} from "./paymentReportForm";
import { CategorizedTransaction } from "../categorize/engine";

function row(overrides: Partial<PaymentReportSourceRow>): PaymentReportSourceRow {
  return {
    payeeName: "山田太郎",
    category: "デザイン料",
    grossAmount: 0,
    ...overrides,
  };
}

function tx(overrides: Partial<PaymentReportTransactionInput>): PaymentReportTransactionInput {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "支払手数料",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildPaymentReportLines", () => {
  it("does not flag a payee/category combination below the threshold", () => {
    const rows = [row({ payeeName: "A", category: "デザイン料", grossAmount: 30000 })];
    const [line] = buildPaymentReportLines(rows);
    expect(line.grossAmount).toBe(30000);
    expect(line.reportRequired).toBe(false);
  });

  it("does not require a report exactly at the threshold (must exceed, not just reach, 50,000円)", () => {
    const rows = [row({ payeeName: "A", category: "デザイン料", grossAmount: GENERAL_ANNUAL_THRESHOLD })];
    const [line] = buildPaymentReportLines(rows);
    expect(line.grossAmount).toBe(50000);
    expect(line.reportRequired).toBe(false);
  });

  it("requires a report for one yen above the threshold", () => {
    const rows = [row({ payeeName: "A", category: "デザイン料", grossAmount: GENERAL_ANNUAL_THRESHOLD + 1 })];
    const [line] = buildPaymentReportLines(rows);
    expect(line.reportRequired).toBe(true);
  });

  it("aggregates multiple payments to the same payee/category across the year", () => {
    const rows = [
      row({ payeeName: "A", category: "原稿料・講演料等", grossAmount: 20000, date: "2026-03-01" }),
      row({ payeeName: "A", category: "原稿料・講演料等", grossAmount: 35000, date: "2026-08-01" }),
    ];
    const [line] = buildPaymentReportLines(rows);
    expect(line.grossAmount).toBe(55000);
    expect(line.paymentCount).toBe(2);
    expect(line.reportRequired).toBe(true);
  });

  it("computes withholding tax totals and net amount", () => {
    const rows = [
      row({ payeeName: "A", category: "弁護士・税理士等の報酬", grossAmount: 100000, withholdingTax: 10210 }),
      row({ payeeName: "A", category: "弁護士・税理士等の報酬", grossAmount: 50000, withholdingTax: 5105 }),
    ];
    const [line] = buildPaymentReportLines(rows);
    expect(line.grossAmount).toBe(150000);
    expect(line.withholdingTax).toBe(15315);
    expect(line.netAmount).toBe(134685);
  });

  it("treats missing withholdingTax as zero", () => {
    const rows = [row({ payeeName: "A", category: "デザイン料", grossAmount: 60000 })];
    const [line] = buildPaymentReportLines(rows);
    expect(line.withholdingTax).toBe(0);
    expect(line.netAmount).toBe(60000);
  });

  it("keeps different payees and different categories as separate lines", () => {
    const rows = [
      row({ payeeName: "A", category: "デザイン料", grossAmount: 60000 }),
      row({ payeeName: "B", category: "デザイン料", grossAmount: 60000 }),
      row({ payeeName: "A", category: "原稿料・講演料等", grossAmount: 60000 }),
    ];
    const lines = buildPaymentReportLines(rows);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.reportRequired)).toBe(true);
  });

  it("sorts lines with the largest gross amount first", () => {
    const rows = [
      row({ payeeName: "A", category: "デザイン料", grossAmount: 60000 }),
      row({ payeeName: "B", category: "デザイン料", grossAmount: 200000 }),
    ];
    const lines = buildPaymentReportLines(rows);
    expect(lines[0].payeeName).toBe("B");
  });

  it("filters rows to a given fiscal year, keeping undated rows regardless", () => {
    const rows = [
      row({ payeeName: "A", category: "デザイン料", grossAmount: 60000, date: "2025-12-31" }),
      row({ payeeName: "A", category: "デザイン料", grossAmount: 70000, date: "2026-01-15" }),
      row({ payeeName: "A", category: "デザイン料", grossAmount: 5000 }), // date未指定
    ];
    const lines = buildPaymentReportLines(rows, { fiscalYear: 2026 });
    expect(lines).toHaveLength(1);
    expect(lines[0].grossAmount).toBe(75000);
  });

  it("returns an empty array when there are no rows", () => {
    expect(buildPaymentReportLines([])).toEqual([]);
  });

  it("falls back to a placeholder name when payeeName is blank", () => {
    const rows = [row({ payeeName: "   ", category: "デザイン料", grossAmount: 60000 })];
    const [line] = buildPaymentReportLines(rows);
    expect(line.payeeName).toBe("（支払先不明）");
  });
});

describe("filterReportRequiredLines", () => {
  it("keeps only lines that exceed the threshold", () => {
    const rows = [
      row({ payeeName: "A", category: "デザイン料", grossAmount: 30000 }),
      row({ payeeName: "B", category: "デザイン料", grossAmount: 60000 }),
    ];
    const lines = buildPaymentReportLines(rows);
    const required = filterReportRequiredLines(lines);
    expect(required).toHaveLength(1);
    expect(required[0].payeeName).toBe("B");
  });
});

describe("buildPaymentReportFromTransactions", () => {
  it("derives payee/category/amount from a categorized transaction using account defaults", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({ id: "1", account: "支払手数料", amount: -60000, description: "顧問料", note: "〇〇税理士事務所" }),
    ];
    const [line] = buildPaymentReportFromTransactions(rows);
    expect(line.payeeName).toBe("〇〇税理士事務所");
    expect(line.category).toBe("その他の報酬・料金");
    expect(line.grossAmount).toBe(60000);
    expect(line.reportRequired).toBe(true);
  });

  it("uses description as payee name when note is absent", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({ id: "1", account: "支払手数料", amount: -60000, description: "△△デザイン事務所" }),
    ];
    const [line] = buildPaymentReportFromTransactions(rows);
    expect(line.payeeName).toBe("△△デザイン事務所");
  });

  it("prefers an explicit payeeName/category override over the defaults", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({
        id: "1",
        account: "給料賃金/外注工賃",
        amount: -80000,
        description: "原稿執筆料",
        payeeName: "フリー太郎",
        paymentReportCategory: "原稿料・講演料等",
        withholdingTaxAmount: 8168,
      }),
    ];
    const [line] = buildPaymentReportFromTransactions(rows);
    expect(line.payeeName).toBe("フリー太郎");
    expect(line.category).toBe("原稿料・講演料等");
    expect(line.withholdingTax).toBe(8168);
  });

  it("ignores accounts that are not withholding-relevant", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({ id: "1", account: "消耗品費", amount: -60000, description: "Amazon" }),
    ];
    expect(buildPaymentReportFromTransactions(rows)).toEqual([]);
  });

  it("ignores income rows", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({ id: "1", account: "支払手数料", amount: 60000, description: "返金" }),
    ];
    expect(buildPaymentReportFromTransactions(rows)).toEqual([]);
  });

  it("aggregates across multiple transactions for the same payee", () => {
    const rows: PaymentReportTransactionInput[] = [
      tx({ id: "1", account: "支払手数料", amount: -20000, description: "顧問料4月分", note: "〇〇税理士事務所", date: "2026-04-01" }),
      tx({ id: "2", account: "支払手数料", amount: -20000, description: "顧問料5月分", note: "〇〇税理士事務所", date: "2026-05-01" }),
      tx({ id: "3", account: "支払手数料", amount: -20000, description: "顧問料6月分", note: "〇〇税理士事務所", date: "2026-06-01" }),
    ];
    const [line] = buildPaymentReportFromTransactions(rows);
    expect(line.grossAmount).toBe(60000);
    expect(line.paymentCount).toBe(3);
    expect(line.reportRequired).toBe(true);
  });
});

// 型が想定通りエクスポートされていることの確認（CategorizedTransactionの拡張として使える）
const _typeCheck: CategorizedTransaction = tx({});
void _typeCheck;
