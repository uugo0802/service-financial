import { describe, expect, it } from "vitest";
import {
  ClientInvoiceInput,
  buildClientInvoice,
  formatInvoiceNumber,
  validateClientInvoiceInput,
} from "./clientInvoice";

const VALID_REGISTRATION_NUMBER = "T2120901007402"; // 国税庁公式PDFのチェックデジット計算例（検算済み）

function baseInput(overrides: Partial<ClientInvoiceInput> = {}): ClientInvoiceInput {
  return {
    issuerName: "山田太郎",
    issuerRegistrationNumber: VALID_REGISTRATION_NUMBER,
    issueDate: "2026-07-29",
    transactionDate: "2026-07-25",
    clientName: "株式会社サンプル",
    lineItems: [{ description: "コンサルティング費用", quantity: 1, unitPrice: 100_000, taxRate: 10 }],
    ...overrides,
  };
}

describe("formatInvoiceNumber", () => {
  it("formats issue date and sequence into INV-YYYYMMDD-NNNN", () => {
    expect(formatInvoiceNumber("2026-07-29", 3)).toBe("INV-20260729-0003");
  });

  it("falls back to a safe default for malformed dates or sequences", () => {
    expect(formatInvoiceNumber("not-a-date", 0)).toBe("INV-00000000-0001");
  });

  it("falls back to sequence 1 for a negative sequence", () => {
    expect(formatInvoiceNumber("2026-07-29", -5)).toBe("INV-20260729-0001");
  });

  it("falls back to sequence 1 for a NaN sequence", () => {
    expect(formatInvoiceNumber("2026-07-29", NaN)).toBe("INV-20260729-0001");
  });

  it("truncates a fractional sequence down to the whole number", () => {
    expect(formatInvoiceNumber("2026-07-29", 3.9)).toBe("INV-20260729-0003");
  });
});

describe("buildClientInvoice - mixed tax rate calculation", () => {
  it("splits totals per tax rate and sums them into a grand total", () => {
    const result = buildClientInvoice(
      baseInput({
        lineItems: [
          { description: "デザイン制作費（標準税率）", quantity: 1, unitPrice: 200_000, taxRate: 10 },
          { description: "書籍代（軽減税率）", quantity: 2, unitPrice: 1_000, taxRate: 8 },
        ],
      })
    );

    expect(result.errors).toEqual([]);

    const standard = result.invoice.taxRateSubtotals.find((s) => s.taxRate === 10)!;
    const reduced = result.invoice.taxRateSubtotals.find((s) => s.taxRate === 8)!;

    expect(standard.taxableBase).toBe(200_000);
    expect(standard.taxAmount).toBe(20_000); // 200,000×10%
    expect(reduced.taxableBase).toBe(2_000);
    expect(reduced.taxAmount).toBe(160); // 2,000×8%

    expect(result.invoice.subtotalExcludingTax).toBe(202_000);
    expect(result.invoice.totalTax).toBe(20_160);
    expect(result.invoice.grandTotal).toBe(222_160);
  });

  it("rounds down once per tax rate group rather than per line item", () => {
    // 各行単体では 999×10%=99.9 を切り捨てると1行あたり99円だが（2行で198円）、
    // 税率ごとに合計してから1回だけ端数処理すると 1,998×10%=199.8円→199円になる。
    // 「1つの請求書につき、税率ごとに1回」という端数処理ルールの検証。
    const result = buildClientInvoice(
      baseInput({
        lineItems: [
          { description: "商品A", quantity: 1, unitPrice: 999, taxRate: 10 },
          { description: "商品B", quantity: 1, unitPrice: 999, taxRate: 10 },
        ],
      })
    );

    const standard = result.invoice.taxRateSubtotals.find((s) => s.taxRate === 10)!;
    expect(standard.taxableBase).toBe(1_998);
    expect(standard.taxAmount).toBe(199);
    expect(standard.taxAmount).not.toBe(198); // per-line rounding would have given 99+99=198
  });

  it("rounds down fractional line amounts (quantity × unit price) to the nearest yen", () => {
    const result = buildClientInvoice(
      baseInput({
        lineItems: [{ description: "作業（時間単価）", quantity: 1.5, unitPrice: 3_333, taxRate: 10 }],
      })
    );
    // 1.5 × 3,333 = 4,999.5 → 円未満切り捨てで4,999円
    expect(result.invoice.lineItems[0].lineAmountExcludingTax).toBe(4_999);
  });

  it("includes a 0% breakdown row with zero tax, and rolls it into the grand total", () => {
    const result = buildClientInvoice(
      baseInput({
        lineItems: [
          { description: "課税対象外の実費（立替交通費など）", quantity: 1, unitPrice: 5_000, taxRate: 0 },
          { description: "本体サービス", quantity: 1, unitPrice: 10_000, taxRate: 10 },
        ],
      })
    );

    const zeroRate = result.invoice.taxRateSubtotals.find((s) => s.taxRate === 0);
    expect(zeroRate).toBeDefined();
    expect(zeroRate!.taxableBase).toBe(5_000);
    expect(zeroRate!.taxAmount).toBe(0);

    expect(result.invoice.subtotalExcludingTax).toBe(15_000);
    expect(result.invoice.totalTax).toBe(1_000);
    expect(result.invoice.grandTotal).toBe(16_000);
  });
});

