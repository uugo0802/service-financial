import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  QuoteInput,
  addDaysToIsoDate,
  buildQuote,
  convertQuoteToClientInvoiceInput,
  formatQuoteNumber,
  isQuoteAcceptedForConversion,
  isQuoteExpired,
  markQuoteAsConvertedToInvoice,
  resolveQuoteEffectiveStatus,
  validateQuoteInput,
} from "./quote";

const VALID_REGISTRATION_NUMBER = "T2120901007402"; // 国税庁公式PDFのチェックデジット計算例（検算済み、clientInvoice.test.tsと同一）

function baseInput(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    issuerName: "山田太郎",
    issuerRegistrationNumber: VALID_REGISTRATION_NUMBER,
    issueDate: "2026-07-29",
    clientName: "株式会社サンプル",
    lineItems: [{ description: "コンサルティング費用", quantity: 1, unitPrice: 100_000, taxRate: 10 }],
    ...overrides,
  };
}

describe("formatQuoteNumber", () => {
  it("formats issue date and sequence into EST-YYYYMMDD-NNNN", () => {
    expect(formatQuoteNumber("2026-07-29", 3)).toBe("EST-20260729-0003");
  });

  it("falls back to a safe default for malformed dates or sequences", () => {
    expect(formatQuoteNumber("not-a-date", 0)).toBe("EST-00000000-0001");
  });

  it("falls back to sequence 1 for a negative sequence", () => {
    expect(formatQuoteNumber("2026-07-29", -5)).toBe("EST-20260729-0001");
  });
});

describe("addDaysToIsoDate", () => {
  it("adds days within the same month", () => {
    expect(addDaysToIsoDate("2026-07-01", 30)).toBe("2026-07-31");
  });

  it("rolls over into the next month", () => {
    expect(addDaysToIsoDate("2026-07-15", 30)).toBe("2026-08-14");
  });

  it("rolls over a leap year February correctly", () => {
    // 2028年はうるう年
    expect(addDaysToIsoDate("2028-02-01", 29)).toBe("2028-03-01");
  });

  it("returns null for a malformed date", () => {
    expect(addDaysToIsoDate("not-a-date", 30)).toBeNull();
  });

  it("returns null for a non-existent calendar date", () => {
    expect(addDaysToIsoDate("2026-02-30", 1)).toBeNull();
  });

  it("returns null for a non-integer day count", () => {
    expect(addDaysToIsoDate("2026-07-01", 1.5)).toBeNull();
  });
});

describe("buildQuote - mixed tax rate calculation (mirrors clientInvoice.ts rounding)", () => {
  it("splits totals per tax rate and sums them into a grand total", () => {
    const result = buildQuote(
      baseInput({
        lineItems: [
          { description: "デザイン制作費（標準税率）", quantity: 1, unitPrice: 200_000, taxRate: 10 },
          { description: "書籍代（軽減税率）", quantity: 2, unitPrice: 1_000, taxRate: 8 },
        ],
      })
    );

    expect(result.errors).toEqual([]);

    const standard = result.quote.taxRateSubtotals.find((s) => s.taxRate === 10)!;
    const reduced = result.quote.taxRateSubtotals.find((s) => s.taxRate === 8)!;

    expect(standard.taxableBase).toBe(200_000);
    expect(standard.taxAmount).toBe(20_000);
    expect(reduced.taxableBase).toBe(2_000);
    expect(reduced.taxAmount).toBe(160);

    expect(result.quote.subtotalExcludingTax).toBe(202_000);
    expect(result.quote.totalTax).toBe(20_160);
    expect(result.quote.grandTotal).toBe(222_160);
  });

  it("rounds down once per tax rate group rather than per line item (same convention as clientInvoice.ts)", () => {
    const result = buildQuote(
      baseInput({
        lineItems: [
          { description: "商品A", quantity: 1, unitPrice: 999, taxRate: 10 },
          { description: "商品B", quantity: 1, unitPrice: 999, taxRate: 10 },
        ],
      })
    );

    const standard = result.quote.taxRateSubtotals.find((s) => s.taxRate === 10)!;
    expect(standard.taxableBase).toBe(1_998);
    expect(standard.taxAmount).toBe(199); // per-line rounding would have given 99+99=198
    expect(standard.taxAmount).not.toBe(198);
  });

  it("rounds down fractional line amounts (quantity × unit price) to the nearest yen", () => {
    const result = buildQuote(
      baseInput({
        lineItems: [{ description: "作業（時間単価）", quantity: 1.5, unitPrice: 3_333, taxRate: 10 }],
      })
    );
    // 1.5 × 3,333 = 4,999.5 → 円未満切り捨てで4,999円
    expect(result.quote.lineItems[0].lineAmountExcludingTax).toBe(4_999);
  });

  it("includes a 0% breakdown row with zero tax, and rolls it into the grand total", () => {
    const result = buildQuote(
      baseInput({
        lineItems: [
          { description: "課税対象外の実費（立替交通費など）", quantity: 1, unitPrice: 5_000, taxRate: 0 },
          { description: "本体サービス", quantity: 1, unitPrice: 10_000, taxRate: 10 },
        ],
      })
    );

    const zeroRate = result.quote.taxRateSubtotals.find((s) => s.taxRate === 0);
    expect(zeroRate).toBeDefined();
    expect(zeroRate!.taxableBase).toBe(5_000);
    expect(zeroRate!.taxAmount).toBe(0);

    expect(result.quote.subtotalExcludingTax).toBe(15_000);
    expect(result.quote.totalTax).toBe(1_000);
    expect(result.quote.grandTotal).toBe(16_000);
  });
});

