import { describe, expect, it } from "vitest";
import { buildClientInvoice, ClientInvoiceInput } from "./clientInvoice";
import {
  INVOICE_PRINT_NOTICE,
  buildInvoicePrintHeaderFields,
  formatInvoiceDateLabel,
  formatInvoiceTransactionLabel,
  formatIssuerRegistrationLabel,
  formatQualifiedInvoiceStatusLabel,
} from "./invoicePrintLayout";

const VALID_REGISTRATION_NUMBER = "T2120901007402"; // clientInvoice.test.tsと同じ、検算済みのチェックデジット例

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

describe("INVOICE_PRINT_NOTICE", () => {
  it("clarifies this is not tax agent service or individualized tax advice", () => {
    expect(INVOICE_PRINT_NOTICE).toContain("税務代理");
    expect(INVOICE_PRINT_NOTICE).toContain("個別具体的な税務相談");
    expect(INVOICE_PRINT_NOTICE).not.toContain("当社が税務代理を行います");
  });

  it("reminds the issuer that registration number authenticity verification is their own responsibility", () => {
    expect(INVOICE_PRINT_NOTICE).toContain("登録番号の実在確認");
    expect(INVOICE_PRINT_NOTICE).toContain("発行者ご自身の責任");
  });
});

describe("formatInvoiceDateLabel", () => {
  it("formats an ISO date string into a Japanese-style label", () => {
    expect(formatInvoiceDateLabel("2026-07-29")).toBe("2026年7月29日");
  });

  it("falls back to '未設定' for null/undefined/blank/unparsable input", () => {
    expect(formatInvoiceDateLabel(null)).toBe("未設定");
    expect(formatInvoiceDateLabel(undefined)).toBe("未設定");
    expect(formatInvoiceDateLabel("")).toBe("未設定");
    expect(formatInvoiceDateLabel("not-a-date")).toBe("未設定");
  });

  // 回帰テスト: "YYYY-MM-DD"の形式には一致していても、2月30日のような実在しない暦日は
  // 「不正な日付」として「未設定」を返す必要がある（本関数のドキュメントコメントの契約どおり）。
  // 修正前はロールオーバーの検証がなく、"2026年2月30日"のような存在しない日付をそのまま
  // 表示してしまっていた。
  it("falls back to '未設定' for a non-existent calendar date such as February 30th (regression)", () => {
    expect(formatInvoiceDateLabel("2026-02-30")).toBe("未設定");
    expect(formatInvoiceDateLabel("2026-13-01")).toBe("未設定");
    expect(formatInvoiceDateLabel("2026-04-31")).toBe("未設定");
  });

  it("still formats a valid leap-day date correctly", () => {
    expect(formatInvoiceDateLabel("2028-02-29")).toBe("2028年2月29日");
  });

  it("falls back to '未設定' for a non-leap-year February 29th", () => {
    expect(formatInvoiceDateLabel("2026-02-29")).toBe("未設定");
  });
});

describe("formatInvoiceTransactionLabel", () => {
  it("prefers a single transaction date when present", () => {
    const result = buildClientInvoice(baseInput({ transactionDate: "2026-07-25" }));
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("2026年7月25日");
  });

  it("formats a transaction period without repeating the year when both dates share it", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-01", transactionPeriodEnd: "2026-07-31" })
    );
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("2026年7月1日〜7月31日");
  });

  it("formats a transaction period spanning two years with the year on both ends", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: "2025-12-15", transactionPeriodEnd: "2026-01-10" })
    );
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("2025年12月15日〜2026年1月10日");
  });

  it("falls back to '未設定' when neither a transaction date nor a full period is available", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: null, transactionPeriodEnd: null })
    );
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("未設定");
  });

  it("falls back to '未設定' when only the period start is present (end missing)", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-01", transactionPeriodEnd: null })
    );
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("未設定");
  });

  it("falls back to '未設定' when the transaction period end is a non-existent calendar date (regression)", () => {
    const result = buildClientInvoice(
      baseInput({ transactionDate: null, transactionPeriodStart: "2026-07-01", transactionPeriodEnd: "2026-02-30" })
    );
    expect(formatInvoiceTransactionLabel(result.invoice)).toBe("未設定");
  });
});

