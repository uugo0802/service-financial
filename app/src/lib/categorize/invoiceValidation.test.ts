import { describe, expect, it } from "vitest";
import {
  buildInvoiceWarningFlag,
  determineDeductionEligibility,
  INVOICE_VALIDATION_DISCLAIMER,
  validateInvoiceNumberFormat,
} from "./invoiceValidation";

describe("validateInvoiceNumberFormat", () => {
  it("accepts a well-formed registration number (T + 13 digits)", () => {
    const result = validateInvoiceNumberFormat("T1234567890123");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("T1234567890123");
    expect(result.reason).toBeUndefined();
  });

  it("normalizes a lowercase t to uppercase", () => {
    const result = validateInvoiceNumberFormat("t1234567890123");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("T1234567890123");
  });

  it("normalizes full-width characters via NFKC", () => {
    const result = validateInvoiceNumberFormat("Ｔ１２３４５６７８９０１２３");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("T1234567890123");
  });

  it("trims surrounding whitespace and internal hyphens", () => {
    const result = validateInvoiceNumberFormat("  T-1234-5678-90123  ");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("T1234567890123");
  });

  it("rejects an empty string", () => {
    const result = validateInvoiceNumberFormat("");
    expect(result.valid).toBe(false);
    expect(result.normalized).toBeNull();
    expect(result.reason).toContain("入力されていません");
  });

  it("rejects a whitespace-only string", () => {
    const result = validateInvoiceNumberFormat("   ");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("入力されていません");
  });

  it("rejects null/undefined", () => {
    expect(validateInvoiceNumberFormat(null).valid).toBe(false);
    expect(validateInvoiceNumberFormat(undefined).valid).toBe(false);
  });

  it("rejects a number missing the leading T", () => {
    const result = validateInvoiceNumberFormat("1234567890123");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("T");
  });

  it("rejects a prefix other than T", () => {
    const result = validateInvoiceNumberFormat("X1234567890123");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("T");
  });

  it("rejects a digit part that is too short", () => {
    const result = validateInvoiceNumberFormat("T123456789012");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("13桁");
  });

  it("rejects a digit part that is too long", () => {
    const result = validateInvoiceNumberFormat("T12345678901234");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("13桁");
  });

  it("rejects non-digit characters after T", () => {
    const result = validateInvoiceNumberFormat("T12345678ABCDE");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("数字");
  });

  it("rejects a bare T with no digits", () => {
    const result = validateInvoiceNumberFormat("T");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("13桁");
  });
});

describe("determineDeductionEligibility", () => {
  it("returns not_applicable for non-taxable-purchase categories regardless of the invoice number", () => {
    const result = determineDeductionEligibility({
      taxCategory: "非課税",
      invoiceNumber: null,
    });
    expect(result.eligibility).toBe("not_applicable");
    expect(result.deductibleRatio).toBe(0);
    expect(result.warning).toBeUndefined();
  });

  it("returns not_applicable for taxable sales (課税売上) since it is not a purchase", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税売上10%",
      invoiceNumber: "T1234567890123",
    });
    expect(result.eligibility).toBe("not_applicable");
  });

  it("returns eligible with full deduction when the registration number is valid", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: "T1234567890123",
      transactionDate: "2026-07-28",
    });
    expect(result.eligibility).toBe("eligible");
    expect(result.deductibleRatio).toBe(100);
    expect(result.warning).toBeUndefined();
    expect(result.numberFormat.valid).toBe(true);
  });

  it("applies the 80% transitional measure when the number is missing and the date is before 2026-09-30", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: null,
      transactionDate: "2026-07-28",
    });
    expect(result.eligibility).toBe("transitional");
    expect(result.deductibleRatio).toBe(80);
    expect(result.warning).toContain("登録番号未確認のため仕入税額控除の適用に注意");
    expect(result.warning).toContain("経過措置");
  });

  it("applies the 80% transitional measure for reduced-rate (8%) taxable purchases too", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入8%(軽減)",
      invoiceNumber: undefined,
      transactionDate: "2026-01-01",
    });
    expect(result.eligibility).toBe("transitional");
    expect(result.deductibleRatio).toBe(80);
  });

  it("applies the 50% transitional measure between 2026-10-01 and 2029-09-30", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: "invalid-number",
      transactionDate: "2027-04-01",
    });
    expect(result.eligibility).toBe("transitional");
    expect(result.deductibleRatio).toBe(50);
  });

  it("returns ineligible with zero deduction after the transitional period ends", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: null,
      transactionDate: "2029-10-01",
    });
    expect(result.eligibility).toBe("ineligible");
    expect(result.deductibleRatio).toBe(0);
    expect(result.warning).toContain("登録番号未確認のため仕入税額控除の適用に注意");
  });

  it("conservatively returns ineligible (ratio 0) when the transaction date is unknown", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: "not-a-number",
    });
    expect(result.eligibility).toBe("ineligible");
    expect(result.deductibleRatio).toBe(0);
  });

  it("treats a malformed registration number the same as a missing one", () => {
    const result = determineDeductionEligibility({
      taxCategory: "課税仕入10%",
      invoiceNumber: "T123", // too short
      transactionDate: "2026-07-28",
    });
    expect(result.eligibility).toBe("transitional");
    expect(result.numberFormat.valid).toBe(false);
  });
});

describe("buildInvoiceWarningFlag", () => {
  it("attaches no warning to a transaction with a valid registration number", () => {
    const tx = {
      taxCategory: "課税仕入10%" as const,
      invoiceNumber: "T1234567890123",
      date: "2026-07-28",
      account: "外注費",
    };
    const result = buildInvoiceWarningFlag(tx);
    expect(result.hasInvoiceWarning).toBe(false);
    expect(result.invoiceWarningMessage).toBeUndefined();
    expect(result.invoiceDeductionEligibility).toBe("eligible");
    expect(result.invoiceDeductibleRatio).toBe(100);
    // original fields are preserved (non-destructive augmentation)
    expect(result.account).toBe("外注費");
  });

  it("attaches a warning when the registration number is missing on a taxable purchase", () => {
    const tx = {
      taxCategory: "課税仕入10%" as const,
      date: "2026-07-28",
    };
    const result = buildInvoiceWarningFlag(tx);
    expect(result.hasInvoiceWarning).toBe(true);
    expect(result.invoiceWarningMessage).toContain("仕入税額控除の適用に注意");
    expect(result.invoiceDeductionEligibility).toBe("transitional");
  });

  it("works with objects that omit the optional invoiceNumber key entirely (compatible with CategorizedTransaction)", () => {
    const tx = {
      id: "1",
      date: "2026-07-28",
      description: "外注先A社",
      amount: -50000,
      account: "外注費",
      taxCategory: "課税仕入10%" as const,
      confidence: 1,
      source: "rule" as const,
    };
    const result = buildInvoiceWarningFlag(tx);
    expect(result.hasInvoiceWarning).toBe(true);
    expect(result.id).toBe("1");
  });

  it("does not warn on non-purchase categories", () => {
    const tx = { taxCategory: "非課税" as const };
    const result = buildInvoiceWarningFlag(tx);
    expect(result.hasInvoiceWarning).toBe(false);
    expect(result.invoiceDeductionEligibility).toBe("not_applicable");
  });
});

describe("INVOICE_VALIDATION_DISCLAIMER", () => {
  it("explicitly states this is a rule-based format check, not individual tax advice", () => {
    expect(INVOICE_VALIDATION_DISCLAIMER).toContain("税務相談ではありません");
  });
});