describe("buildQuote - required field validation", () => {
  it("returns errors (not a thrown exception) when required fields are missing", () => {
    const result = buildQuote(baseInput({ issuerName: "", clientName: "", issueDate: "" }));

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("発行者名"),
        expect.stringContaining("見積先"),
        expect.stringContaining("発行日"),
      ])
    );
    expect(result.quote).toBeDefined();
  });

  it("flags invalid line item fields individually", () => {
    const { errors } = validateQuoteInput(
      baseInput({ lineItems: [{ description: "", quantity: 0, unitPrice: -1, taxRate: 10 }] })
    );
    expect(errors.some((e) => e.includes("品目・内容"))).toBe(true);
    expect(errors.some((e) => e.includes("数量"))).toBe(true);
    expect(errors.some((e) => e.includes("単価"))).toBe(true);
  });

  it("rejects an invalid tax rate that is not one of 0/8/10", () => {
    const { errors } = validateQuoteInput(
      baseInput({ lineItems: [{ description: "テスト", quantity: 1, unitPrice: 100, taxRate: 5 as never }] })
    );
    expect(errors.some((e) => e.includes("税率"))).toBe(true);
  });

  it("does not throw and reports an error when there are no line items", () => {
    expect(() => buildQuote(baseInput({ lineItems: [] }))).not.toThrow();
    const result = buildQuote(baseInput({ lineItems: [] }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("明細行が1件もありません"))).toBe(true);
    expect(result.quote.grandTotal).toBe(0);
  });
});

describe("buildQuote - registration number handling (same pattern as clientInvoice.ts)", () => {
  it("produces a warning (not a hard error) when the registration number is missing", () => {
    const result = buildQuote(baseInput({ issuerRegistrationNumber: null }));

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("登録番号"))).toBe(true);
    expect(result.quote.issuerRegistrationNumber).toBeNull();
  });

  it("normalizes a valid registration number", () => {
    const result = buildQuote(baseInput({ issuerRegistrationNumber: VALID_REGISTRATION_NUMBER }));
    expect(result.warnings).toEqual([]);
    expect(result.quote.issuerRegistrationNumber).toBe(VALID_REGISTRATION_NUMBER);
  });
});

describe("buildQuote - validity period (有効期限)", () => {
  it("defaults to 30 days when validityPeriodDays is omitted", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01" }));
    expect(result.quote.validityPeriodDays).toBe(DEFAULT_QUOTE_VALIDITY_DAYS);
    expect(result.quote.validUntil).toBe("2026-07-31");
  });

  it("uses an explicit validityPeriodDays value to compute validUntil", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 14 }));
    expect(result.quote.validityPeriodDays).toBe(14);
    expect(result.quote.validUntil).toBe("2026-07-15");
  });

  it("falls back to the default and warns when validityPeriodDays is zero or negative", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 0 }));
    expect(result.quote.validityPeriodDays).toBe(DEFAULT_QUOTE_VALIDITY_DAYS);
    expect(result.warnings.some((w) => w.includes("有効期限"))).toBe(true);
  });

  it("leaves validUntil null when issueDate is invalid", () => {
    const result = buildQuote(baseInput({ issueDate: "not-a-date" }));
    expect(result.quote.validUntil).toBeNull();
  });
});

describe("isQuoteExpired / resolveQuoteEffectiveStatus", () => {
  it("is not expired on the validUntil date itself (inclusive)", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "sent" }));
    expect(isQuoteExpired(result.quote, "2026-07-31")).toBe(false);
    expect(resolveQuoteEffectiveStatus(result.quote, "2026-07-31")).toBe("sent");
  });

  it("is expired the day after validUntil", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "sent" }));
    expect(isQuoteExpired(result.quote, "2026-08-01")).toBe(true);
    expect(resolveQuoteEffectiveStatus(result.quote, "2026-08-01")).toBe("expired");
  });

  it("keeps draft status as draft once past validUntil (effective status only reported via resolveQuoteEffectiveStatus)", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "draft" }));
    expect(result.quote.status).toBe("draft");
    expect(resolveQuoteEffectiveStatus(result.quote, "2026-08-01")).toBe("expired");
  });

  it("does not treat an accepted quote as expired even after validUntil has passed", () => {
    const result = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "accepted" }));
    expect(resolveQuoteEffectiveStatus(result.quote, "2026-12-31")).toBe("accepted");
  });

  it("does not treat a converted quote as expired even after validUntil has passed", () => {
    const result = buildQuote(
      baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "converted_to_invoice" })
    );
    expect(resolveQuoteEffectiveStatus(result.quote, "2026-12-31")).toBe("converted_to_invoice");
  });

  it("returns false from isQuoteExpired when validUntil could not be computed", () => {
    const result = buildQuote(baseInput({ issueDate: "not-a-date" }));
    expect(isQuoteExpired(result.quote, "2099-01-01")).toBe(false);
  });
});

