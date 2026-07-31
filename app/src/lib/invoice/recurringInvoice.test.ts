import { describe, expect, it } from "vitest";
import {
  RecurringInvoiceTemplate,
  addRecurringInvoiceTemplate,
  buildRecurringInvoiceInput,
  buildRecurringInvoiceOccurrenceId,
  computeRecurringInvoiceOccurrences,
  computeRecurringInvoiceOccurrencesForTemplates,
  draftToRecurringInvoiceTemplate,
  hasRecurringInvoiceTemplateErrors,
  removeRecurringInvoiceTemplate,
  toggleRecurringInvoiceTemplateActive,
  validateRecurringInvoiceTemplateDraft,
} from "./recurringInvoice";

function baseTemplate(overrides: Partial<RecurringInvoiceTemplate> = {}): RecurringInvoiceTemplate {
  return {
    id: "tpl-1",
    clientName: "株式会社サンプル",
    description: "顧問料（月額）",
    amount: 50_000,
    taxRate: 10,
    interval: "monthly",
    startDate: "2026-01-15",
    active: true,
    ...overrides,
  };
}

describe("computeRecurringInvoiceOccurrences - monthly cadence", () => {
  it("produces one occurrence per month on the same day-of-month", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate(),
      { start: "2026-01-01", end: "2026-04-30" }
    );

    expect(occurrences.map((o) => o.issueDate)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
    expect(occurrences.map((o) => o.sequenceIndex)).toEqual([0, 1, 2, 3]);
    expect(occurrences.every((o) => o.templateId === "tpl-1")).toBe(true);
  });

  it("rolls over a 31st-of-the-month start date to each month's actual last day", () => {
    // 1/31開始 → 2月(平年)は28日, 3月は31日, 4月は30日, 5月は31日 に丸まる。
    // 月が進むごとに正しい末日/開始日へ戻ることも確認する（2月に丸めた後も3月は31日のまま）。
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-31" }),
      { start: "2026-01-01", end: "2026-05-31" }
    );

    expect(occurrences.map((o) => o.issueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("rolls over to February 29th in a leap year but February 28th in a non-leap year", () => {
    // 2028年はうるう年。1/31開始の2月分は2/29になる。
    const leapYearOccurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2028-01-31" }),
      { start: "2028-02-01", end: "2028-02-29" }
    );
    expect(leapYearOccurrences.map((o) => o.issueDate)).toEqual(["2028-02-29"]);

    // 2026年は平年。同じ1/31開始でも2月分は2/28になる。
    const nonLeapYearOccurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-31" }),
      { start: "2026-02-01", end: "2026-02-28" }
    );
    expect(nonLeapYearOccurrences.map((o) => o.issueDate)).toEqual(["2026-02-28"]);
  });

  it("crosses a year boundary correctly", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-11-30" }),
      { start: "2026-11-01", end: "2027-02-28" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual([
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
      "2027-02-28",
    ]);
  });
});

describe("computeRecurringInvoiceOccurrences - quarterly cadence", () => {
  it("produces one occurrence every 3 months", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ interval: "quarterly", startDate: "2026-01-10" }),
      { start: "2026-01-01", end: "2026-12-31" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual([
      "2026-01-10",
      "2026-04-10",
      "2026-07-10",
      "2026-10-10",
    ]);
    expect(occurrences.map((o) => o.sequenceIndex)).toEqual([0, 1, 2, 3]);
  });

  it("rolls a quarterly 31st-start date over months with fewer days", () => {
    // 1/31開始・四半期ごと → 4月分(30日まで)は4/30, 7月分(31日まで)は7/31, 10月分(31日まで)は10/31,
    // 翌1月分は再び1/31に戻る。
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ interval: "quarterly", startDate: "2026-01-31" }),
      { start: "2026-01-01", end: "2027-01-31" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual([
      "2026-01-31",
      "2026-04-30",
      "2026-07-31",
      "2026-10-31",
      "2027-01-31",
    ]);
  });
});

