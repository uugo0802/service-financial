import { describe, expect, it } from "vitest";
import {
  CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  CorporateEstablishmentNotificationDocumentDraft,
  CorporateEstablishmentNotificationInputs,
  buildCorporateBlueReturnApplicationDraft,
  buildCorporateEstablishmentMunicipalNotificationDraft,
  buildCorporateEstablishmentNotificationBundle,
  buildCorporateEstablishmentPrefecturalNotificationDraft,
  buildCorporateEstablishmentTaxOfficeNotificationDraft,
  buildSalaryPayerOfficeNotificationDraft,
  isCorporateEstablishmentNotificationDraftComplete,
} from "./corporateEstablishmentNotificationForm";

function inputs(
  overrides: Partial<CorporateEstablishmentNotificationInputs> = {}
): CorporateEstablishmentNotificationInputs {
  return {
    companyName: "サンプル株式会社",
    companyNameKana: "サンプルカブシキガイシャ",
    headOfficeAddress: "東京都千代田区1-1-1",
    representativeName: "山田太郎",
    representativeAddress: "東京都渋谷区2-2-2",
    establishmentDate: "2026年8月1日",
    fiscalYearStartMonth: 8,
    fiscalYearEndMonth: 7,
    capital: 1_000_000,
    businessPurpose: "ソフトウェアの企画・開発及び販売",
    hasBranches: false,
    willEmployStaff: false,
    blueReturnApplicableFiscalYearLabel: "第1期（2026年8月1日〜2027年7月31日）",
    taxOfficeJurisdiction: "麹町税務署",
    prefecturalTaxOfficeJurisdiction: "都税事務所（千代田都税事務所）",
    municipalOfficeJurisdiction: "千代田区役所",
    ...overrides,
  };
}

function findSection(draft: CorporateEstablishmentNotificationDocumentDraft, title: string) {
  const section = draft.sections.find((s) => s.title === title);
  if (!section) throw new Error(`section not found: ${title}`);
  return section;
}

function findField(section: ReturnType<typeof findSection>, label: string) {
  const field = section.fields.find((f) => f.label === label);
  if (!field) throw new Error(`field not found: ${label}`);
  return field;
}