describe("isQuoteAcceptedForConversion", () => {
  it("is true only when the effective status is accepted", () => {
    const accepted = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "accepted" })).quote;
    const sent = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "sent" })).quote;

    expect(isQuoteAcceptedForConversion(accepted, "2026-07-15")).toBe(true);
    expect(isQuoteAcceptedForConversion(sent, "2026-07-15")).toBe(false);
  });

  it("is false once an accepted-looking sent quote has actually expired", () => {
    const sent = buildQuote(baseInput({ issueDate: "2026-07-01", validityPeriodDays: 30, status: "sent" })).quote;
    expect(isQuoteAcceptedForConversion(sent, "2026-08-15")).toBe(false);
  });
});

describe("convertQuoteToClientInvoiceInput", () => {
  it("carries over issuer, client, and line items with the exact ClientInvoiceLineItemInput shape", () => {
    const { quote } = buildQuote(
      baseInput({
        issueDate: "2026-07-01",
        status: "accepted",
        lineItems: [
          { description: "デザイン制作費", quantity: 1, unitPrice: 200_000, taxRate: 10 },
          { description: "書籍代", quantity: 2, unitPrice: 1_000, taxRate: 8 },
        ],
      })
    );

    const invoiceInput = convertQuoteToClientInvoiceInput(quote);

    expect(invoiceInput.issuerName).toBe(quote.issuerName);
    expect(invoiceInput.issuerRegistrationNumber).toBe(quote.issuerRegistrationNumber);
    expect(invoiceInput.clientName).toBe(quote.clientName);
    expect(invoiceInput.issueDate).toBe(quote.issueDate);
    expect(invoiceInput.transactionDate).toBe(quote.issueDate);
    expect(invoiceInput.lineItems).toEqual([
      { description: "デザイン制作費", quantity: 1, unitPrice: 200_000, taxRate: 10 },
      { description: "書籍代", quantity: 2, unitPrice: 1_000, taxRate: 8 },
    ]);
    // 変換結果のキー集合はClientInvoiceLineItemInputが期待するフィールドのみで構成される
    expect(Object.keys(invoiceInput.lineItems[0]).sort()).toEqual(
      ["description", "quantity", "taxRate", "unitPrice"].sort()
    );
  });

  it("uses the provided invoiceIssueDate/invoiceNumber/transactionDate overrides when given", () => {
    const { quote } = buildQuote(baseInput({ issueDate: "2026-07-01", status: "accepted" }));

    const invoiceInput = convertQuoteToClientInvoiceInput(quote, {
      invoiceIssueDate: "2026-08-05",
      invoiceNumber: "INV-CUSTOM-0001",
      transactionDate: "2026-07-20",
    });

    expect(invoiceInput.issueDate).toBe("2026-08-05");
    expect(invoiceInput.invoiceNumber).toBe("INV-CUSTOM-0001");
    expect(invoiceInput.transactionDate).toBe("2026-07-20");
  });

  it("uses a transaction period instead of a single transaction date when provided", () => {
    const { quote } = buildQuote(baseInput({ issueDate: "2026-07-01", status: "accepted" }));

    const invoiceInput = convertQuoteToClientInvoiceInput(quote, {
      transactionPeriodStart: "2026-07-01",
      transactionPeriodEnd: "2026-07-31",
    });

    expect(invoiceInput.transactionDate).toBeNull();
    expect(invoiceInput.transactionPeriodStart).toBe("2026-07-01");
    expect(invoiceInput.transactionPeriodEnd).toBe("2026-07-31");
  });

  it("does not throw when converting a quote that has not been explicitly accepted (caller decides via isQuoteAcceptedForConversion)", () => {
    const { quote } = buildQuote(baseInput({ status: "draft" }));
    expect(() => convertQuoteToClientInvoiceInput(quote)).not.toThrow();
  });
});

describe("markQuoteAsConvertedToInvoice", () => {
  it("returns a new quote object with status converted_to_invoice, leaving the original untouched", () => {
    const { quote } = buildQuote(baseInput({ status: "accepted" }));
    const converted = markQuoteAsConvertedToInvoice(quote);

    expect(converted.status).toBe("converted_to_invoice");
    expect(converted).not.toBe(quote);
    expect(quote.status).toBe("accepted"); // 元のオブジェクトはイミュータブルに保たれる
  });
});
