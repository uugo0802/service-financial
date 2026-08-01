import { describe, expect, it } from "vitest";
import { OverdueInvoice } from "./receivables";
import {
  PAYMENT_REMINDER_DISCLAIMER,
  REMINDER_TONE_OPTIONS,
  generatePaymentReminderDraft,
} from "./paymentReminderDraft";

function overdueInvoice(overrides: Partial<OverdueInvoice> = {}): OverdueInvoice {
  return {
    invoiceNumber: "INV-20260601-0001",
    clientName: "株式会社サンプル",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    daysOverdue: 15,
    outstandingAmount: 220_000,
    ...overrides,
  };
}

describe("generatePaymentReminderDraft - gentle tone", () => {
  it("generates a polite first-reminder draft that includes the invoice details", () => {
    const result = generatePaymentReminderDraft(overdueInvoice(), "gentle");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");

    expect(result.draft.tone).toBe("gentle");
    expect(result.draft.invoiceNumber).toBe("INV-20260601-0001");
    expect(result.draft.clientName).toBe("株式会社サンプル");
    expect(result.draft.subject).toContain("INV-20260601-0001");
    expect(result.draft.subject).not.toContain("至急");

    expect(result.draft.body).toContain("株式会社サンプル 様");
    expect(result.draft.body).toContain("INV-20260601-0001");
    expect(result.draft.body).toContain("2026年6月30日");
    expect(result.draft.body).toContain("15日超過");
    expect(result.draft.body).toContain("￥220,000");
    // gentle tone should not sound like an escalated/urgent demand
    expect(result.draft.body).not.toContain("至急");
  });

  it("falls back to the issue date (labelled as such) when dueDate is not provided", () => {
    const result = generatePaymentReminderDraft(
      overdueInvoice({ dueDate: null, issueDate: "2026-05-01", daysOverdue: 45 }),
      "gentle"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.draft.body).toContain("2026年5月1日");
    expect(result.draft.body).toContain("請求書発行日を基準とした支払期日");
  });

  it("appends a signature line only when senderName is provided", () => {
    const withoutSignature = generatePaymentReminderDraft(overdueInvoice(), "gentle");
    const withSignature = generatePaymentReminderDraft(overdueInvoice(), "gentle", {
      senderName: "合同会社サンプル 山田太郎",
    });

    if (!withoutSignature.ok || !withSignature.ok) throw new Error("expected ok results");
    expect(withoutSignature.draft.body).not.toContain("合同会社サンプル 山田太郎");
    expect(withSignature.draft.body).toContain("合同会社サンプル 山田太郎");
  });
});

describe("generatePaymentReminderDraft - firm tone", () => {
  it("generates a more direct second/escalated reminder draft", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ daysOverdue: 60 }), "firm");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");

    expect(result.draft.tone).toBe("firm");
    expect(result.draft.subject).toContain("至急");
    expect(result.draft.subject).toContain("INV-20260601-0001");
    expect(result.draft.body).toContain("60日超過");
    expect(result.draft.body).toContain("1週間以内");
  });

  it("produces a subject/body distinct from the gentle tone for the same invoice", () => {
    const invoice = overdueInvoice();
    const gentle = generatePaymentReminderDraft(invoice, "gentle");
    const firm = generatePaymentReminderDraft(invoice, "firm");

    if (!gentle.ok || !firm.ok) throw new Error("expected ok results");
    expect(gentle.draft.subject).not.toBe(firm.draft.subject);
    expect(gentle.draft.body).not.toBe(firm.draft.body);
  });
});

describe("generatePaymentReminderDraft - not yet overdue", () => {
  it("rejects with reason 'not-overdue' when daysOverdue is 0", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ daysOverdue: 0 }), "gentle");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("not-overdue");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("rejects with reason 'not-overdue' when daysOverdue is negative", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ daysOverdue: -5 }), "firm");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("not-overdue");
  });

  it("rejects with reason 'not-overdue' when daysOverdue is not a finite number", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ daysOverdue: NaN }), "gentle");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("not-overdue");
  });
});

describe("generatePaymentReminderDraft - invalid invoice data", () => {
  it("rejects with reason 'invalid-invoice' when the client name is blank", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ clientName: "   " }), "gentle");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("invalid-invoice");
  });

  it("rejects with reason 'invalid-invoice' when the invoice number is blank", () => {
    const result = generatePaymentReminderDraft(overdueInvoice({ invoiceNumber: "" }), "gentle");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("invalid-invoice");
  });

  it("rejects with reason 'invalid-invoice' when the outstanding amount is zero or negative", () => {
    const zero = generatePaymentReminderDraft(overdueInvoice({ outstandingAmount: 0 }), "gentle");
    const negative = generatePaymentReminderDraft(overdueInvoice({ outstandingAmount: -100 }), "gentle");

    expect(zero.ok).toBe(false);
    expect(negative.ok).toBe(false);
    if (zero.ok || negative.ok) throw new Error("expected rejections");
    expect(zero.reason).toBe("invalid-invoice");
    expect(negative.reason).toBe("invalid-invoice");
  });
});

describe("REMINDER_TONE_OPTIONS / PAYMENT_REMINDER_DISCLAIMER", () => {
  it("exposes exactly the gentle and firm tone options", () => {
    expect(REMINDER_TONE_OPTIONS.map((o) => o.value).sort()).toEqual(["firm", "gentle"]);
  });

  it("exposes a non-empty disclaimer string", () => {
    expect(PAYMENT_REMINDER_DISCLAIMER.length).toBeGreaterThan(0);
  });
});