describe("buildClientInvoice - required field validation", () => {
  it("returns errors (not a thrown exception) when required fields are missing", () => {
    const result = buildClientInvoice(
      baseInput({
        issuerName: "",
        clientName: "",
        issueDate: "",
        transactionDate: null,
        transactionPeriodStart: null,
        transactionPeriodEnd: null,
      })
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("発行者名"),
        expect.stringContaining("請求先"),
        expect.stringContaining("発行日"),
        expect.stringContaining("取引年月日"),
      ])
    );
    // ベストエフォートで invoice 自体は組み立てられる(例外を投げない)
    expect(result.invoice).toBeDefined();
  });

  it("accepts a transaction period in place of a single transaction date", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-01", transactionPeriodEnd: "2026-07-31" })
    );
    expect(result.errors).toEqual([]);
    expect(result.invoice.transactionDate).toBeNull();
    expect(result.invoice.transactionPeriodStart).toBe("2026-07-01");
    expect(result.invoice.transactionPeriodEnd).toBe("2026-07-31");
  });

  it("flags a transaction period whose start date is after its end date", () => {
    const { errors } = validateClientInvoiceInput(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-31", transactionPeriodEnd: "2026-07-01" })
    );
    expect(errors.some((e) => e.includes("開始日が終了日より後"))).toBe(true);
  });

  it("flags invalid line item fields individually", () => {
    const { errors } = validateClientInvoiceInput(
      baseInput({
        lineItems: [{ description: "", quantity: 0, unitPrice: -1, taxRate: 10 }],
      })
    );
    expect(errors.some((e) => e.includes("品目・内容"))).toBe(true);
    expect(errors.some((e) => e.includes("数量"))).toBe(true);
    expect(errors.some((e) => e.includes("単価"))).toBe(true);
  });

  it("accepts a unit price of exactly zero (e.g. a free line item) without an error", () => {
    const { errors } = validateClientInvoiceInput(
      baseInput({ lineItems: [{ description: "サービス初回無料枠", quantity: 1, unitPrice: 0, taxRate: 10 }] })
    );
    expect(errors.some((e) => e.includes("単価"))).toBe(false);
  });

  it("rejects an invalid tax rate that is not one of 0/8/10", () => {
    const { errors } = validateClientInvoiceInput(
      baseInput({ lineItems: [{ description: "テスト", quantity: 1, unitPrice: 100, taxRate: 5 as never }] })
    );
    expect(errors.some((e) => e.includes("税率"))).toBe(true);
  });

  it("allows a transaction period whose start and end date are the same day", () => {
    const { errors } = validateClientInvoiceInput(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-15", transactionPeriodEnd: "2026-07-15" })
    );
    expect(errors.some((e) => e.includes("開始日が終了日より後"))).toBe(false);
  });
});