describe("formatIssuerRegistrationLabel", () => {
  it("returns the normalized registration number when present", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: VALID_REGISTRATION_NUMBER }));
    expect(formatIssuerRegistrationLabel(result.invoice)).toBe(VALID_REGISTRATION_NUMBER);
  });

  it("explains the absence rather than leaving the field blank when unregistered", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: null }));
    expect(formatIssuerRegistrationLabel(result.invoice)).toContain("未登録");
  });
});

describe("formatQualifiedInvoiceStatusLabel", () => {
  it("marks a valid registration number as meeting qualified invoice requirements, with a verification caveat", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: VALID_REGISTRATION_NUMBER }));
    const label = formatQualifiedInvoiceStatusLabel(result.invoice);
    expect(label).toContain("適格請求書");
    expect(label).toContain("実在確認");
  });

  it("never claims 'verified' (実在確認済み) just because the checksum is valid", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: VALID_REGISTRATION_NUMBER }));
    expect(formatQualifiedInvoiceStatusLabel(result.invoice)).not.toContain("実在確認済み");
  });

  it("labels a missing/invalid registration number as a 区分記載請求書, not a qualified invoice", () => {
    const result = buildClientInvoice(baseInput({ issuerRegistrationNumber: null }));
    const label = formatQualifiedInvoiceStatusLabel(result.invoice);
    expect(label).toContain("区分記載請求書");
    expect(label).not.toContain("適格請求書（インボイス）の記載事項を満たしています");
  });
});

describe("buildInvoicePrintHeaderFields", () => {
  it("includes the invoice-required header fields (registration number, issue date, etc.)", () => {
    const result = buildClientInvoice(baseInput());
    const fields = buildInvoicePrintHeaderFields(result.invoice);
    const keys = fields.map((f) => f.key);

    expect(keys).toEqual([
      "invoiceNumber",
      "issueDate",
      "transactionDate",
      "issuerName",
      "issuerRegistrationNumber",
      "clientName",
    ]);
  });

  it("reflects the built invoice's actual values", () => {
    const result = buildClientInvoice(
      baseInput({ invoiceNumber: "INV-20260729-0001", clientName: "株式会社サンプル", issuerName: "山田太郎" })
    );
    const fields = buildInvoicePrintHeaderFields(result.invoice);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.invoiceNumber).toBe("INV-20260729-0001");
    expect(byKey.issueDate).toBe("2026年7月29日");
    expect(byKey.transactionDate).toBe("2026年7月25日");
    expect(byKey.issuerName).toBe("山田太郎");
    expect(byKey.issuerRegistrationNumber).toBe(VALID_REGISTRATION_NUMBER);
    expect(byKey.clientName).toBe("株式会社サンプル");
  });

  it("falls back to placeholder text for missing issuer/client names instead of blank strings", () => {
    const result = buildClientInvoice(baseInput({ issuerName: "", clientName: "" }));
    const fields = buildInvoicePrintHeaderFields(result.invoice);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.issuerName).toBe("（未入力）");
    expect(byKey.clientName).toBe("（未入力）");
  });

  it("falls back to '未採番' when no invoice number was assigned (blank input, unparsable issue date)", () => {
    const result = buildClientInvoice(baseInput({ invoiceNumber: "", issueDate: "not-a-date" }));
    const byKey = Object.fromEntries(buildInvoicePrintHeaderFields(result.invoice).map((f) => [f.key, f.value]));

    // issueDateが不正なため formatInvoiceNumber は "00000000" にフォールバックするが、
    // それでも invoiceNumber 自体は空文字にはならない
    expect(byKey.invoiceNumber).toBe("INV-00000000-0001");
    expect(byKey.issueDate).toBe("未設定");
  });
});
