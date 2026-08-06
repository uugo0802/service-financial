import { describe, expect, it } from "vitest";
import {
  BLUE_RETURN_APPLICATION_DISCLAIMER,
  BlueReturnApplicationInputs,
  buildBlueReturnApplicationDraft,
  isBlueReturnApplicationDraftComplete,
} from "./blueReturnApplicationForm";

function inputs(overrides: Partial<BlueReturnApplicationInputs> = {}): BlueReturnApplicationInputs {
  return {
    taxOfficeName: "麹町税務署",
    taxpayerAddress: "東京都千代田区1-1-1",
    taxpayerName: "山田太郎",
    applicableYear: "令和8年",
    businessLocationDescription: "東京都千代田区1-1-1（自宅事務所）",
    incomeType: "business",
    hasPriorRevocationOrWithdrawal: false,
    bookkeepingMethod: "double",
    maintainedLedgers: ["仕訳帳", "総勘定元帳", "現金出納帳"],
    ...overrides,
  };
}

function findSection(draft: ReturnType<typeof buildBlueReturnApplicationDraft>, title: string) {
  const section = draft.sections.find((s) => s.title === title);
  if (!section) throw new Error(`section not found: ${title}`);
  return section;
}

function findField(section: ReturnType<typeof findSection>, label: string) {
  const field = section.fields.find((f) => f.label === label);
  if (!field) throw new Error(`field not found: ${label}`);
  return field;
}

