import { describe, expect, it } from "vitest";
import { ReceivableInvoiceInput, computeReceivablesSummary, outstandingAmountOf } from "./receivables";

const AS_OF = "2026-07-30"; // 今日の日付（テスト用の固定基準日）

function invoice(overrides: Partial<ReceivableInvoiceInput> = {}): ReceivableInvoiceInput {
  return {
    invoiceNumber: "INV-20260101-0001",
    clientName: "株式会社サンプル",
    issueDate: "2026-01-01",
    grandTotal: 100_000,
    ...overrides,
  };
}

/** 基準日から指定した日数だけ過去のISO日付文字列を返す（UTC基準）。 */
function daysBeforeAsOf(days: number): string {
  const ms = Date.parse(`${AS_OF}T00:00:00Z`) - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe("outstandingAmountOf", () => {
  it("treats an invoice with no paidAt as fully outstanding", () => {
    expect(outstandingAmountOf(invoice({ grandTotal: 50_000 }))).toBe(50_000);
  });

  it("treats an invoice with paidAt but no paidAmount as fully paid", () => {
    expect(outstandingAmountOf(invoice({ grandTotal: 50_000, paidAt: "2026-02-01" }))).toBe(0);
  });

  it("computes the remaining balance for a partially paid invoice", () => {
    expect(
      outstandingAmountOf(invoice({ grandTotal: 50_000, paidAt: "2026-02-01", paidAmount: 30_000 }))
    ).toBe(20_000);
  });

  it("never returns a negative amount when paidAmount exceeds grandTotal", () => {
    expect(
      outstandingAmountOf(invoice({ grandTotal: 50_000, paidAt: "2026-02-01", paidAmount: 999_999 }))
    ).toBe(0);
  });
});

describe("computeReceivablesSummary - no invoices", () => {
  it("returns zeroed totals and empty buckets/lists for an empty invoice list", () => {
    const summary = computeReceivablesSummary([], AS_OF);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueInvoices).toEqual([]);
    expect(summary.agingBuckets).toHaveLength(4);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReceivablesSummary - all paid", () => {
  it("excludes fully paid invoices from outstanding totals, buckets, and the overdue list", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-1", dueDate: "2026-01-15", paidAt: "2026-01-10" }),
      invoice({ invoiceNumber: "INV-2", dueDate: "2026-02-01", paidAt: "2026-02-01", paidAmount: 100_000 }),
    ];
    const summary = computeReceivablesSummary(invoices, AS_OF);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueInvoices).toEqual([]);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReceivablesSummary - not yet due", () => {
  it("counts an unpaid invoice with a future due date in totals but not in aging buckets or overdue list", () => {
    const invoices = [invoice({ dueDate: daysBeforeAsOf(-5), grandTotal: 40_000 })];
    const summary = computeReceivablesSummary(invoices, AS_OF);
    expect(summary.totalOutstanding).toBe(40_000);
    expect(summary.totalOutstandingCount).toBe(1);
    expect(summary.overdueInvoices).toEqual([]);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReceivablesSummary - falls back to issueDate when dueDate is absent", () => {
  it("uses issueDate as the aging reference date when dueDate is not provided", () => {
    const invoices = [invoice({ issueDate: daysBeforeAsOf(45), dueDate: null, grandTotal: 10_000 })];
    const summary = computeReceivablesSummary(invoices, AS_OF);
    const bucket = summary.agingBuckets.find((b) => b.key === "31-60")!;
    expect(bucket.count).toBe(1);
    expect(bucket.amount).toBe(10_000);
    expect(summary.overdueInvoices[0].daysOverdue).toBe(45);
    expect(summary.overdueInvoices[0].dueDate).toBeNull();
  });
});

describe("computeReceivablesSummary - one overdue invoice in each bucket", () => {
  it("buckets overdue invoices into 0-30 / 31-60 / 61-90 / 91+ by days overdue", () => {
    const invoices = [
      invoice({ invoiceNumber: "INV-15D", dueDate: daysBeforeAsOf(15), grandTotal: 10_000 }),
      invoice({ invoiceNumber: "INV-45D", dueDate: daysBeforeAsOf(45), grandTotal: 20_000 }),
      invoice({ invoiceNumber: "INV-75D", dueDate: daysBeforeAsOf(75), grandTotal: 30_000 }),
      invoice({ invoiceNumber: "INV-120D", dueDate: daysBeforeAsOf(120), grandTotal: 40_000 }),
    ];
    const summary = computeReceivablesSummary(invoices, AS_OF);

    expect(summary.totalOutstanding).toBe(100_000);
    expect(summary.totalOutstandingCount).toBe(4);

    const byKey = Object.fromEntries(summary.agingBuckets.map((b) => [b.key, b]));
    expect(byKey["0-30"]).toMatchObject({ count: 1, amount: 10_000 });
    expect(byKey["31-60"]).toMatchObject({ count: 1, amount: 20_000 });
    expect(byKey["61-90"]).toMatchObject({ count: 1, amount: 30_000 });
    expect(byKey["91+"]).toMatchObject({ count: 1, amount: 40_000 });

    // 期日超過日数の降順で並んでいること
    expect(summary.overdueInvoices.map((i) => i.invoiceNumber)).toEqual([
      "INV-120D",
      "INV-75D",
      "INV-45D",
      "INV-15D",
    ]);
  });
});

describe("computeReceivablesSummary - exact boundary days", () => {
  it.each([
    [30, "0-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "61-90"],
    [90, "61-90"],
    [91, "91+"],
  ] as const)("assigns exactly %i days overdue to the %s bucket", (days, expectedKey) => {
    const summary = computeReceivablesSummary(
      [invoice({ dueDate: daysBeforeAsOf(days), grandTotal: 1_000 })],
      AS_OF
    );
    const nonEmptyBuckets = summary.agingBuckets.filter((b) => b.count > 0);
    expect(nonEmptyBuckets).toHaveLength(1);
    expect(nonEmptyBuckets[0].key).toBe(expectedKey);
    expect(summary.overdueInvoices[0].daysOverdue).toBe(days);
  });

  it("treats exactly 0 days overdue (due date is today) as not yet overdue", () => {
    const summary = computeReceivablesSummary(
      [invoice({ dueDate: daysBeforeAsOf(0), grandTotal: 1_000 })],
      AS_OF
    );
    expect(summary.overdueInvoices).toEqual([]);
    summary.agingBuckets.forEach((bucket) => expect(bucket.count).toBe(0));
    // still outstanding overall even though not yet overdue
    expect(summary.totalOutstanding).toBe(1_000);
  });
});

describe("computeReceivablesSummary - mixed paid, partially paid, and unpaid invoices", () => {
  it("only reflects the remaining unpaid balance for partially paid overdue invoices", () => {
    const invoices = [
      invoice({ invoiceNumber: "PAID", dueDate: daysBeforeAsOf(40), paidAt: "2026-01-01" }),
      invoice({
        invoiceNumber: "PARTIAL",
        dueDate: daysBeforeAsOf(40),
        grandTotal: 100_000,
        paidAt: "2026-01-01",
        paidAmount: 60_000,
      }),
      invoice({ invoiceNumber: "UNPAID", dueDate: daysBeforeAsOf(40), grandTotal: 20_000 }),
    ];
    const summary = computeReceivablesSummary(invoices, AS_OF);

    expect(summary.totalOutstandingCount).toBe(2);
    expect(summary.totalOutstanding).toBe(60_000);

    const bucket = summary.agingBuckets.find((b) => b.key === "31-60")!;
    expect(bucket.count).toBe(2);
    expect(bucket.amount).toBe(60_000);

    expect(summary.overdueInvoices.map((i) => i.invoiceNumber).sort()).toEqual(["PARTIAL", "UNPAID"]);
  });
});
