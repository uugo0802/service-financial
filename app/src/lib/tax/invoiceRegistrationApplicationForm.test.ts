import { describe, expect, it } from "vitest";
import {
  INVOICE_REGISTRATION_APPLICATION_DISCLAIMER,
  InvoiceRegistrationApplicationInputs,
  buildInvoiceRegistrationApplicationDraft,
  isInvoiceRegistrationApplicationDraftComplete,
} from "./invoiceRegistrationApplicationForm";

function inputs(overrides: Partial<InvoiceRegistrationApplicationInputs> = {}): InvoiceRegistrationApplicationInputs {
  return {
    entityType: "individual",
    name: "山田太郎",
    address: "東京都千代田区1-1-1",
    taxOfficeJurisdiction: "麹町税務署",
    isTaxExemptElectingTaxableStatus: false,
    ...overrides,
  };
}

function findSection(
  draft: ReturnType<typeof buildInvoiceRegistrationApplicationDraft>,
  title: string
) {
  const section = draft.sections.find((s) => s.title === title);
  if (!section) throw new Error(`section not found: ${title}`);
  return section;
}

function findField(section: ReturnType<typeof findSection>, label: string) {
  const field = section.fields.find((f) => f.label === label);
  if (!field) throw new Error(`field not found: ${label}`);
  return field;
}

describe("buildInvoiceRegistrationApplicationDraft", () => {
  it("builds a complete draft with no warnings for a fully filled-in individual filer", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ desiredEffectiveDatePreference: "2027年1月1日" })
    );

    expect(draft.entityType).toBe("individual");
    expect(draft.entityTypeLabel).toBe("個人事業者");
    expect(draft.warnings).toEqual([]);
    expect(isInvoiceRegistrationApplicationDraftComplete(draft)).toBe(true);

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先税務署").value).toBe("麹町税務署");

    const filer = findSection(draft, "事業者情報");
    expect(findField(filer, "事業者区分").value).toBe("個人事業者");
    expect(findField(filer, "氏名又は名称").value).toBe("山田太郎");
    expect(findField(filer, "納税地").value).toBe("東京都千代田区1-1-1");
    // Individual filers should not get a representative-name field at all.
    expect(filer.fields.some((f) => f.label === "代表者氏名")).toBe(false);

    const effectiveDate = findSection(draft, "登録を受けようとする年月日(希望)");
    expect(findField(effectiveDate, "希望日").value).toBe("2027年1月1日");

    expect(draft.disclaimer).toBe(INVOICE_REGISTRATION_APPLICATION_DISCLAIMER);
  });

  it("includes a representative-name field for corporations and warns when it is missing", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ entityType: "corporation", name: "サンプル株式会社" })
    );

    expect(draft.entityTypeLabel).toBe("法人");
    const filer = findSection(draft, "事業者情報");
    expect(findField(filer, "代表者氏名").value).toBe("（未入力）");
    expect(draft.warnings).toContain(
      "法人の場合、様式上は代表者氏名の記載欄があります。代表者氏名の入力をおすすめします。"
    );
  });

  it("does not warn about a missing representative name for individual filers", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(inputs({ entityType: "individual" }));
    expect(
      draft.warnings.some((w) => w.includes("代表者氏名"))
    ).toBe(false);
  });

  it("flags every missing required field", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ name: "", address: "", taxOfficeJurisdiction: "" })
    );

    expect(draft.warnings).toEqual([
      "氏名又は名称が入力されていません。",
      "納税地(住所又は所在地)が入力されていません。",
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。",
    ]);
    expect(isInvoiceRegistrationApplicationDraftComplete(draft)).toBe(false);
  });

  it("treats whitespace-only input as missing", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(inputs({ name: "   " }));
    expect(draft.warnings).toContain("氏名又は名称が入力されていません。");
  });

  it("shows a placeholder value instead of an empty field for an unfilled desired effective date", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(inputs());
    const effectiveDate = findSection(draft, "登録を受けようとする年月日(希望)");
    expect(findField(effectiveDate, "希望日").value).toBe("（未入力）");
    expect(
      draft.notes.some((n) => n.includes("登録希望日が未入力"))
    ).toBe(true);
  });

  it("records the tax-exempt-electing-taxable-status choice and adds a transitional-measure note without inventing specific dates", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ isTaxExemptElectingTaxableStatus: true })
    );

    const exemptSection = findSection(draft, "免税事業者に関する確認");
    expect(
      findField(
        exemptSection,
        "申請時点で免税事業者であり、この登録を機に課税事業者となることを選択するか"
      ).value
    ).toBe("はい(選択する)");

    const transitionalNote = draft.notes.find((n) => n.includes("経過措置"));
    expect(transitionalNote).toBeDefined();
    // Must not fabricate a specific legal deadline date.
    expect(transitionalNote).not.toMatch(/\d{4}年/);
    expect(transitionalNote).not.toMatch(/令和\d/);
  });

  it("records 'no' for the tax-exempt election when not selected", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ isTaxExemptElectingTaxableStatus: false })
    );
    const exemptSection = findSection(draft, "免税事業者に関する確認");
    expect(
      findField(
        exemptSection,
        "申請時点で免税事業者であり、この登録を機に課税事業者となることを選択するか"
      ).value
    ).toBe("いいえ(該当しない、又は既に課税事業者)");
    expect(draft.notes.some((n) => n.includes("経過措置"))).toBe(false);
  });

  it("always includes the disclaimer and general assumptions regardless of input completeness", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(inputs({ name: "" }));
    expect(draft.disclaimer.length).toBeGreaterThan(0);
    expect(draft.assumptions.length).toBeGreaterThan(0);
  });

  // Audit note (経過措置の期限計算): unlike invoiceValidation.ts's transitional-deduction-ratio
  // dates, this module intentionally computes no deadline/transition-rule date logic at all (see
  // the file header comment) - it only transcribes the user's free-text desiredEffectiveDatePreference
  // verbatim. There is therefore no date-boundary arithmetic here to get wrong. These tests pin
  // down that design choice: the module must never start deriving/validating a specific date from
  // its own logic (e.g. defaulting to "today" or computing a submission deadline), regardless of
  // which entity type or election is passed, since the applicable transitional-measure period is
  // determined by external, changeable 国税庁 rules this module explicitly declines to encode.
  it("never fabricates or defaults a desired effective date on its own, for any entity type or election combination", () => {
    for (const entityType of ["individual", "corporation"] as const) {
      for (const isTaxExemptElectingTaxableStatus of [true, false]) {
        const draft = buildInvoiceRegistrationApplicationDraft(
          inputs({ entityType, isTaxExemptElectingTaxableStatus })
        );
        const effectiveDate = findSection(draft, "登録を受けようとする年月日(希望)");
        // No desiredEffectiveDatePreference was supplied, so the field must stay the generic
        // "unspecified" placeholder - never a computed/defaulted calendar date.
        expect(findField(effectiveDate, "希望日").value).toBe("（未入力）");
      }
    }
  });

  it("passes through an arbitrary desired-date string unmodified, without parsing or validating it as a real date", () => {
    const draft = buildInvoiceRegistrationApplicationDraft(
      inputs({ desiredEffectiveDatePreference: "できるだけ早く（日付未定）" })
    );
    const effectiveDate = findSection(draft, "登録を受けようとする年月日(希望)");
    expect(findField(effectiveDate, "希望日").value).toBe("できるだけ早く（日付未定）");
    // Passing a non-calendar free-text string must not throw or get silently coerced/rejected.
    expect(draft.warnings).toEqual([]);
  });
});
