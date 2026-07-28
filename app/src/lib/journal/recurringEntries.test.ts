import { describe, expect, it } from "vitest";
import {
  EMPTY_RECURRING_TEMPLATE_DRAFT,
  RecurringEntryTemplate,
  RecurringTemplateDraft,
  addRecurringTemplate,
  buildRecurringEntryId,
  draftToRecurringTemplate,
  generateEntryFromTemplate,
  generateRecurringEntriesForMonth,
  hasRecurringTemplateErrors,
  isAlreadyGeneratedForMonth,
  removeRecurringTemplate,
  resolveRecurringEntryDate,
  toggleRecurringTemplateActive,
  validateRecurringTemplateDraft,
} from "./recurringEntries";
import { CategorizedTransaction } from "../categorize/engine";

function validDraft(overrides: Partial<RecurringTemplateDraft> = {}): RecurringTemplateDraft {
  return {
    description: "オフィス家賃",
    amount: "-120000",
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    frequency: "monthly",
    startDate: "2026-01-31",
    endDate: "",
    note: "",
    ...overrides,
  };
}

function template(overrides: Partial<RecurringEntryTemplate> = {}): RecurringEntryTemplate {
  return {
    id: "tmpl-1",
    description: "オフィス家賃",
    amount: -120000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    frequency: "monthly",
    startDate: "2026-01-31",
    active: true,
    ...overrides,
  };
}

describe("validateRecurringTemplateDraft", () => {
  it("returns no errors for a fully valid draft", () => {
    const errors = validateRecurringTemplateDraft(validDraft());
    expect(hasRecurringTemplateErrors(errors)).toBe(false);
  });

  it("flags the empty initial draft as invalid on every required field", () => {
    const errors = validateRecurringTemplateDraft(EMPTY_RECURRING_TEMPLATE_DRAFT);
    expect(errors.description).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(errors.account).toBeDefined();
    expect(errors.startDate).toBeDefined();
  });

  it("requires a description", () => {
    const errors = validateRecurringTemplateDraft(validDraft({ description: "  " }));
    expect(errors.description).toBeDefined();
  });

  it("requires a numeric, non-zero amount", () => {
    expect(validateRecurringTemplateDraft(validDraft({ amount: "abc" })).amount).toBeDefined();
    expect(validateRecurringTemplateDraft(validDraft({ amount: "0" })).amount).toBeDefined();
  });

  it("requires an account", () => {
    const errors = validateRecurringTemplateDraft(validDraft({ account: "" }));
    expect(errors.account).toBeDefined();
  });

  it("rejects a malformed or calendar-invalid start date", () => {
    expect(validateRecurringTemplateDraft(validDraft({ startDate: "2026/01/31" })).startDate).toBeDefined();
    expect(validateRecurringTemplateDraft(validDraft({ startDate: "2026-02-30" })).startDate).toBeDefined();
  });

  it("accepts an empty end date (no expiry)", () => {
    const errors = validateRecurringTemplateDraft(validDraft({ endDate: "" }));
    expect(errors.endDate).toBeUndefined();
  });

  it("rejects a malformed end date", () => {
    const errors = validateRecurringTemplateDraft(validDraft({ endDate: "not-a-date" }));
    expect(errors.endDate).toBeDefined();
  });

  it("rejects an end date earlier than the start date", () => {
    const errors = validateRecurringTemplateDraft(
      validDraft({ startDate: "2026-06-01", endDate: "2026-01-01" })
    );
    expect(errors.endDate).toBeDefined();
  });

  it("accepts an end date equal to the start date", () => {
    const errors = validateRecurringTemplateDraft(
      validDraft({ startDate: "2026-06-01", endDate: "2026-06-01" })
    );
    expect(hasRecurringTemplateErrors(errors)).toBe(false);
  });
});