describe("buildCorporateEstablishmentTaxOfficeNotificationDraft", () => {
  it("builds a complete draft with no warnings for a fully filled-in filer", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs());

    expect(draft.documentTitle).toBe("法人設立届出書");
    expect(draft.destinationKindLabel).toBe("税務署");
    expect(draft.warnings).toEqual([]);
    expect(isCorporateEstablishmentNotificationDraftComplete(draft)).toBe(true);

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先税務署").value).toBe("麹町税務署");

    const company = findSection(draft, "法人の基本情報");
    expect(findField(company, "法人名").value).toBe("サンプル株式会社");
    expect(findField(company, "フリガナ").value).toBe("サンプルカブシキガイシャ");
    expect(findField(company, "本店所在地").value).toBe("東京都千代田区1-1-1");
    expect(findField(company, "代表者氏名").value).toBe("山田太郎");
    expect(findField(company, "代表者住所").value).toBe("東京都渋谷区2-2-2");
    expect(findField(company, "設立年月日").value).toBe("2026年8月1日");

    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "事業年度").value).toBe("8月から翌年7月まで");
    expect(findField(fiscalYear, "資本金の額").value).toBe("1,000,000円");

    const purpose = findSection(draft, "事業目的・支店等の状況");
    expect(findField(purpose, "事業目的の概要").value).toBe("ソフトウェアの企画・開発及び販売");
    expect(findField(purpose, "支店・出張所等の有無").value).toBe("なし");

    expect(draft.disclaimer).toBe(CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER);
  });

  it("shows the corporate-number field as a not-yet-assigned placeholder rather than requiring input", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs());
    const company = findSection(draft, "法人の基本情報");
    expect(findField(company, "法人番号").value).toContain("未指定");
    // Must never be requested/validated as required user input.
    expect(draft.warnings.some((w) => w.includes("法人番号"))).toBe(false);
  });

  it("flags every missing required field", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({
        companyName: "",
        companyNameKana: "",
        headOfficeAddress: "",
        representativeName: "",
        representativeAddress: "",
        establishmentDate: "",
        capital: 0,
        businessPurpose: "",
        taxOfficeJurisdiction: "",
      })
    );

    expect(draft.warnings).toEqual([
      "法人名が入力されていません。",
      "法人名のフリガナが入力されていません。",
      "本店所在地が入力されていません。",
      "代表者氏名が入力されていません。",
      "代表者住所が入力されていません。",
      "設立年月日が入力されていません。",
      "資本金の額は0円より大きい金額を入力してください。",
      "事業目的の概要が入力されていません。",
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、本店所在地を所轄する税務署名をご確認のうえ入力してください。",
    ]);
    expect(isCorporateEstablishmentNotificationDraftComplete(draft)).toBe(false);
  });

  it("treats whitespace-only input as missing", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ companyName: "   " }));
    expect(draft.warnings).toContain("法人名が入力されていません。");
  });

  it("warns when the fiscal year start/end month is out of the 1-12 range", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({ fiscalYearStartMonth: 0, fiscalYearEndMonth: 13 })
    );
    expect(draft.warnings).toContain("事業年度の開始月・終了月は1〜12の範囲で入力してください。");
    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "事業年度").value).toBe("（未入力）");
  });

  it("warns when the fiscal year start/end month is not an integer", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ fiscalYearStartMonth: 4.5 }));
    expect(draft.warnings).toContain("事業年度の開始月・終了月は1〜12の範囲で入力してください。");
  });

  it("does not wrap to 'next year' when the fiscal year does not cross a calendar-year boundary", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({ fiscalYearStartMonth: 4, fiscalYearEndMonth: 12 })
    );
    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "事業年度").value).toBe("4月から12月まで");
  });

  it("wraps to 'next year' when the end month is earlier than the start month", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({ fiscalYearStartMonth: 8, fiscalYearEndMonth: 7 })
    );
    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "事業年度").value).toBe("8月から翌年7月まで");
  });

  it("boundary: accepts month 1 and month 12 as valid", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({ fiscalYearStartMonth: 1, fiscalYearEndMonth: 12 })
    );
    expect(draft.warnings.some((w) => w.includes("事業年度の開始月"))).toBe(false);
    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "事業年度").value).toBe("1月から12月まで");
  });

  it("boundary: warns when capital is exactly 0", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ capital: 0 }));
    expect(draft.warnings).toContain("資本金の額は0円より大きい金額を入力してください。");
  });

  it("boundary: does not warn when capital is 1 yen", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ capital: 1 }));
    expect(draft.warnings.some((w) => w.includes("資本金"))).toBe(false);
  });

  it("warns when capital is negative", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ capital: -1 }));
    expect(draft.warnings).toContain("資本金の額は0円より大きい金額を入力してください。");
  });

  it("formats capital with thousands separators and a yen suffix", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ capital: 5_000_000 }));
    const fiscalYear = findSection(draft, "事業年度・資本金");
    expect(findField(fiscalYear, "資本金の額").value).toBe("5,000,000円");
  });

  it("includes branch details and a related note only when hasBranches is true", () => {
    const withBranches = buildCorporateEstablishmentTaxOfficeNotificationDraft(
      inputs({ hasBranches: true, branchDetails: "大阪府大阪市北区3-3-3" })
    );
    const purpose = findSection(withBranches, "事業目的・支店等の状況");
    expect(findField(purpose, "支店・出張所等の有無").value).toBe("あり");
    expect(findField(purpose, "支店等の所在地等").value).toBe("大阪府大阪市北区3-3-3");
    expect(withBranches.notes.some((n) => n.includes("支店・出張所等がある場合"))).toBe(true);

    const withoutBranches = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ hasBranches: false }));
    const purposeNoBranch = findSection(withoutBranches, "事業目的・支店等の状況");
    expect(purposeNoBranch.fields.some((f) => f.label === "支店等の所在地等")).toBe(false);
    expect(withoutBranches.notes.some((n) => n.includes("支店・出張所等がある場合"))).toBe(false);
  });

  it("shows a placeholder for branch details left empty even though hasBranches is true", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ hasBranches: true }));
    const purpose = findSection(draft, "事業目的・支店等の状況");
    expect(findField(purpose, "支店等の所在地等").value).toBe("（未入力）");
  });

  it("includes a general (non-computed) filing-deadline note without fabricating a specific date", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs());
    const deadlineNote = draft.notes.find((n) => n.includes("2か月以内"));
    expect(deadlineNote).toBeDefined();
    // Must not compute/derive a specific calendar deadline from establishmentDate.
    expect(deadlineNote).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
  });

  it("always includes the disclaimer and general assumptions regardless of input completeness", () => {
    const draft = buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs({ companyName: "" }));
    expect(draft.disclaimer.length).toBeGreaterThan(0);
    expect(draft.assumptions.length).toBeGreaterThan(0);
  });
});