describe("buildClientInvoice - invoice number and name trimming", () => {
  it("uses an explicitly provided invoice number instead of auto-generating one", () => {
    const result = buildClientInvoice(baseInput({ invoiceNumber: "CUSTOM-0001" }));
    expect(result.invoice.invoiceNumber).toBe("CUSTOM-0001");
  });

  it("falls back to an auto-generated invoice number when the provided one is whitespace-only", () => {
    const result = buildClientInvoice(baseInput({ invoiceNumber: "   ", issueDate: "2026-07-29" }));
    expect(result.invoice.invoiceNumber).toBe("INV-20260729-0001");
  });

  it("trims whitespace from the issuer name and client name in the built invoice", () => {
    const result = buildClientInvoice(baseInput({ issuerName: "  山田太郎  ", clientName: "  株式会社サンプル  " }));
    expect(result.invoice.issuerName).toBe("山田太郎");
    expect(result.invoice.clientName).toBe("株式会社サンプル");
  });
});

describe("buildClientInvoice - registration number handling", () => {
  it("produces a warning (not a hard error) when the registration number is missing", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: null }));

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("登録番号"))).toBe(true);
    expect(result.invoice.isQualifiedInvoice).toBe(false);
    expect(result.invoice.issuerRegistrationNumber).toBeNull();
  });

  it("marks the invoice as a qualified invoice when a valid registration number is provided", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: VALID_REGISTRATION_NUMBER }));

    expect(result.warnings).toEqual([]);
    expect(result.invoice.isQualifiedInvoice).toBe(true);
    expect(result.invoice.issuerRegistrationNumber).toBe(VALID_REGISTRATION_NUMBER);
  });

  it("warns (without blocking invoice creation) when the registration number fails checksum validation", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: "T1234567890123" }));

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("登録番号"))).toBe(true);
    expect(result.invoice.isQualifiedInvoice).toBe(false);
  });
});

describe("buildClientInvoice - optional payment tracking fields (未収入金)", () => {
  it("defaults dueDate, paidAt, and paidAmount to null when not provided", () => {
    const result = buildClientInvoice(baseInput());
    expect(result.invoice.dueDate).toBeNull();
    expect(result.invoice.paidAt).toBeNull();
    expect(result.invoice.paidAmount).toBeNull();
  });

  it("carries through dueDate, paidAt, and paidAmount when provided", () => {
    const result = buildClientInvoice(
      baseInput({ dueDate: "2026-08-31", paidAt: "2026-08-20", paidAmount: 50_000 })
    );
    expect(result.invoice.dueDate).toBe("2026-08-31");
    expect(result.invoice.paidAt).toBe("2026-08-20");
    expect(result.invoice.paidAmount).toBe(50_000);
  });

  it("treats a blank string dueDate/paidAt the same as omitted (normalizes to null)", () => {
    const result = buildClientInvoice(baseInput({ dueDate: "   ", paidAt: "" }));
    expect(result.invoice.dueDate).toBeNull();
    expect(result.invoice.paidAt).toBeNull();
  });

  it("does not affect validation, tax totals, or isValid when payment fields are provided", () => {
    const withoutPayment = buildClientInvoice(baseInput());
    const withPayment = buildClientInvoice(baseInput({ dueDate: "2026-08-31", paidAt: "2026-08-01", paidAmount: 100_000 }));

    expect(withPayment.errors).toEqual(withoutPayment.errors);
    expect(withPayment.warnings).toEqual(withoutPayment.warnings);
    expect(withPayment.invoice.grandTotal).toBe(withoutPayment.invoice.grandTotal);
    expect(withPayment.invoice.taxRateSubtotals).toEqual(withoutPayment.invoice.taxRateSubtotals);
  });
});

describe("buildClientInvoice - zero line item edge case", () => {
  it("does not throw and reports an error when there are no line items", () => {
    expect(() => buildClientInvoice(baseInput({ lineItems: [] }))).not.toThrow();

    const result = buildClientInvoice(baseInput({ lineItems: [] }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("明細行が1件もありません"))).toBe(true);
    expect(result.invoice.lineItems).toEqual([]);
    expect(result.invoice.taxRateSubtotals).toEqual([]);
    expect(result.invoice.subtotalExcludingTax).toBe(0);
    expect(result.invoice.totalTax).toBe(0);
    expect(result.invoice.grandTotal).toBe(0);
  });
});