describe("draftToRecurringTemplate", () => {
  it("converts a draft into an active template", () => {
    const tmpl = draftToRecurringTemplate(validDraft(), "fixed-id");
    expect(tmpl).toEqual({
      id: "fixed-id",
      description: "オフィス家賃",
      amount: -120000,
      account: "地代家賃",
      taxCategory: "課税仕入10%",
      frequency: "monthly",
      startDate: "2026-01-31",
      endDate: undefined,
      note: undefined,
      active: true,
    });
  });

  it("trims whitespace from text fields and keeps a note when present", () => {
    const tmpl = draftToRecurringTemplate(
      validDraft({ description: "  顧問料  ", account: " 支払手数料 ", note: " 税理士事務所A ", endDate: " 2026-12-31 " }),
      "id-2"
    );
    expect(tmpl.description).toBe("顧問料");
    expect(tmpl.account).toBe("支払手数料");
    expect(tmpl.note).toBe("税理士事務所A");
    expect(tmpl.endDate).toBe("2026-12-31");
  });

  it("generates an id when none is supplied", () => {
    const tmpl = draftToRecurringTemplate(validDraft());
    expect(tmpl.id).toBeTruthy();
  });
});

describe("addRecurringTemplate / removeRecurringTemplate / toggleRecurringTemplateActive", () => {
  it("appends a new template without mutating the original array", () => {
    const original: RecurringEntryTemplate[] = [];
    const result = addRecurringTemplate(original, validDraft());
    expect(original).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("オフィス家賃");
  });

  it("removes only the matching template by id", () => {
    const templates = [template({ id: "id-1" }), template({ id: "id-2" })];
    const result = removeRecurringTemplate(templates, "id-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id-2");
  });

  it("toggles active state without affecting other templates", () => {
    const templates = [template({ id: "id-1", active: true }), template({ id: "id-2", active: true })];
    const result = toggleRecurringTemplateActive(templates, "id-1");
    expect(result.find((t) => t.id === "id-1")?.active).toBe(false);
    expect(result.find((t) => t.id === "id-2")?.active).toBe(true);
  });
});

describe("resolveRecurringEntryDate", () => {
  it("resolves the same day-of-month for a monthly template", () => {
    expect(resolveRecurringEntryDate(template({ startDate: "2026-01-05" }), "2026-03")).toBe("2026-03-05");
  });

  it("clamps a month-end anchor day to the last day of a shorter month", () => {
    const monthEndTemplate = template({ startDate: "2026-01-31" });
    // 2026年は平年なので2月は28日まで
    expect(resolveRecurringEntryDate(monthEndTemplate, "2026-02")).toBe("2026-02-28");
    // 4月は30日まで
    expect(resolveRecurringEntryDate(monthEndTemplate, "2026-04")).toBe("2026-04-30");
    // 開始月自体は日数が一致するのでそのまま
    expect(resolveRecurringEntryDate(monthEndTemplate, "2026-01")).toBe("2026-01-31");
  });

  it("clamps to Feb 29 in a leap year for a month-end anchor", () => {
    expect(resolveRecurringEntryDate(template({ startDate: "2024-01-31" }), "2028-02")).toBe("2028-02-29");
  });

  it("returns null for months before the template start month", () => {
    expect(resolveRecurringEntryDate(template({ startDate: "2026-03-01" }), "2026-02")).toBeNull();
  });

  it("only fires in the anniversary month for a yearly template", () => {
    const yearly = template({ frequency: "yearly", startDate: "2026-06-15" });
    expect(resolveRecurringEntryDate(yearly, "2027-06")).toBe("2027-06-15");
    expect(resolveRecurringEntryDate(yearly, "2027-07")).toBeNull();
    expect(resolveRecurringEntryDate(yearly, "2026-06")).toBe("2026-06-15");
  });

  it("clamps a leap-day yearly anniversary in a non-leap year", () => {
    const leapYearly = template({ frequency: "yearly", startDate: "2024-02-29" });
    expect(resolveRecurringEntryDate(leapYearly, "2026-02")).toBe("2026-02-28");
    expect(resolveRecurringEntryDate(leapYearly, "2028-02")).toBe("2028-02-29");
  });

  it("returns null once the resolved date is after the end date", () => {
    const withEnd = template({ startDate: "2026-01-20", endDate: "2026-03-15" });
    expect(resolveRecurringEntryDate(withEnd, "2026-03")).toBeNull(); // 3/20 > 3/15
    expect(resolveRecurringEntryDate(withEnd, "2026-02")).toBe("2026-02-20");
  });

  it("returns null for an invalid year-month or start date", () => {
    expect(resolveRecurringEntryDate(template(), "2026/03")).toBeNull();
    expect(resolveRecurringEntryDate(template({ startDate: "not-a-date" }), "2026-03")).toBeNull();
  });
});