describe("computeRecurringInvoiceOccurrences - range boundary inclusivity", () => {
  it("includes an occurrence that falls exactly on range.start", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-03-15" }),
      { start: "2026-03-15", end: "2026-03-15" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual(["2026-03-15"]);
  });

  it("includes an occurrence that falls exactly on range.end", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-03-15" }),
      { start: "2026-01-01", end: "2026-03-15" }
    );
    expect(occurrences.some((o) => o.issueDate === "2026-03-15")).toBe(true);
  });

  it("excludes an occurrence one day after range.end", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-03-15" }),
      { start: "2026-01-01", end: "2026-03-14" }
    );
    expect(occurrences).toEqual([]);
  });

  it("excludes an occurrence one day before range.start", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-03-15" }),
      { start: "2026-03-16", end: "2026-04-30" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual(["2026-04-15"]);
  });

  it("returns an empty array when range.start is after range.end", () => {
    const occurrences = computeRecurringInvoiceOccurrences(baseTemplate(), {
      start: "2026-05-01",
      end: "2026-01-01",
    });
    expect(occurrences).toEqual([]);
  });

  it("filters out an occurrence within the same range month whose day is after range.end", () => {
    // range.endの月インデックス自体は含まれていても、日単位で見るとその回の発生日は
    // range.endより後になるケース（末日ロールオーバー由来の日ズレ）を確認する。
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-31" }),
      { start: "2026-01-01", end: "2026-04-15" }
    );
    // 4月分は4/30に丸まるが、range.endは4/15なので含まれない
    expect(occurrences.map((o) => o.issueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("computeRecurringInvoiceOccurrences - endDate cutoff", () => {
  it("stops generating occurrences after the template's endDate", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-15", endDate: "2026-03-20" }),
      { start: "2026-01-01", end: "2026-12-31" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("includes an occurrence that falls exactly on endDate", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-15", endDate: "2026-02-15" }),
      { start: "2026-01-01", end: "2026-12-31" }
    );
    expect(occurrences.map((o) => o.issueDate)).toEqual(["2026-01-15", "2026-02-15"]);
  });

  it("produces no occurrences when endDate is before the range starts", () => {
    const occurrences = computeRecurringInvoiceOccurrences(
      baseTemplate({ startDate: "2026-01-15", endDate: "2026-02-01" }),
      { start: "2026-03-01", end: "2026-12-31" }
    );
    expect(occurrences).toEqual([]);
  });
});

describe("computeRecurringInvoiceOccurrences - other edge cases", () => {
  it("returns an empty array for an inactive template", () => {
    const occurrences = computeRecurringInvoiceOccurrences(baseTemplate({ active: false }), {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(occurrences).toEqual([]);
  });

  it("returns an empty array when the template's startDate is after the range ends", () => {
    const occurrences = computeRecurringInvoiceOccurrences(baseTemplate({ startDate: "2027-01-01" }), {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(occurrences).toEqual([]);
  });

  it("does not throw and returns an empty array for a malformed startDate", () => {
    expect(() =>
      computeRecurringInvoiceOccurrences(baseTemplate({ startDate: "not-a-date" }), {
        start: "2026-01-01",
        end: "2026-12-31",
      })
    ).not.toThrow();
    expect(
      computeRecurringInvoiceOccurrences(baseTemplate({ startDate: "not-a-date" }), {
        start: "2026-01-01",
        end: "2026-12-31",
      })
    ).toEqual([]);
  });

  it("does not throw and returns an empty array for a calendar-invalid startDate (e.g. Feb 30)", () => {
    const occurrences = computeRecurringInvoiceOccurrences(baseTemplate({ startDate: "2026-02-30" }), {
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(occurrences).toEqual([]);
  });

  it("does not throw and returns an empty array for malformed range dates", () => {
    expect(() =>
      computeRecurringInvoiceOccurrences(baseTemplate(), { start: "bad", end: "2026-12-31" })
    ).not.toThrow();
    expect(computeRecurringInvoiceOccurrences(baseTemplate(), { start: "bad", end: "2026-12-31" })).toEqual([]);
  });

  it("handles a single-day range that is not the occurrence day", () => {
    const occurrences = computeRecurringInvoiceOccurrences(baseTemplate(), {
      start: "2026-01-16",
      end: "2026-01-16",
    });
    expect(occurrences).toEqual([]);
  });
});

describe("computeRecurringInvoiceOccurrencesForTemplates", () => {
  it("merges occurrences from multiple templates in ascending issueDate order", () => {
    const templates: RecurringInvoiceTemplate[] = [
      baseTemplate({ id: "tpl-a", clientName: "A社", startDate: "2026-01-20" }),
      baseTemplate({ id: "tpl-b", clientName: "B社", startDate: "2026-01-05" }),
    ];

    const occurrences = computeRecurringInvoiceOccurrencesForTemplates(templates, {
      start: "2026-01-01",
      end: "2026-01-31",
    });

    expect(occurrences.map((o) => `${o.templateId}:${o.issueDate}`)).toEqual([
      "tpl-b:2026-01-05",
      "tpl-a:2026-01-20",
    ]);
  });

  it("excludes inactive templates while still including active ones", () => {
    const templates: RecurringInvoiceTemplate[] = [
      baseTemplate({ id: "tpl-active", startDate: "2026-01-05", active: true }),
      baseTemplate({ id: "tpl-inactive", startDate: "2026-01-10", active: false }),
    ];

    const occurrences = computeRecurringInvoiceOccurrencesForTemplates(templates, {
      start: "2026-01-01",
      end: "2026-01-31",
    });

    expect(occurrences.map((o) => o.templateId)).toEqual(["tpl-active"]);
  });

  it("returns an empty array for an empty template list", () => {
    expect(computeRecurringInvoiceOccurrencesForTemplates([], { start: "2026-01-01", end: "2026-12-31" })).toEqual(
      []
    );
  });
});

describe("buildRecurringInvoiceOccurrenceId", () => {
  it("produces a deterministic id from templateId and issueDate", () => {
    expect(buildRecurringInvoiceOccurrenceId("tpl-1", "2026-03-15")).toBe("recurring-invoice-tpl-1-2026-03-15");
  });

  it("produces different ids for different occurrences of the same template", () => {
    const idA = buildRecurringInvoiceOccurrenceId("tpl-1", "2026-03-15");
    const idB = buildRecurringInvoiceOccurrenceId("tpl-1", "2026-04-15");
    expect(idA).not.toBe(idB);
  });
});

describe("buildRecurringInvoiceInput", () => {
  it("builds a single-line-item ClientInvoiceInput usable by buildClientInvoice", () => {
    const template = baseTemplate({ description: "顧問料（月額）", amount: 80_000, taxRate: 10 });
    const occurrence = { templateId: template.id, sequenceIndex: 0, issueDate: "2026-01-15" };

    const input = buildRecurringInvoiceInput(template, occurrence, {
      issuerName: "山田太郎",
      issuerRegistrationNumber: "T1234567890123",
      invoiceSequence: 7,
    });

    expect(input.invoiceNumber).toBe("INV-20260115-0007");
    expect(input.issuerName).toBe("山田太郎");
    expect(input.issuerRegistrationNumber).toBe("T1234567890123");
    expect(input.issueDate).toBe("2026-01-15");
    expect(input.transactionDate).toBe("2026-01-15");
    expect(input.clientName).toBe(template.clientName);
    expect(input.lineItems).toEqual([
      { description: "顧問料（月額）", quantity: 1, unitPrice: 80_000, taxRate: 10 },
    ]);
  });

  it("defaults issuerRegistrationNumber to null when omitted", () => {
    const template = baseTemplate();
    const occurrence = { templateId: template.id, sequenceIndex: 0, issueDate: "2026-01-15" };
    const input = buildRecurringInvoiceInput(template, occurrence, {
      issuerName: "山田太郎",
      invoiceSequence: 1,
    });
    expect(input.issuerRegistrationNumber).toBeNull();
  });
});

describe("validateRecurringInvoiceTemplateDraft", () => {
  const validDraft = {
    clientName: "株式会社サンプル",
    description: "顧問料（月額）",
    amount: "50000",
    taxRate: 10 as const,
    interval: "monthly" as const,
    startDate: "2026-01-15",
    endDate: "",
    note: "",
  };

  it("returns no errors for a fully valid draft", () => {
    const errors = validateRecurringInvoiceTemplateDraft(validDraft);
    expect(hasRecurringInvoiceTemplateErrors(errors)).toBe(false);
  });

  it("requires clientName, description, amount, and startDate", () => {
    const errors = validateRecurringInvoiceTemplateDraft({
      ...validDraft,
      clientName: "",
      description: "",
      amount: "",
      startDate: "",
    });
    expect(errors.clientName).toBeDefined();
    expect(errors.description).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(errors.startDate).toBeDefined();
  });

  it("rejects a zero or negative amount", () => {
    expect(validateRecurringInvoiceTemplateDraft({ ...validDraft, amount: "0" }).amount).toBeDefined();
    expect(validateRecurringInvoiceTemplateDraft({ ...validDraft, amount: "-1000" }).amount).toBeDefined();
  });

  it("rejects a non-numeric amount", () => {
    expect(validateRecurringInvoiceTemplateDraft({ ...validDraft, amount: "abc" }).amount).toBeDefined();
  });

  it("rejects an endDate before startDate", () => {
    const errors = validateRecurringInvoiceTemplateDraft({
      ...validDraft,
      startDate: "2026-03-01",
      endDate: "2026-01-01",
    });
    expect(errors.endDate).toBeDefined();
  });

  it("accepts an endDate equal to startDate", () => {
    const errors = validateRecurringInvoiceTemplateDraft({
      ...validDraft,
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });
    expect(errors.endDate).toBeUndefined();
  });

  it("rejects a calendar-invalid startDate", () => {
    const errors = validateRecurringInvoiceTemplateDraft({ ...validDraft, startDate: "2026-02-30" });
    expect(errors.startDate).toBeDefined();
  });

  it("rejects a calendar-invalid endDate", () => {
    const errors = validateRecurringInvoiceTemplateDraft({ ...validDraft, endDate: "2026-04-31" });
    expect(errors.endDate).toBeDefined();
  });

  it("accepts a decimal amount", () => {
    const errors = validateRecurringInvoiceTemplateDraft({ ...validDraft, amount: "1234.5" });
    expect(errors.amount).toBeUndefined();
  });

  it("treats a whitespace-only amount as missing rather than non-numeric", () => {
    const errors = validateRecurringInvoiceTemplateDraft({ ...validDraft, amount: "   " });
    expect(errors.amount).toBe("金額を入力してください");
  });

  it("does not flag endDate when startDate itself is invalid (avoids a confusing double error on the same typo)", () => {
    const errors = validateRecurringInvoiceTemplateDraft({
      ...validDraft,
      startDate: "not-a-date",
      endDate: "2026-01-01",
    });
    expect(errors.startDate).toBeDefined();
    expect(errors.endDate).toBeUndefined();
  });
});

describe("draftToRecurringInvoiceTemplate", () => {
  const draft = {
    clientName: "  株式会社サンプル  ",
    description: "  顧問料（月額）  ",
    amount: "  50000  ",
    taxRate: 10 as const,
    interval: "monthly" as const,
    startDate: "  2026-01-15  ",
    endDate: "  2026-12-31  ",
    note: "  年契約  ",
  };

  it("trims all string fields and converts amount to a number", () => {
    const template = draftToRecurringInvoiceTemplate(draft, "tpl-fixed");
    expect(template).toEqual({
      id: "tpl-fixed",
      clientName: "株式会社サンプル",
      description: "顧問料（月額）",
      amount: 50_000,
      taxRate: 10,
      interval: "monthly",
      startDate: "2026-01-15",
      endDate: "2026-12-31",
      note: "年契約",
      active: true,
    });
  });

  it("defaults endDate and note to undefined when blank", () => {
    const template = draftToRecurringInvoiceTemplate(
      { ...draft, endDate: "   ", note: "" },
      "tpl-fixed"
    );
    expect(template.endDate).toBeUndefined();
    expect(template.note).toBeUndefined();
  });

  it("always creates the template as active regardless of any prior state", () => {
    const template = draftToRecurringInvoiceTemplate(draft, "tpl-fixed");
    expect(template.active).toBe(true);
  });

  it("generates an id when none is provided", () => {
    const a = draftToRecurringInvoiceTemplate(draft);
    const b = draftToRecurringInvoiceTemplate(draft);
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});

describe("addRecurringInvoiceTemplate", () => {
  it("appends a new template built from the draft without mutating the input array", () => {
    const existing: RecurringInvoiceTemplate[] = [baseTemplate({ id: "tpl-existing" })];
    const draft = {
      clientName: "新規クライアント",
      description: "顧問料",
      amount: "30000",
      taxRate: 10 as const,
      interval: "monthly" as const,
      startDate: "2026-08-01",
      endDate: "",
      note: "",
    };

    const result = addRecurringInvoiceTemplate(existing, draft);

    expect(result).toHaveLength(2);
    expect(existing).toHaveLength(1); // original array untouched
    expect(result[0].id).toBe("tpl-existing");
    expect(result[1].clientName).toBe("新規クライアント");
    expect(result[1].active).toBe(true);
  });

  it("adds to an empty template list", () => {
    const draft = {
      clientName: "初めてのクライアント",
      description: "顧問料",
      amount: "10000",
      taxRate: 8 as const,
      interval: "quarterly" as const,
      startDate: "2026-01-01",
      endDate: "",
      note: "",
    };
    const result = addRecurringInvoiceTemplate([], draft);
    expect(result).toHaveLength(1);
    expect(result[0].taxRate).toBe(8);
  });
});

describe("removeRecurringInvoiceTemplate", () => {
  it("removes only the matching template by id", () => {
    const templates: RecurringInvoiceTemplate[] = [
      baseTemplate({ id: "tpl-1" }),
      baseTemplate({ id: "tpl-2" }),
    ];
    const result = removeRecurringInvoiceTemplate(templates, "tpl-1");
    expect(result.map((t) => t.id)).toEqual(["tpl-2"]);
    expect(templates).toHaveLength(2); // original array untouched
  });

  it("returns an equivalent list unchanged when the id is not found", () => {
    const templates: RecurringInvoiceTemplate[] = [baseTemplate({ id: "tpl-1" })];
    const result = removeRecurringInvoiceTemplate(templates, "does-not-exist");
    expect(result).toEqual(templates);
  });

  it("returns an empty array when removing from an empty list", () => {
    expect(removeRecurringInvoiceTemplate([], "tpl-1")).toEqual([]);
  });
});

describe("toggleRecurringInvoiceTemplateActive", () => {
  it("flips active from true to false for the targeted template only", () => {
    const templates: RecurringInvoiceTemplate[] = [
      baseTemplate({ id: "tpl-1", active: true }),
      baseTemplate({ id: "tpl-2", active: true }),
    ];
    const result = toggleRecurringInvoiceTemplateActive(templates, "tpl-1");
    expect(result.find((t) => t.id === "tpl-1")?.active).toBe(false);
    expect(result.find((t) => t.id === "tpl-2")?.active).toBe(true);
  });

  it("flips active from false back to true (re-activating a paused template)", () => {
    const templates: RecurringInvoiceTemplate[] = [baseTemplate({ id: "tpl-1", active: false })];
    const result = toggleRecurringInvoiceTemplateActive(templates, "tpl-1");
    expect(result[0].active).toBe(true);
  });

  it("does not mutate the input array", () => {
    const templates: RecurringInvoiceTemplate[] = [baseTemplate({ id: "tpl-1", active: true })];
    const snapshot = JSON.parse(JSON.stringify(templates));
    toggleRecurringInvoiceTemplateActive(templates, "tpl-1");
    expect(templates).toEqual(snapshot);
  });

  it("is a no-op for an id not present in the list", () => {
    const templates: RecurringInvoiceTemplate[] = [baseTemplate({ id: "tpl-1", active: true })];
    const result = toggleRecurringInvoiceTemplateActive(templates, "does-not-exist");
    expect(result).toEqual(templates);
  });
});