describe("buildBlueReturnApplicationDraft", () => {
  it("builds a complete draft with no warnings for a fully filled-in normal-startup filer", () => {
    const draft = buildBlueReturnApplicationDraft(
      inputs({ submissionDate: "2026年8月6日", businessStartDate: "2026年3月1日" })
    );

    expect(draft.warnings).toEqual([]);
    expect(isBlueReturnApplicationDraftComplete(draft)).toBe(true);

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出先税務署").value).toBe("麹町税務署");
    expect(findField(submitter, "提出年月日").value).toBe("2026年8月6日");

    const filer = findSection(draft, "納税地・氏名等");
    expect(findField(filer, "納税地").value).toBe("東京都千代田区1-1-1");
    expect(findField(filer, "氏名").value).toBe("山田太郎");

    const applicableYear = findSection(draft, "青色申告の承認を受けようとする年分");
    expect(findField(applicableYear, "年分").value).toBe("令和8年");

    const business = findSection(
      draft,
      "1・2 事業所又は所得の基因となる資産の名称及びその所在地／所得の種類"
    );
    expect(findField(business, "所得の種類").value).toBe("事業所得");

    const startAndSuccession = findSection(draft, "4・5 業務開始年月日／相続による事業承継の有無");
    expect(findField(startAndSuccession, "本年1月16日以後新たに業務を開始した場合の開始年月日").value).toBe(
      "2026年3月1日"
    );
    expect(findField(startAndSuccession, "相続による事業承継の有無").value).toBe("無");
    expect(findField(startAndSuccession, "相続開始年月日").value).toBe("（該当なし）");
    expect(findField(startAndSuccession, "被相続人の氏名").value).toBe("（該当なし）");

    expect(draft.disclaimer).toBe(BLUE_RETURN_APPLICATION_DISCLAIMER);
  });

  it("flags every missing required field", () => {
    const draft = buildBlueReturnApplicationDraft(
      inputs({
        taxOfficeName: "",
        taxpayerAddress: "",
        taxpayerName: "",
        applicableYear: "",
        businessLocationDescription: "",
      })
    );

    expect(draft.warnings).toEqual([
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。",
      "納税地(住所)が入力されていません。",
      "氏名が入力されていません。",
      "青色申告の承認を受けようとする年分が入力されていません。",
      "事業所又は所得の基因となる資産の名称及びその所在地が入力されていません。",
    ]);
    expect(isBlueReturnApplicationDraftComplete(draft)).toBe(false);
  });

  it("treats whitespace-only input as missing", () => {
    const draft = buildBlueReturnApplicationDraft(inputs({ taxpayerName: "   " }));
    expect(draft.warnings).toContain("氏名が入力されていません。");
  });

  it("shows placeholder values instead of empty fields for unfilled optional fields", () => {
    const draft = buildBlueReturnApplicationDraft(inputs());
    const filer = findSection(draft, "納税地・氏名等");
    expect(findField(filer, "生年月日").value).toBe("（未入力）");
    expect(findField(filer, "職業").value).toBe("（未入力）");
    expect(findField(filer, "屋号").value).toBe("（未入力）");

    const submitter = findSection(draft, "提出先");
    expect(findField(submitter, "提出年月日").value).toBe("（未入力）");
    expect(draft.notes.some((n) => n.includes("提出年月日が未入力"))).toBe(true);
  });

  it("always includes a general submission-deadline note without computing a specific deadline date", () => {
    const draft = buildBlueReturnApplicationDraft(inputs());
    const deadlineNote = draft.notes.find((n) => n.includes("3月15日"));
    expect(deadlineNote).toBeDefined();
    // Must not fabricate a specific calendar year deadline.
    expect(deadlineNote).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
  });

  describe("3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無", () => {
    it("records 'no' by default and shows not-applicable for the date", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ hasPriorRevocationOrWithdrawal: false }));
      const section = findSection(
        draft,
        "3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無"
      );
      expect(findField(section, "有無").value).toBe("無");
      expect(findField(section, "取消し又は取りやめの年月日").value).toBe("（該当なし）");
      expect(draft.warnings).toEqual([]);
      expect(draft.notes.some((n) => n.includes("再度の承認"))).toBe(false);
    });

    it("warns when marked 'yes' but the date is missing, and adds an explanatory note", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ hasPriorRevocationOrWithdrawal: true, priorRevocationOrWithdrawalDate: undefined })
      );
      expect(draft.warnings).toContain(
        "過去に青色申告承認の取消し又は取りやめを受けたことが「有」となっていますが、その年月日が入力されていません。"
      );
      expect(draft.notes.some((n) => n.includes("再度の承認"))).toBe(true);
    });

    it("does not warn when marked 'yes' and the date is provided", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ hasPriorRevocationOrWithdrawal: true, priorRevocationOrWithdrawalDate: "令和5年5月1日" })
      );
      const section = findSection(
        draft,
        "3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無"
      );
      expect(findField(section, "取消し又は取りやめの年月日").value).toBe("令和5年5月1日");
      expect(
        draft.warnings.some((w) => w.includes("取消し又は取りやめを受けたことが「有」"))
      ).toBe(false);
    });
  });

  describe("5 相続による事業承継の有無 vs 通常の開業のケース", () => {
    it("defaults to 'no inheritance' when the inheritance input is omitted entirely (normal startup branch)", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ businessStartDate: "2026年4月1日" }));
      const section = findSection(draft, "4・5 業務開始年月日／相続による事業承継の有無");
      expect(findField(section, "相続による事業承継の有無").value).toBe("無");
      expect(findField(section, "相続開始年月日").value).toBe("（該当なし）");
      expect(findField(section, "被相続人の氏名").value).toBe("（該当なし）");
      expect(
        findField(section, "本年1月16日以後新たに業務を開始した場合の開始年月日").value
      ).toBe("2026年4月1日");
      expect(draft.warnings).toEqual([]);
    });

    it("shows the inheritance fields and business-start date can coexist without either being required", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({
          businessStartDate: undefined,
          inheritance: {
            hasInheritance: true,
            inheritanceStartDate: "令和8年2月1日",
            decedentName: "山田一郎",
          },
        })
      );
      const section = findSection(draft, "4・5 業務開始年月日／相続による事業承継の有無");
      expect(findField(section, "本年1月16日以後新たに業務を開始した場合の開始年月日").value).toBe(
        "（未入力）"
      );
      expect(findField(section, "相続による事業承継の有無").value).toBe("有");
      expect(findField(section, "相続開始年月日").value).toBe("令和8年2月1日");
      expect(findField(section, "被相続人の氏名").value).toBe("山田一郎");
      expect(draft.warnings).toEqual([]);
    });

    it("warns when inheritance is 'yes' but the decedent's name is missing", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ inheritance: { hasInheritance: true, inheritanceStartDate: "令和8年2月1日" } })
      );
      expect(draft.warnings).toContain(
        "相続による事業承継が「有」となっていますが、被相続人の氏名が入力されていません。"
      );
    });

    it("warns when inheritance is 'yes' but the inheritance start date is missing", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ inheritance: { hasInheritance: true, decedentName: "山田一郎" } })
      );
      expect(draft.warnings).toContain(
        "相続による事業承継が「有」となっていますが、相続開始年月日が入力されていません。"
      );
    });

    it("flags both missing inheritance fields independently when neither is provided", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ inheritance: { hasInheritance: true } }));
      expect(draft.warnings).toContain(
        "相続による事業承継が「有」となっていますが、被相続人の氏名が入力されていません。"
      );
      expect(draft.warnings).toContain(
        "相続による事業承継が「有」となっていますが、相続開始年月日が入力されていません。"
      );
    });
  });

  describe("6 簿記方式・備付帳簿名", () => {
    it("shows the standard bookkeeping method label for double-entry bookkeeping", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ bookkeepingMethod: "double" }));
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "簿記方式").value).toBe("複式簿記");
    });

    it("shows the standard bookkeeping method label for simplified bookkeeping", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ bookkeepingMethod: "simplified", maintainedLedgers: ["現金出納帳"] })
      );
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "簿記方式").value).toBe("簡易簿記");
    });

    it("uses the free-text bookkeeping method name when 'other' is selected and provided", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ bookkeepingMethod: "other", bookkeepingMethodOther: "現金式簡易帳簿による記帳" })
      );
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "簿記方式").value).toBe("現金式簡易帳簿による記帳");
      expect(draft.warnings).toEqual([]);
    });

    it("warns when 'other' is selected but no free-text method name is provided", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ bookkeepingMethod: "other" }));
      expect(draft.warnings).toContain(
        "簿記方式が「その他」となっていますが、具体的な方式名が入力されていません。"
      );
    });

    it("lists the selected ledgers joined by a Japanese comma, in the order provided", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ maintainedLedgers: ["仕訳帳", "総勘定元帳", "現金出納帳", "経費帳"] })
      );
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "備付帳簿名").value).toBe("仕訳帳、総勘定元帳、現金出納帳、経費帳");
    });

    it("warns when no ledgers are selected and no free-text 'other' ledger is given", () => {
      const draft = buildBlueReturnApplicationDraft(inputs({ maintainedLedgers: [] }));
      expect(draft.warnings).toContain("備付帳簿名が1つも選択されていません。");
    });

    it("does not warn about missing ledgers when only the free-text 'other' ledger is filled in", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ maintainedLedgers: [], otherLedgerName: "顧問先独自の管理表" })
      );
      expect(draft.warnings.some((w) => w.includes("備付帳簿名が1つも選択"))).toBe(false);
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "備付帳簿名").value).toBe("（未入力）");
      expect(findField(section, "備付帳簿名(その他)").value).toBe("顧問先独自の管理表");
    });

    it("shows not-applicable for the free-text 'other' ledger field when it is not used", () => {
      const draft = buildBlueReturnApplicationDraft(inputs());
      const section = findSection(draft, "6 その他参考事項");
      expect(findField(section, "備付帳簿名(その他)").value).toBe("（該当なし）");
    });

    it("adds an advisory note when double-entry bookkeeping is chosen without 仕訳帳/総勘定元帳, without dictating a specific deduction outcome", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ bookkeepingMethod: "double", maintainedLedgers: ["現金出納帳"] })
      );
      const note = draft.notes.find((n) => n.includes("仕訳帳・総勘定元帳"));
      expect(note).toBeDefined();
    });

    it("does not add the 仕訳帳/総勘定元帳 advisory note when both are selected", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ bookkeepingMethod: "double", maintainedLedgers: ["仕訳帳", "総勘定元帳"] })
      );
      expect(draft.notes.some((n) => n.includes("仕訳帳・総勘定元帳"))).toBe(false);
    });

    it("does not add the 仕訳帳/総勘定元帳 advisory note for simplified bookkeeping even without those ledgers", () => {
      const draft = buildBlueReturnApplicationDraft(
        inputs({ bookkeepingMethod: "simplified", maintainedLedgers: ["現金出納帳"] })
      );
      expect(draft.notes.some((n) => n.includes("仕訳帳・総勘定元帳"))).toBe(false);
    });
  });

  it("labels each income type correctly", () => {
    for (const [incomeType, label] of [
      ["business", "事業所得"],
      ["realEstate", "不動産所得"],
      ["forestry", "山林所得"],
    ] as const) {
      const draft = buildBlueReturnApplicationDraft(inputs({ incomeType }));
      const section = findSection(
        draft,
        "1・2 事業所又は所得の基因となる資産の名称及びその所在地／所得の種類"
      );
      expect(findField(section, "所得の種類").value).toBe(label);
    }
  });

  it("always includes the disclaimer and general assumptions regardless of input completeness", () => {
    const draft = buildBlueReturnApplicationDraft(inputs({ taxpayerName: "" }));
    expect(draft.disclaimer.length).toBeGreaterThan(0);
    expect(draft.assumptions.length).toBeGreaterThan(0);
  });

  // Audit note (提出期限の計算): mirroring invoiceRegistrationApplicationForm.ts's design choice,
  // this module never computes/derives a specific submission-deadline calendar date from its own
  // logic (e.g. "3月15日" plus the current or a target year), since the actual deadline depends on
  // per-user circumstances (normal filers vs. new business started after Jan 16) and on rules set by
  // 国税庁 that can change. It only ever states the general rule as fixed text.
  it("never fabricates a specific deadline date for any combination of business-start-date presence", () => {
    for (const businessStartDate of [undefined, "2026年3月1日"]) {
      const draft = buildBlueReturnApplicationDraft(inputs({ businessStartDate }));
      for (const note of draft.notes) {
        expect(note).not.toMatch(/\d{4}年\d{1,2}月15日/);
      }
    }
  });

  it("does not throw and produces warnings for a completely empty-ish input (all optional fields omitted)", () => {
    const draft = buildBlueReturnApplicationDraft(
      inputs({
        submissionDate: undefined,
        dateOfBirth: undefined,
        occupation: undefined,
        tradeName: undefined,
        businessStartDate: undefined,
        inheritance: undefined,
        otherLedgerName: undefined,
      })
    );
    expect(draft.warnings).toEqual([]);
    expect(isBlueReturnApplicationDraftComplete(draft)).toBe(true);
  });
});