describe("generateEntryFromTemplate", () => {
  it("builds a CategorizedTransaction with confidence=1 and a deterministic id", () => {
    const entry = generateEntryFromTemplate(template(), "2026-02");
    expect(entry).toEqual({
      id: "recurring-tmpl-1-2026-02",
      date: "2026-02-28",
      description: "オフィス家賃",
      amount: -120000,
      account: "地代家賃",
      taxCategory: "課税仕入10%",
      confidence: 1,
      source: "manual",
      note: undefined,
    });
  });

  it("returns null for an inactive template", () => {
    expect(generateEntryFromTemplate(template({ active: false }), "2026-02")).toBeNull();
  });

  it("returns null when out of the template's active date range", () => {
    expect(generateEntryFromTemplate(template({ startDate: "2026-05-01" }), "2026-02")).toBeNull();
  });
});

describe("buildRecurringEntryId / isAlreadyGeneratedForMonth", () => {
  it("builds a stable id from templateId + yearMonth", () => {
    expect(buildRecurringEntryId("tmpl-1", "2026-02")).toBe("recurring-tmpl-1-2026-02");
  });

  it("detects an existing entry generated for the same template and month", () => {
    const existing: CategorizedTransaction[] = [
      { id: "recurring-tmpl-1-2026-02", date: "2026-02-28", description: "x", amount: -1, account: "a", taxCategory: "課税仕入10%", confidence: 1, source: "manual" },
    ];
    expect(isAlreadyGeneratedForMonth(existing, "tmpl-1", "2026-02")).toBe(true);
    expect(isAlreadyGeneratedForMonth(existing, "tmpl-1", "2026-03")).toBe(false);
    expect(isAlreadyGeneratedForMonth(existing, "tmpl-2", "2026-02")).toBe(false);
  });
});

describe("generateRecurringEntriesForMonth", () => {
  it("generates entries for all applicable active templates", () => {
    const templates = [
      template({ id: "rent", description: "オフィス家賃", startDate: "2026-01-31" }),
      template({ id: "saas", description: "会計SaaS利用料", amount: -3000, account: "支払手数料(ソフトウェア利用料)", startDate: "2026-02-01" }),
    ];
    const result = generateRecurringEntriesForMonth(templates, "2026-02", []);
    expect(result.generated).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.generated.map((e) => e.id).sort()).toEqual(
      ["recurring-rent-2026-02", "recurring-saas-2026-02"].sort()
    );
  });

  it("prevents duplicate generation when an entry for the same template+month already exists", () => {
    const templates = [template({ id: "rent", startDate: "2026-01-31" })];
    const existing: CategorizedTransaction[] = [
      generateEntryFromTemplate(template({ id: "rent", startDate: "2026-01-31" }), "2026-02")!,
    ];
    const result = generateRecurringEntriesForMonth(templates, "2026-02", existing);
    expect(result.generated).toHaveLength(0);
    expect(result.skipped).toEqual([{ templateId: "rent", reason: "duplicate" }]);
  });

  it("skips inactive templates", () => {
    const templates = [template({ id: "cancelled-sub", active: false })];
    const result = generateRecurringEntriesForMonth(templates, "2026-02", []);
    expect(result.generated).toHaveLength(0);
    expect(result.skipped).toEqual([{ templateId: "cancelled-sub", reason: "inactive" }]);
  });

  it("skips templates outside their applicable date range", () => {
    const templates = [template({ id: "future", startDate: "2026-06-01" })];
    const result = generateRecurringEntriesForMonth(templates, "2026-02", []);
    expect(result.generated).toHaveLength(0);
    expect(result.skipped).toEqual([{ templateId: "future", reason: "out-of-range" }]);
  });

  it("running generation twice for the same month is idempotent when the caller feeds back generated entries", () => {
    const templates = [template({ id: "rent", startDate: "2026-01-31" })];
    const first = generateRecurringEntriesForMonth(templates, "2026-02", []);
    expect(first.generated).toHaveLength(1);

    const second = generateRecurringEntriesForMonth(templates, "2026-02", first.generated);
    expect(second.generated).toHaveLength(0);
    expect(second.skipped).toEqual([{ templateId: "rent", reason: "duplicate" }]);
  });
});
