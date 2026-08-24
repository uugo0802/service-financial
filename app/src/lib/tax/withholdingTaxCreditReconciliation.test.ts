import { describe, expect, it } from "vitest";
import {
  WITHHOLDING_SINGLE_PAYMENT_THRESHOLD,
  WithholdingPaymentRecord,
  calcExpectedWithholdingTax,
  reconcileWithholdingTaxCredits,
} from "./withholdingTaxCreditReconciliation";

function record(overrides: Partial<WithholdingPaymentRecord>): WithholdingPaymentRecord {
  return {
    clientName: "株式会社サンプル",
    grossAmount: 0,
    recordedWithholdingTax: 0,
    ...overrides,
  };
}

describe("calcExpectedWithholdingTax", () => {
  it("applies 1円未満切り捨て (floor) even for amounts under the 100万円 bracket", () => {
    // 99 * 10.21% = 10.1079 -> 10円に切り捨て
    expect(calcExpectedWithholdingTax(99)).toBe(10);
  });

  it("returns 0 for a non-positive gross amount", () => {
    expect(calcExpectedWithholdingTax(0)).toBe(0);
    expect(calcExpectedWithholdingTax(-1000)).toBe(0);
  });

  it("computes the standard 10.21% rate exactly at the ¥1,000,000 threshold", () => {
    // 1,000,000 * 10.21% = 102,100（端数なし）。この金額は「超える」側の税率を使わない
    expect(calcExpectedWithholdingTax(WITHHOLDING_SINGLE_PAYMENT_THRESHOLD)).toBe(102_100);
  });

  it("uses the mixed 10.21%/20.42% rate for a single payment exceeding ¥1,000,000", () => {
    // 100万円までの部分: 1,000,000 * 10.21% = 102,100
    // 100万円を超える部分: 500,000 * 20.42% = 102,100
    // 合計 204,200
    expect(calcExpectedWithholdingTax(1_500_000)).toBe(204_200);
  });

  it("floors the fractional yen produced by the excess (20.42%) portion", () => {
    // 100万円までの部分: 102,100
    // 100万円を超える部分: 234,567 * 20.42% = 47,898.5814 -> 切り捨てなしで合算後に切り捨て
    expect(calcExpectedWithholdingTax(1_234_567)).toBe(149_998);
  });
});

