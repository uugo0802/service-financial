import { describe, expect, it } from "vitest";
import type { Transaction } from "../categorize/engine";
import {
  DEFAULT_MATCH_TOLERANCE,
  EMPTY_RECURRING_TEMPLATE_DRAFT,
  MIN_PATTERN_LENGTH,
  RecurringTransactionTemplate,
  RecurringTransactionTemplateDraft,
  computeExpectedRecurringTransactions,
  createRecurringTransactionTemplate,
  findMatchingTemplate,
  getMissingRecurringTransactions,
  hasRecurringTransactionTemplateErrors,
  matchTransactionToTemplate,
  registerRecurringTemplate,
  removeRecurringTemplate,
  resolveExpectedDate,
  suggestRecurringTemplateMatches,
  toggleRecurringTemplateActive,
  validateRecurringTransactionTemplateDraft,
} from "./recurringTemplates";

const validDraft: RecurringTransactionTemplateDraft = {
  pattern: "オフィス家賃",
  account: "地代家賃",
  taxCategory: "課税仕入10%",
  amount: "-150000",
  dayOfMonth: "27",
  note: "〇〇不動産への振込",
};

function makeTemplate(overrides: Partial<RecurringTransactionTemplateDraft> = {}): RecurringTransactionTemplate {
  return createRecurringTransactionTemplate(
    { ...validDraft, ...overrides },
    new Date("2026-06-01T00:00:00Z")
  );
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    date: "2026-07-27",
    description: "オフィス家賃 7月分",
    amount: -150000,
    ...overrides,
  };
}

describe("validateRecurringTransactionTemplateDraft", () => {
  it("accepts a valid draft with no errors", () => {
    const errors = validateRecurringTransactionTemplateDraft(validDraft);
    expect(hasRecurringTransactionTemplateErrors(errors)).toBe(false);
  });

  it("rejects an empty pattern", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, pattern: "" });
    expect(errors.pattern).toBeDefined();
  });

  it("rejects patterns shorter than MIN_PATTERN_LENGTH", () => {
    expect(MIN_PATTERN_LENGTH).toBeGreaterThanOrEqual(3);
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, pattern: "au" });
    expect(errors.pattern).toBeDefined();
  });

  it("rejects an empty account", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, account: "   " });
    expect(errors.account).toBeDefined();
  });

  it("rejects a missing tax category", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, taxCategory: "" as never });
    expect(errors.taxCategory).toBeDefined();
  });

  it("rejects an empty amount", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, amount: "" });
    expect(errors.amount).toBeDefined();
  });

  it("rejects a non-numeric amount", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, amount: "abc" });
    expect(errors.amount).toBeDefined();
  });

  it("rejects a zero amount", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, amount: "0" });
    expect(errors.amount).toBeDefined();
  });

  it("accepts a positive amount for income-style templates", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, amount: "220000" });
    expect(errors.amount).toBeUndefined();
  });

  it("rejects a missing day of month", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "" });
    expect(errors.dayOfMonth).toBeDefined();
  });

  it("rejects a day of month outside 1-31", () => {
    expect(validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "0" }).dayOfMonth).toBeDefined();
    expect(validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "32" }).dayOfMonth).toBeDefined();
  });

  it("rejects a non-integer day of month", () => {
    const errors = validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "27.5" });
    expect(errors.dayOfMonth).toBeDefined();
  });

  it("accepts a day of month at the boundaries", () => {
    expect(validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "1" }).dayOfMonth).toBeUndefined();
    expect(validateRecurringTransactionTemplateDraft({ ...validDraft, dayOfMonth: "31" }).dayOfMonth).toBeUndefined();
  });
});

