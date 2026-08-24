import { describe, expect, it } from "vitest";
import {
  BUSINESS_COMMENCEMENT_NOTIFICATION_DISCLAIMER,
  BusinessCommencementNotificationInputs,
  buildBusinessCommencementNotificationDraft,
  isBusinessCommencementNotificationDraftComplete,
} from "./businessCommencementNotificationForm";

function inputs(
  overrides: Partial<BusinessCommencementNotificationInputs> = {}
): BusinessCommencementNotificationInputs {
  return {
    taxOfficeJurisdiction: "麹町税務署",
    address: "東京都千代田区1-1-1",
    name: "山田太郎",
    dateOfBirth: "1990年4月1日",
    occupation: "Webデザイナー",
    commencementDate: "2026年8月1日",
    businessDescription: "Webサイトの制作・デザイン業務",
    hasEmployees: false,
    fileBlueTaxReturnApplicationSimultaneously: false,
    ...overrides,
  };
}

function findSection(
  draft: ReturnType<typeof buildBusinessCommencementNotificationDraft>,
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

describe("buildBusinessCommencementNotificationDraft", () => {
  it("builds a complete draft with no warnings for a fully filled-in filer with no employees", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ submissionDate: "2026年8月6日", tradeName: "山田デザイン事務所" })
    );

    expect(draft.warnings).toEqual([]);
    expect(isBusinessCommencementNotificationDraftComplete(draft)).toBe(true);

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先税務署").value).toBe("麹町税務署");
    expect(findField(submitter, "提出日").value).toBe("2026年8月6日");

    const filer = findSection(draft, "提出者情報");
    expect(findField(filer, "納税地").value).toBe("東京都千代田区1-1-1");
    expect(findField(filer, "氏名").value).toBe("山田太郎");
    expect(findField(filer, "生年月日").value).toBe("1990年4月1日");
    expect(findField(filer, "職業").value).toBe("Webデザイナー");
    expect(findField(filer, "屋号").value).toBe("山田デザイン事務所");

    const notice = findSection(draft, "届出の区分");
    expect(findField(notice, "届出の区分").value).toBe("開業");
    expect(findField(notice, "開業・廃業等日").value).toBe("2026年8月1日");

    const description = findSection(draft, "事業の概要");
    expect(findField(description, "事業の概要").value).toBe("Webサイトの制作・デザイン業務");

    const salary = findSection(draft, "給与等の支払の状況");
    expect(findField(salary, "従業員を雇うか").value).toBe("いいえ");
    // No employees, so employee-count/salary-start fields should not even appear.
    expect(salary.fields.some((f) => f.label === "従業員数")).toBe(false);
    expect(salary.fields.some((f) => f.label === "給与支払を開始する年月日")).toBe(false);

    const attachment = findSection(draft, "添付書類");
    expect(findField(attachment, "青色申告承認申請書を同時に提出するか").value).toBe("いいえ");

    expect(draft.disclaimer).toBe(BUSINESS_COMMENCEMENT_NOTIFICATION_DISCLAIMER);
  });

  it("never exposes a My Number (マイナンバー) input field, only a fixed self-fill placeholder", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs());
    const filer = findSection(draft, "提出者情報");
    const myNumberField = findField(filer, "個人番号（マイナンバー）");
    expect(myNumberField.value).toContain("ご自身でご記入ください");
    expect(myNumberField.value).not.toMatch(/\d{4}/);
    // The inputs type itself must not accept a My Number value at all.
    expect(Object.keys(inputs())).not.toContain("myNumber");
  });

  it("shows a distinct placeholder ('屋号なし') rather than the generic missing-field placeholder when no trade name is given", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs());
    const filer = findSection(draft, "提出者情報");
    expect(findField(filer, "屋号").value).toBe("（屋号なし）");
    // A missing (optional) trade name must not be treated as a validation warning.
    expect(draft.warnings.some((w) => w.includes("屋号"))).toBe(false);
  });

  it("treats whitespace-only trade name the same as no trade name", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ tradeName: "   " }));
    const filer = findSection(draft, "提出者情報");
    expect(findField(filer, "屋号").value).toBe("（屋号なし）");
  });

  it("flags every missing required field", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({
        taxOfficeJurisdiction: "",
        address: "",
        name: "",
        dateOfBirth: "",
        occupation: "",
        commencementDate: "",
        businessDescription: "",
      })
    );

    expect(draft.warnings).toEqual([
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。",
      "納税地(住所又は居所)が入力されていません。",
      "氏名が入力されていません。",
      "生年月日が入力されていません。",
      "職業が入力されていません。",
      "開業・廃業等日が入力されていません。",
      "事業の概要が入力されていません。",
    ]);
    expect(isBusinessCommencementNotificationDraftComplete(draft)).toBe(false);
  });

  it("treats whitespace-only input as missing for required fields", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ name: "   " }));
    expect(draft.warnings).toContain("氏名が入力されていません。");
  });

  it("shows a placeholder value instead of an empty field for an unfilled submission date", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs());
    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出日").value).toBe("（未入力）");
    expect(draft.notes.some((n) => n.includes("提出日が未入力"))).toBe(true);
  });

  it("does not warn about employee count/salary date when hasEmployees is false, even if left unset", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: false, employeeCount: undefined, salaryPaymentStartDate: undefined })
    );
    expect(draft.warnings.some((w) => w.includes("従業員"))).toBe(false);
  });

  it("requires employee count and salary payment start date when hasEmployees is true", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ hasEmployees: true }));
    expect(draft.warnings).toContain("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
    expect(draft.warnings).toContain("従業員を雇う場合、給与支払を開始する年月日を入力してください。");
  });

  it("accepts a valid employee count and salary start date when hasEmployees is true", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: 2, salaryPaymentStartDate: "2026年9月25日" })
    );
    expect(draft.warnings).toEqual([]);

    const salary = findSection(draft, "給与等の支払の状況");
    expect(findField(salary, "従業員を雇うか").value).toBe("はい");
    expect(findField(salary, "従業員数").value).toBe("2人");
    expect(findField(salary, "給与支払を開始する年月日").value).toBe("2026年9月25日");
  });

  it("rejects a zero employee count when hasEmployees is true (boundary case)", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: 0, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.warnings).toContain("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
  });

  it("rejects a negative employee count when hasEmployees is true", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: -1, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.warnings).toContain("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
  });

  it("rejects a non-integer employee count when hasEmployees is true", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: 1.5, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.warnings).toContain("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
  });

  it("rejects a non-finite employee count when hasEmployees is true", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: Number.POSITIVE_INFINITY, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.warnings).toContain("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
  });

  it("accepts a large but valid employee count (boundary case)", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: 1, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.warnings).toEqual([]);
    const salary = findSection(draft, "給与等の支払の状況");
    expect(findField(salary, "従業員数").value).toBe("1人");
  });

  it("adds a note about related withholding-tax filings when hiring employees", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ hasEmployees: true, employeeCount: 1, salaryPaymentStartDate: "2026年9月1日" })
    );
    expect(draft.notes.some((n) => n.includes("給与支払事務所等の開設"))).toBe(true);
  });

  it("does not add the hiring-related note when not hiring employees", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ hasEmployees: false }));
    expect(draft.notes.some((n) => n.includes("給与支払事務所等の開設"))).toBe(false);
  });

  it("records the blue-tax-return simultaneous filing choice and adds a general-deadline note without inventing a specific date", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ fileBlueTaxReturnApplicationSimultaneously: true })
    );

    const attachment = findSection(draft, "添付書類");
    expect(findField(attachment, "青色申告承認申請書を同時に提出するか").value).toBe("はい(同時に提出する)");

    const blueTaxNote = draft.notes.find((n) => n.includes("青色申告承認申請書の提出期限"));
    expect(blueTaxNote).toBeDefined();
    // Must state the general statutory rule (3/15, or 2 months from commencement), not a
    // specific computed calendar date derived from this filer's own commencementDate input.
    expect(blueTaxNote).toContain("3月15日");
    expect(blueTaxNote).toContain("2か月以内");
  });

  it("does not add the blue-tax-return note when not filing it simultaneously", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ fileBlueTaxReturnApplicationSimultaneously: false })
    );
    expect(draft.notes.some((n) => n.includes("青色申告承認申請書の提出期限"))).toBe(false);
  });

  it("always includes a general filing-deadline note regardless of input completeness", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ name: "" }));
    expect(draft.notes.some((n) => n.includes("1か月以内"))).toBe(true);
  });

  it("always includes the disclaimer and general assumptions regardless of input completeness", () => {
    const draft = buildBusinessCommencementNotificationDraft(inputs({ name: "" }));
    expect(draft.disclaimer.length).toBeGreaterThan(0);
    expect(draft.assumptions.length).toBeGreaterThan(0);
  });

  it("passes through arbitrary free-text dates unmodified, without parsing or validating them as real dates", () => {
    const draft = buildBusinessCommencementNotificationDraft(
      inputs({ dateOfBirth: "昭和60年頃", commencementDate: "できるだけ早く（日付未定）" })
    );
    const filer = findSection(draft, "提出者情報");
    const notice = findSection(draft, "届出の区分");
    expect(findField(filer, "生年月日").value).toBe("昭和60年頃");
    expect(findField(notice, "開業・廃業等日").value).toBe("できるだけ早く（日付未定）");
    expect(draft.warnings).toEqual([]);
  });

  // Audit note (提出期限の日付計算): unlike housing-loan/interim-payment style modules that
  // compute concrete calendar due dates from a fixed rule, this module intentionally never
  // derives a specific due date from the user's own commencementDate/submissionDate free text
  // (see the file header comment). This test pins down that design choice across every
  // combination of hasEmployees/fileBlueTaxReturnApplicationSimultaneously.
  it("never fabricates a specific calendar deadline date, for any combination of employee/blue-tax-return choices", () => {
    for (const hasEmployees of [true, false]) {
      for (const fileBlueTaxReturnApplicationSimultaneously of [true, false]) {
        const draft = buildBusinessCommencementNotificationDraft(
          inputs({
            hasEmployees,
            employeeCount: hasEmployees ? 1 : undefined,
            salaryPaymentStartDate: hasEmployees ? "2026年9月1日" : undefined,
            fileBlueTaxReturnApplicationSimultaneously,
          })
        );
        for (const note of draft.notes) {
          // No note may contain a specific full calendar date (e.g. "2026年8月1日"); only
          // general statutory rules (which may mention "3月15日" without a year) are allowed.
          expect(note).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
        }
      }
    }
  });
});