describe("reconcileWithholdingTaxCredits", () => {
  it("marks a record as matched when the recorded amount equals the expected amount", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "A社", grossAmount: 300_000, recordedWithholdingTax: 30_630 }),
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].status).toBe("matched");
    expect(result.records[0].expectedWithholdingTax).toBe(30_630);
    expect(result.records[0].differenceYen).toBe(0);
    expect(result.discrepancyCount).toBe(0);
    expect(result.totalRecordedWithholdingTax).toBe(30_630);
    expect(result.totalExpectedWithholdingTax).toBe(30_630);
  });

  it("flags a record as a discrepancy when the recorded amount differs from the expected amount", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "B社", grossAmount: 300_000, recordedWithholdingTax: 25_000 }),
    ]);

    expect(result.records[0].status).toBe("discrepancy");
    expect(result.records[0].expectedWithholdingTax).toBe(30_630);
    expect(result.records[0].recordedWithholdingTax).toBe(25_000);
    expect(result.records[0].differenceYen).toBe(-5_630);
    expect(result.discrepancyCount).toBe(1);
  });

  it("uses the standard 10.21% rate (not the excess rate) for a payment exactly at ¥1,000,000", () => {
    const result = reconcileWithholdingTaxCredits([
      record({
        clientName: "C社",
        grossAmount: WITHHOLDING_SINGLE_PAYMENT_THRESHOLD,
        recordedWithholdingTax: 102_100,
      }),
    ]);

    expect(result.records[0].expectedWithholdingTax).toBe(102_100);
    expect(result.records[0].status).toBe("matched");
  });

  it("applies the mixed rate for a single payment exceeding ¥1,000,000 and matches a correctly recorded amount", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "D社", grossAmount: 1_500_000, recordedWithholdingTax: 204_200 }),
    ]);

    expect(result.records[0].expectedWithholdingTax).toBe(204_200);
    expect(result.records[0].status).toBe("matched");
  });

  it("flags a discrepancy when a payment exceeding ¥1,000,000 was withheld using only the standard rate", () => {
    // よくある誤り: 100万円超の支払いに一律10.21%を適用してしまうケース
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "E社", grossAmount: 1_500_000, recordedWithholdingTax: Math.floor(1_500_000 * 0.1021) }),
    ]);

    expect(result.records[0].expectedWithholdingTax).toBe(204_200);
    expect(result.records[0].recordedWithholdingTax).toBe(153_150);
    expect(result.records[0].status).toBe("discrepancy");
  });

  it("returns zeroed totals and an empty record list for an empty input", () => {
    const result = reconcileWithholdingTaxCredits([]);

    expect(result.records).toEqual([]);
    expect(result.discrepancyCount).toBe(0);
    expect(result.totalRecordedWithholdingTax).toBe(0);
    expect(result.totalExpectedWithholdingTax).toBe(0);
  });

  it("sums totalRecordedWithholdingTax from the recorded (actual) amounts, not the expected amounts, across multiple records", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "A社", grossAmount: 300_000, recordedWithholdingTax: 30_630 }), // matched
      record({ clientName: "B社", grossAmount: 300_000, recordedWithholdingTax: 25_000 }), // discrepancy
    ]);

    // 実際に控除に使えるのはrecorded側の合計であり、expected側の合計ではない
    expect(result.totalRecordedWithholdingTax).toBe(30_630 + 25_000);
    expect(result.totalExpectedWithholdingTax).toBe(30_630 + 30_630);
    expect(result.discrepancyCount).toBe(1);
  });

  it("respects a custom toleranceYen when deciding matched vs discrepancy", () => {
    const result = reconcileWithholdingTaxCredits(
      [record({ clientName: "F社", grossAmount: 300_000, recordedWithholdingTax: 30_629 })],
      { toleranceYen: 1 }
    );

    expect(result.records[0].differenceYen).toBe(-1);
    expect(result.records[0].status).toBe("matched");
  });

  it("falls back to a placeholder client name when clientName is blank", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ clientName: "   ", grossAmount: 100_000, recordedWithholdingTax: 10_210 }),
    ]);

    expect(result.records[0].clientName).toBe("（クライアント不明）");
  });

  it("treats a negative toleranceYen defensively as 0 (does not widen matching)", () => {
    const result = reconcileWithholdingTaxCredits(
      [record({ clientName: "G社", grossAmount: 300_000, recordedWithholdingTax: 30_629 })],
      { toleranceYen: -100 }
    );

    // 差異は1円だが、負の許容値は0として扱われるため一致とはみなされない
    expect(result.records[0].differenceYen).toBe(-1);
    expect(result.records[0].status).toBe("discrepancy");
  });

  it("flags discrepancy just outside a custom tolerance boundary (tolerance + 1)", () => {
    const result = reconcileWithholdingTaxCredits(
      [record({ clientName: "H社", grossAmount: 300_000, recordedWithholdingTax: 30_628 })],
      { toleranceYen: 1 }
    );

    expect(result.records[0].differenceYen).toBe(-2);
    expect(result.records[0].status).toBe("discrepancy");
  });

  it("preserves an optional id/date through to the reconciled record when provided", () => {
    const result = reconcileWithholdingTaxCredits([
      record({ id: "pay-1", date: "2026-05-01", clientName: "I社", grossAmount: 100_000, recordedWithholdingTax: 10_210 }),
    ]);

    expect(result.records[0].id).toBe("pay-1");
    expect(result.records[0].date).toBe("2026-05-01");
  });
});