describe("createRecurringTransactionTemplate", () => {
  it("parses numeric fields, trims strings, and assigns id/createdAt/active", () => {
    const template = makeTemplate();
    expect(template.pattern).toBe("オフィス家賃");
    expect(template.amount).toBe(-150000);
    expect(template.dayOfMonth).toBe(27);
    expect(template.note).toBe("〇〇不動産への振込");
    expect(template.id).toBeTruthy();
    expect(template.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(template.active).toBe(true);
  });

  it("omits an empty note instead of storing an empty string", () => {
    const template = createRecurringTransactionTemplate({ ...validDraft, note: "   " });
    expect(template.note).toBeUndefined();
  });

  it("assigns distinct ids across calls", () => {
    const first = createRecurringTransactionTemplate(validDraft);
    const second = createRecurringTransactionTemplate(validDraft);
    expect(first.id).not.toBe(second.id);
  });
});

describe("registerRecurringTemplate / removeRecurringTemplate / toggleRecurringTemplateActive", () => {
  it("registers a new template onto an existing list without mutating the input", () => {
    const existing = [makeTemplate({ pattern: "サブスクA" })];
    const existingCopy = [...existing];

    const next = registerRecurringTemplate(existing, validDraft, new Date("2026-07-01T00:00:00Z"));

    expect(next).toHaveLength(2);
    expect(existing).toEqual(existingCopy);
    expect(next[1].pattern).toBe("オフィス家賃");
  });

  it("removes a template by id", () => {
    const a = makeTemplate({ pattern: "サブスクA" });
    const b = makeTemplate({ pattern: "サブスクB" });
    const next = removeRecurringTemplate([a, b], a.id);
    expect(next).toEqual([b]);
  });

  it("toggles active state without affecting other templates", () => {
    const a = makeTemplate({ pattern: "サブスクA" });
    const b = makeTemplate({ pattern: "サブスクB" });
    const next = toggleRecurringTemplateActive([a, b], a.id);
    expect(next.find((t) => t.id === a.id)?.active).toBe(false);
    expect(next.find((t) => t.id === b.id)?.active).toBe(true);
  });
});

describe("matchTransactionToTemplate", () => {
  it("matches an exact transaction (same description, amount, and day)", () => {
    const template = makeTemplate();
    const result = matchTransactionToTemplate(makeTransaction(), template);
    expect(result).not.toBeNull();
    expect(result?.amountDeltaRatio).toBe(0);
    expect(result?.dayOfMonthDelta).toBe(0);
  });

  it("matches when the amount drifts within the tolerance ratio", () => {
    // 想定150,000円に対し実際は153,000円 → 乖離率2%（デフォルト許容10%以内）
    const template = makeTemplate();
    const tx = makeTransaction({ amount: -153000 });
    const result = matchTransactionToTemplate(tx, template);
    expect(result).not.toBeNull();
    expect(result?.amountDeltaRatio).toBeCloseTo(0.02, 5);
  });

  it("does not match when the amount drifts outside the tolerance ratio", () => {
    // 想定150,000円に対し実際は200,000円 → 乖離率33%（デフォルト許容10%を超過）
    const template = makeTemplate();
    const tx = makeTransaction({ amount: -200000 });
    const result = matchTransactionToTemplate(tx, template);
    expect(result).toBeNull();
  });

  it("does not match when the day of month drifts outside the tolerance", () => {
    // 想定発生日27日に対し、5日ずれた月初(1日)の取引はデフォルト許容(3日)を超える
    const template = makeTemplate();
    const tx = makeTransaction({ date: "2026-08-01" });
    const result = matchTransactionToTemplate(tx, template);
    expect(result).toBeNull();
  });

  it("matches when the day of month drifts within the tolerance", () => {
    const template = makeTemplate();
    const tx = makeTransaction({ date: "2026-07-29" }); // 27日想定 → 2日ずれ
    const result = matchTransactionToTemplate(tx, template);
    expect(result).not.toBeNull();
    expect(result?.dayOfMonthDelta).toBe(2);
  });

  it("does not match when the description does not contain the pattern", () => {
    const template = makeTemplate();
    const tx = makeTransaction({ description: "無関係な取引" });
    expect(matchTransactionToTemplate(tx, template)).toBeNull();
  });

  it("does not match when income/expense sign differs even if the description matches", () => {
    const template = makeTemplate(); // 支出(-150000)想定
    const tx = makeTransaction({ amount: 150000 }); // 収入として記帳された場合
    expect(matchTransactionToTemplate(tx, template)).toBeNull();
  });

  it("does not match an inactive template", () => {
    const template = { ...makeTemplate(), active: false };
    expect(matchTransactionToTemplate(makeTransaction(), template)).toBeNull();
  });

  it("matches case-insensitively for ASCII patterns", () => {
    const template = makeTemplate({ pattern: "CloudSaaS" });
    const tx = makeTransaction({ description: "cloudsaas 月額利用料" });
    expect(matchTransactionToTemplate(tx, template)).not.toBeNull();
  });

  it("respects a custom tolerance configuration", () => {
    const template = makeTemplate();
    const tx = makeTransaction({ amount: -200000 }); // 33%乖離
    const looseTolerance = { amountToleranceRatio: 0.5, dayOfMonthTolerance: 3 };
    expect(matchTransactionToTemplate(tx, template, looseTolerance)).not.toBeNull();
  });
});

describe("findMatchingTemplate / suggestRecurringTemplateMatches", () => {
  it("returns the first matching template when multiple templates could match", () => {
    const rent = makeTemplate({ pattern: "オフィス家賃" });
    const alsoRent = makeTemplate({ pattern: "オフィス家賃", account: "後勝ち(採用されないはず)" });
    const match = findMatchingTemplate(makeTransaction(), [rent, alsoRent]);
    expect(match?.template.account).toBe("地代家賃");
  });

  it("returns null when no template matches", () => {
    const template = makeTemplate();
    expect(findMatchingTemplate(makeTransaction({ description: "謎の支出" }), [template])).toBeNull();
  });

  it("suggests matches only for transactions that match some template", () => {
    const template = makeTemplate();
    const matching = makeTransaction();
    const nonMatching = makeTransaction({ id: "tx-2", description: "謎の支出" });

    const suggestions = suggestRecurringTemplateMatches([matching, nonMatching], [template]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].transaction.id).toBe("tx-1");
    expect(suggestions[0].template.id).toBe(template.id);
  });

  it("returns an empty array when there are no templates", () => {
    expect(suggestRecurringTemplateMatches([makeTransaction()], [])).toEqual([]);
  });
});

