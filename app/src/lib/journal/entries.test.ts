import { describe, expect, it } from "vitest";
import {
  EMPTY_JOURNAL_DRAFT,
  JournalEntryDraft,
  addJournalEntry,
  draftToTransaction,
  hasJournalEntryErrors,
  removeJournalEntry,
  transactionToDraft,
  updateJournalEntry,
  validateJournalEntryDraft,
} from "./entries";

function validDraft(overrides: Partial<JournalEntryDraft> = {}): JournalEntryDraft {
  return {
    date: "2026-01-05",
    description: "事務用品購入",
    amount: "-3000",
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    note: "",
    ...overrides,
  };
}

describe("validateJournalEntryDraft", () => {
  it("returns no errors for a fully valid draft", () => {
    const errors = validateJournalEntryDraft(validDraft());
    expect(hasJournalEntryErrors(errors)).toBe(false);
  });

  it("requires a date", () => {
    const errors = validateJournalEntryDraft(validDraft({ date: "" }));
    expect(errors.date).toBeDefined();
  });

  it("rejects a malformed date", () => {
    const errors = validateJournalEntryDraft(validDraft({ date: "2026/01/05" }));
    expect(errors.date).toBeDefined();
  });

  it("rejects a calendar-invalid date", () => {
    const errors = validateJournalEntryDraft(validDraft({ date: "2026-02-30" }));
    expect(errors.date).toBeDefined();
  });

  it("requires a description", () => {
    const errors = validateJournalEntryDraft(validDraft({ description: "  " }));
    expect(errors.description).toBeDefined();
  });

  it("requires a numeric amount", () => {
    const errors = validateJournalEntryDraft(validDraft({ amount: "abc" }));
    expect(errors.amount).toBeDefined();
  });

  it("rejects a zero amount", () => {
    const errors = validateJournalEntryDraft(validDraft({ amount: "0" }));
    expect(errors.amount).toBeDefined();
  });

  it("accepts positive and decimal amounts", () => {
    expect(hasJournalEntryErrors(validateJournalEntryDraft(validDraft({ amount: "450000" })))).toBe(false);
    expect(hasJournalEntryErrors(validateJournalEntryDraft(validDraft({ amount: "1234.5" })))).toBe(false);
  });

  it("requires an account", () => {
    const errors = validateJournalEntryDraft(validDraft({ account: "" }));
    expect(errors.account).toBeDefined();
  });

  it("flags the empty initial draft as invalid on every required field", () => {
    const errors = validateJournalEntryDraft(EMPTY_JOURNAL_DRAFT);
    expect(errors.date).toBeDefined();
    expect(errors.description).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(errors.account).toBeDefined();
  });
});

describe("draftToTransaction", () => {
  it("converts a draft into a manually-sourced CategorizedTransaction", () => {
    const tx = draftToTransaction(validDraft(), "fixed-id");
    expect(tx).toEqual({
      id: "fixed-id",
      date: "2026-01-05",
      description: "事務用品購入",
      amount: -3000,
      account: "消耗品費",
      taxCategory: "課税仕入10%",
      confidence: 1,
      source: "manual",
      note: undefined,
    });
  });

  it("trims whitespace from text fields and keeps a note when present", () => {
    const tx = draftToTransaction(validDraft({ description: "  家賃  ", account: " 地代家賃 ", note: " 按分50% " }), "id-2");
    expect(tx.description).toBe("家賃");
    expect(tx.account).toBe("地代家賃");
    expect(tx.note).toBe("按分50%");
  });

  it("generates an id when none is supplied", () => {
    const tx = draftToTransaction(validDraft());
    expect(tx.id).toBeTruthy();
  });
});

describe("transactionToDraft", () => {
  it("round-trips a transaction back into an editable draft", () => {
    const tx = draftToTransaction(validDraft({ note: "参考メモ" }), "id-3");
    const draft = transactionToDraft(tx);
    expect(draft).toEqual({
      date: "2026-01-05",
      description: "事務用品購入",
      amount: "-3000",
      account: "消耗品費",
      taxCategory: "課税仕入10%",
      note: "参考メモ",
    });
  });
});

describe("addJournalEntry / updateJournalEntry / removeJournalEntry", () => {
  it("appends a new entry without mutating the original array", () => {
    const original: ReturnType<typeof draftToTransaction>[] = [];
    const result = addJournalEntry(original, validDraft());
    expect(original).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("消耗品費");
  });

  it("updates only the matching entry by id, preserving its id", () => {
    const entries = [draftToTransaction(validDraft(), "id-1"), draftToTransaction(validDraft({ account: "旅費交通費" }), "id-2")];
    const result = updateJournalEntry(entries, "id-2", validDraft({ account: "会議費", amount: "-1500" }));
    expect(result.find((e) => e.id === "id-1")?.account).toBe("消耗品費");
    const updated = result.find((e) => e.id === "id-2");
    expect(updated?.account).toBe("会議費");
    expect(updated?.amount).toBe(-1500);
    expect(updated?.id).toBe("id-2");
  });

  it("removes only the matching entry by id", () => {
    const entries = [draftToTransaction(validDraft(), "id-1"), draftToTransaction(validDraft(), "id-2")];
    const result = removeJournalEntry(entries, "id-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id-2");
  });
});