describe("buildCorporateEstablishmentPrefecturalNotificationDraft", () => {
  it("uses the prefectural destination field and label", () => {
    const draft = buildCorporateEstablishmentPrefecturalNotificationDraft(inputs());
    expect(draft.destinationKindLabel).toBe("都道府県税事務所");
    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先都道府県税事務所").value).toBe("都税事務所（千代田都税事務所）");
    expect(draft.warnings).toEqual([]);
  });

  it("warns when the prefectural destination is missing, independently from the national tax office field", () => {
    const draft = buildCorporateEstablishmentPrefecturalNotificationDraft(
      inputs({ prefecturalTaxOfficeJurisdiction: "", taxOfficeJurisdiction: "麹町税務署" })
    );
    expect(draft.warnings).toContain(
      "提出先の都道府県税事務所が入力されていません。本店所在地を管轄する都道府県税事務所名をご自身でご確認のうえ入力してください。"
    );
    expect(draft.warnings.some((w) => w.includes("提出先税務署"))).toBe(false);
  });

  it("mentions the per-capita (均等割) local tax as a general note without computing an amount", () => {
    const draft = buildCorporateEstablishmentPrefecturalNotificationDraft(inputs());
    expect(draft.notes.some((n) => n.includes("均等割"))).toBe(true);
    expect(draft.notes.every((n) => !/\d{1,3}(,\d{3})*円/.test(n))).toBe(true);
  });
});

describe("buildCorporateEstablishmentMunicipalNotificationDraft", () => {
  it("uses the municipal destination field and label", () => {
    const draft = buildCorporateEstablishmentMunicipalNotificationDraft(inputs());
    expect(draft.destinationKindLabel).toBe("市区町村役場");
    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先市区町村役場").value).toBe("千代田区役所");
    expect(draft.warnings).toEqual([]);
  });

  it("warns when the municipal destination is missing", () => {
    const draft = buildCorporateEstablishmentMunicipalNotificationDraft(inputs({ municipalOfficeJurisdiction: "" }));
    expect(draft.warnings).toContain(
      "提出先の市区町村役場が入力されていません。本店所在地を管轄する市区町村役場（東京都特別区の場合は都税事務所）名をご自身でご確認のうえ入力してください。"
    );
  });

  it("notes the Tokyo special-ward exception without silently omitting the document", () => {
    const draft = buildCorporateEstablishmentMunicipalNotificationDraft(inputs());
    expect(draft.notes.some((n) => n.includes("特別区"))).toBe(true);
    // The document must still be produced even for Tokyo-ward filers; the app never
    // auto-determines applicability on the user's behalf.
    expect(draft.documentTitle).toBe("法人設立・設置届出書（市区町村）");
  });
});

describe("buildCorporateBlueReturnApplicationDraft", () => {
  it("builds a complete draft with no warnings when fully filled in", () => {
    const draft = buildCorporateBlueReturnApplicationDraft(inputs());

    expect(draft.documentTitle).toBe("青色申告の承認申請書（法人用）");
    expect(draft.warnings).toEqual([]);

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先税務署").value).toBe("麹町税務署");

    const fiscalYearSection = findSection(draft, "青色申告の承認を受けようとする事業年度");
    expect(findField(fiscalYearSection, "対象事業年度").value).toBe(
      "第1期（2026年8月1日〜2027年7月31日）"
    );
  });

  it("does not include a フリガナ or 代表者住所 field (out of scope for this form)", () => {
    const draft = buildCorporateBlueReturnApplicationDraft(inputs());
    const company = findSection(draft, "法人の基本情報");
    expect(company.fields.some((f) => f.label === "フリガナ")).toBe(false);
    expect(company.fields.some((f) => f.label === "代表者住所")).toBe(false);
  });

  it("flags every missing required field, independently of the establishment-notification drafts", () => {
    const draft = buildCorporateBlueReturnApplicationDraft(
      inputs({
        companyName: "",
        headOfficeAddress: "",
        representativeName: "",
        establishmentDate: "",
        blueReturnApplicableFiscalYearLabel: "",
        taxOfficeJurisdiction: "",
      })
    );
    expect(draft.warnings).toEqual([
      "法人名が入力されていません。",
      "本店所在地が入力されていません。",
      "代表者氏名が入力されていません。",
      "設立年月日が入力されていません。",
      "青色申告の承認を受けようとする事業年度が入力されていません。",
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、本店所在地を所轄する税務署名をご確認のうえ入力してください。",
    ]);
  });

  it("describes the statutory deadline rule in general terms without computing a specific date from establishmentDate", () => {
    const draft = buildCorporateBlueReturnApplicationDraft(inputs({ establishmentDate: "2026年8月1日" }));
    const deadlineNote = draft.notes.find((n) => n.includes("3か月を経過した日"));
    expect(deadlineNote).toBeDefined();
    expect(deadlineNote).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
  });

  it("never fabricates or defaults the target fiscal year label on its own", () => {
    const draft = buildCorporateBlueReturnApplicationDraft(
      inputs({ blueReturnApplicableFiscalYearLabel: "" })
    );
    const fiscalYearSection = findSection(draft, "青色申告の承認を受けようとする事業年度");
    expect(findField(fiscalYearSection, "対象事業年度").value).toBe("（未入力）");
  });
});