describe("resolveExpectedDate", () => {
  it("resolves the expected date using the template's day of month", () => {
    const template = makeTemplate({ dayOfMonth: "27" });
    expect(resolveExpectedDate(template, "2026-07")).toBe("2026-07-27");
  });

  it("clamps a day of month beyond the target month's length to the last day", () => {
    const template = makeTemplate({ dayOfMonth: "31" });
    expect(resolveExpectedDate(template, "2026-02")).toBe("2026-02-28"); // 2026年は平年
    expect(resolveExpectedDate(template, "2028-02")).toBe("2028-02-29"); // 2028年はうるう年
    expect(resolveExpectedDate(template, "2026-04")).toBe("2026-04-30");
  });

  it("returns null for a malformed year-month", () => {
    const template = makeTemplate();
    expect(resolveExpectedDate(template, "2026/07")).toBeNull();
  });
});

describe("computeExpectedRecurringTransactions", () => {
  it("marks a template as recorded when a matching transaction exists in the target month", () => {
    const template = makeTemplate();
    const recorded = [makeTransaction({ date: "2026-07-27" })];

    const [result] = computeExpectedRecurringTransactions([template], recorded, "2026-07", "2026-07-31");

    expect(result.status).toBe("recorded");
    expect(result.matchedTransaction?.id).toBe("tx-1");
  });

  it("marks a template with no matches yet as missing once the expected date has passed", () => {
    const template = makeTemplate(); // 期待発生日: 2026-07-27
    const [result] = computeExpectedRecurringTransactions([template], [], "2026-07", "2026-07-31");

    expect(result.status).toBe("missing");
    expect(result.matchedTransaction).toBeUndefined();
  });

  it("marks a template with no matches yet as upcoming when the expected date has not passed", () => {
    const template = makeTemplate(); // 期待発生日: 2026-07-27
    const [result] = computeExpectedRecurringTransactions([template], [], "2026-07", "2026-07-10");

    expect(result.status).toBe("upcoming");
  });

  it("does not consider a matching transaction from a different month as recorded", () => {
    const template = makeTemplate();
    const recordedLastMonth = [makeTransaction({ id: "tx-prev", date: "2026-06-27" })];

    const [result] = computeExpectedRecurringTransactions([template], recordedLastMonth, "2026-07", "2026-07-31");

    expect(result.status).toBe("missing");
  });

  it("excludes inactive templates from the expected list", () => {
    const template = { ...makeTemplate(), active: false };
    const results = computeExpectedRecurringTransactions([template], [], "2026-07", "2026-07-31");
    expect(results).toHaveLength(0);
  });

  it("uses the default tolerance so a matching transaction is still recorded despite small drift", () => {
    const template = makeTemplate();
    const recorded = [makeTransaction({ date: "2026-07-28", amount: -151000 })];

    const [result] = computeExpectedRecurringTransactions([template], recorded, "2026-07", "2026-07-31");

    expect(result.status).toBe("recorded");
  });

  it("uses a custom tolerance when provided", () => {
    const template = makeTemplate();
    const recorded = [makeTransaction({ amount: -170000 })]; // 13%乖離、デフォルト許容(10%)は超えるがカスタムでは許容
    const looseTolerance = { amountToleranceRatio: 0.2, dayOfMonthTolerance: 3 };

    const [result] = computeExpectedRecurringTransactions(
      [template],
      recorded,
      "2026-07",
      "2026-07-31",
      looseTolerance
    );

    expect(result.status).toBe("recorded");
  });
});