describe("buildSalaryPayerOfficeNotificationDraft", () => {
  it("builds a complete draft with no warnings when fully filled in", () => {
    const draft = buildSalaryPayerOfficeNotificationDraft(
      inputs({ willEmployStaff: true, salaryPaymentStartDate: "2026年9月25日" })
    );

    expect(draft.documentTitle).toBe("給与支払事務所等の開設届出書");
    expect(draft.warnings).toEqual([]);

    const office = findSection(draft, "給与支払事務所等の情報");
    expect(findField(office, "給与支払事務所等の所在地").value).toBe("東京都千代田区1-1-1");
    expect(findField(office, "開設年月日").value).toBe("2026年8月1日");

    const startSection = findSection(draft, "給与支払の開始予定");
    expect(findField(startSection, "給与支払開始予定日").value).toBe("2026年9月25日");
  });

  it("warns when salaryPaymentStartDate is missing even though other fields are complete", () => {
    const draft = buildSalaryPayerOfficeNotificationDraft(inputs({ willEmployStaff: true }));
    expect(draft.warnings).toContain("給与支払開始予定日が入力されていません。");
  });

  it("explicitly notes that the representative's own compensation alone still requires the filing", () => {
    const draft = buildSalaryPayerOfficeNotificationDraft(
      inputs({ willEmployStaff: true, salaryPaymentStartDate: "2026年9月25日" })
    );
    expect(draft.notes.some((n) => n.includes("代表者") && n.includes("役員報酬"))).toBe(true);
  });

  it("describes the 1-month statutory deadline in general terms without computing a specific date", () => {
    const draft = buildSalaryPayerOfficeNotificationDraft(
      inputs({ willEmployStaff: true, salaryPaymentStartDate: "2026年9月25日" })
    );
    const deadlineNote = draft.notes.find((n) => n.includes("1か月以内"));
    expect(deadlineNote).toBeDefined();
    expect(deadlineNote).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
  });

  it("can still be built directly even when willEmployStaff is false (gating is the bundle's responsibility)", () => {
    const draft = buildSalaryPayerOfficeNotificationDraft(inputs({ willEmployStaff: false }));
    expect(draft.documentTitle).toBe("給与支払事務所等の開設届出書");
    expect(draft.warnings).toContain("給与支払開始予定日が入力されていません。");
  });
});

describe("buildCorporateEstablishmentNotificationBundle", () => {
  it("includes all three establishment-notification destinations and the blue-return application", () => {
    const bundle = buildCorporateEstablishmentNotificationBundle(inputs());
    expect(bundle.taxOfficeNotification.documentTitle).toBe("法人設立届出書");
    expect(bundle.prefecturalNotification.documentTitle).toBe("法人設立・設置届出書（都道府県）");
    expect(bundle.municipalNotification.documentTitle).toBe("法人設立・設置届出書（市区町村）");
    expect(bundle.blueReturnApplication.documentTitle).toBe("青色申告の承認申請書（法人用）");
  });

  it("omits the salary-payer-office notification when willEmployStaff is false", () => {
    const bundle = buildCorporateEstablishmentNotificationBundle(inputs({ willEmployStaff: false }));
    expect(bundle.salaryPayerOfficeNotification).toBeNull();
  });

  it("includes the salary-payer-office notification when willEmployStaff is true", () => {
    const bundle = buildCorporateEstablishmentNotificationBundle(
      inputs({ willEmployStaff: true, salaryPaymentStartDate: "2026年9月25日" })
    );
    expect(bundle.salaryPayerOfficeNotification).not.toBeNull();
    expect(bundle.salaryPayerOfficeNotification?.documentTitle).toBe("給与支払事務所等の開設届出書");
  });

  it("switches from included to omitted as willEmployStaff toggles, for the same otherwise-identical inputs", () => {
    const employing = buildCorporateEstablishmentNotificationBundle(
      inputs({ willEmployStaff: true, salaryPaymentStartDate: "2026年9月25日" })
    );
    const notEmploying = buildCorporateEstablishmentNotificationBundle(inputs({ willEmployStaff: false }));
    expect(employing.salaryPayerOfficeNotification).not.toBeNull();
    expect(notEmploying.salaryPayerOfficeNotification).toBeNull();
  });
});