describe("getMissingRecurringTransactions", () => {
  it("returns only templates whose expected occurrence is missing", () => {
    const rentTemplate = makeTemplate({ pattern: "オフィス家賃" }); // 期待発生日: 2026-07-27
    const subscriptionTemplate = makeTemplate({
      pattern: "SaaSツール",
      amount: "-3000",
      dayOfMonth: "5",
    });

    const recorded = [
      makeTransaction({ id: "tx-subscription", description: "SaaSツール利用料", amount: -3000, date: "2026-07-05" }),
    ];

    const missing = getMissingRecurringTransactions(
      [rentTemplate, subscriptionTemplate],
      recorded,
      "2026-07",
      "2026-07-31"
    );

    expect(missing).toHaveLength(1);
    expect(missing[0].template.pattern).toBe("オフィス家賃");
  });

  it("returns an empty array when every template for the month has already been recorded", () => {
    const template = makeTemplate();
    const recorded = [makeTransaction({ date: "2026-07-27" })];

    const missing = getMissingRecurringTransactions([template], recorded, "2026-07", "2026-07-31");

    expect(missing).toEqual([]);
  });

  it("returns an empty array when no templates are registered", () => {
    expect(getMissingRecurringTransactions([], [], "2026-07", "2026-07-31")).toEqual([]);
  });
});

describe("EMPTY_RECURRING_TEMPLATE_DRAFT and DEFAULT_MATCH_TOLERANCE", () => {
  it("is a valid starting point that fails validation only due to required empty fields", () => {
    const errors = validateRecurringTransactionTemplateDraft(EMPTY_RECURRING_TEMPLATE_DRAFT);
    expect(hasRecurringTransactionTemplateErrors(errors)).toBe(true);
    expect(errors.pattern).toBeDefined();
    expect(errors.account).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(errors.dayOfMonth).toBeDefined();
  });

  it("exposes positive tolerance defaults", () => {
    expect(DEFAULT_MATCH_TOLERANCE.amountToleranceRatio).toBeGreaterThan(0);
    expect(DEFAULT_MATCH_TOLERANCE.dayOfMonthTolerance).toBeGreaterThan(0);
  });
});
