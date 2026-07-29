import { describe, expect, it } from "vitest";
import type { CategoryRule } from "./dictionary";
import {
  MIN_PATTERN_LENGTH,
  TAX_CATEGORY_OPTIONS,
  UserCategoryRule,
  UserCategoryRuleDraft,
  createUserCategoryRule,
  findMatchingRule,
  hasUserCategoryRuleErrors,
  mergeCategoryRules,
  userCategoryRuleToCategoryRule,
  validateUserCategoryRuleDraft,
} from "./userRules";

// このテストファイルでは dictionary.ts の EXPENSE_RULES/INCOME_RULES を一切使わず、
// userRules.ts が実際に依存する「グローバル辞書らしき」CategoryRule[] をこのファイル内で
// 独自に定義する。これにより、他のエージェントによる dictionary.ts 本体の変更と無関係に
// このテストが動作し続けることを保証する（本機能はdictionary.tsから型のみを利用する）。
const sampleGlobalRules: CategoryRule[] = [
  { pattern: /家賃|賃貸/, account: "地代家賃", taxCategory: "課税仕入10%" },
  { pattern: /クライアントA社/, account: "売上高", taxCategory: "課税売上10%" },
];

describe("validateUserCategoryRuleDraft", () => {
  const validDraft: UserCategoryRuleDraft = {
    pattern: "クライアントA社",
    account: "売上高",
    taxCategory: "課税売上10%",
  };

  it("accepts a valid draft with no errors", () => {
    const errors = validateUserCategoryRuleDraft(validDraft);
    expect(hasUserCategoryRuleErrors(errors)).toBe(false);
  });

  it("rejects an empty pattern", () => {
    const errors = validateUserCategoryRuleDraft({ ...validDraft, pattern: "" });
    expect(errors.pattern).toBeDefined();
    expect(hasUserCategoryRuleErrors(errors)).toBe(true);
  });

  it("rejects a whitespace-only pattern", () => {
    const errors = validateUserCategoryRuleDraft({ ...validDraft, pattern: "   " });
    expect(errors.pattern).toBeDefined();
  });

  it("rejects patterns shorter than MIN_PATTERN_LENGTH characters (regression guard for the au/ANA/JR-style false positives)", () => {
    // dictionary.ts のコミット ae8d39b で明らかになった通り、"au"/"ANA"/"JR" のような
    // 1〜2文字の非境界キーワードは無関係な文字列に誤マッチしやすい。
    expect(MIN_PATTERN_LENGTH).toBeGreaterThanOrEqual(3);

    for (const shortPattern of ["a", "au", "JR", "ANA".slice(0, 2)]) {
      const errors = validateUserCategoryRuleDraft({ ...validDraft, pattern: shortPattern });
      expect(errors.pattern, `expected "${shortPattern}" to be rejected`).toBeDefined();
    }
  });

  it("accepts a pattern exactly at MIN_PATTERN_LENGTH characters", () => {
    const pattern = "x".repeat(MIN_PATTERN_LENGTH);
    const errors = validateUserCategoryRuleDraft({ ...validDraft, pattern });
    expect(errors.pattern).toBeUndefined();
  });

  it("rejects an empty account", () => {
    const errors = validateUserCategoryRuleDraft({ ...validDraft, account: "  " });
    expect(errors.account).toBeDefined();
  });

  it("rejects a missing tax category", () => {
    const errors = validateUserCategoryRuleDraft({ ...validDraft, taxCategory: "" as never });
    expect(errors.taxCategory).toBeDefined();
  });
});

describe("createUserCategoryRule", () => {
  it("trims fields and assigns an id and createdAt", () => {
    const draft: UserCategoryRuleDraft = {
      pattern: "  クライアントA社  ",
      account: "  売上高  ",
      taxCategory: "課税売上10%",
      note: "  常連クライアント  ",
    };

    const rule = createUserCategoryRule(draft, new Date("2026-07-29T00:00:00Z"));

    expect(rule.pattern).toBe("クライアントA社");
    expect(rule.account).toBe("売上高");
    expect(rule.note).toBe("常連クライアント");
    expect(rule.id).toBeTruthy();
    expect(rule.createdAt).toBe("2026-07-29T00:00:00.000Z");
  });

  it("omits an empty note instead of storing an empty string", () => {
    const rule = createUserCategoryRule({
      pattern: "クライアントB社",
      account: "売上高",
      taxCategory: "課税売上10%",
      note: "   ",
    });
    expect(rule.note).toBeUndefined();
  });

  it("assigns distinct ids across calls", () => {
    const draft: UserCategoryRuleDraft = { pattern: "クライアントC社", account: "売上高", taxCategory: "課税売上10%" };
    const first = createUserCategoryRule(draft);
    const second = createUserCategoryRule(draft);
    expect(first.id).not.toBe(second.id);
  });
});

describe("userCategoryRuleToCategoryRule", () => {
  it("converts the rule to a case-insensitive literal-match CategoryRule", () => {
    const userRule = createUserCategoryRule({
      pattern: "クライアントA社",
      account: "売上高",
      taxCategory: "課税売上10%",
    });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("クライアントA社 業務委託料")).toBe(true);
    expect(rule.pattern.test("無関係な取引")).toBe(false);
  });

  it("escapes regex special characters in the pattern so they are treated literally", () => {
    const userRule = createUserCategoryRule({
      pattern: "A(株)商事",
      account: "売上高",
      taxCategory: "課税売上10%",
    });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("A(株)商事からの入金")).toBe(true);
    // If the parenthesis were not escaped, this would behave as a regex group and could
    // still incidentally match other unrelated strings containing "A" or "商事" alone.
    expect(rule.pattern.test("A商事")).toBe(false);
  });

  it("falls back to an auto-generated note referencing the creation date when none is provided", () => {
    const userRule = createUserCategoryRule(
      { pattern: "クライアントA社", account: "売上高", taxCategory: "課税売上10%" },
      new Date("2026-07-29T00:00:00Z")
    );
    const rule = userCategoryRuleToCategoryRule(userRule);
    expect(rule.note).toContain("2026-07-29");
  });
});

describe("TAX_CATEGORY_OPTIONS", () => {
  it("contains at least one non-empty tax category option", () => {
    expect(TAX_CATEGORY_OPTIONS.length).toBeGreaterThan(0);
    for (const option of TAX_CATEGORY_OPTIONS) {
      expect(option).toBeTruthy();
    }
  });
});

describe("mergeCategoryRules", () => {
  it("falls back to global-only behavior when there are no user rules", () => {
    const merged = mergeCategoryRules(sampleGlobalRules, []);
    expect(merged).toBe(sampleGlobalRules);
  });

  it("gives user rules priority over global rules on conflicting matches", () => {
    // グローバル辞書では "クライアントA社" は売上高にマッチするが、
    // ユーザーがこの取引先を別の勘定科目にしたい場合、ユーザー辞書が優先されるべき。
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({
        pattern: "クライアントA社",
        account: "業務委託売上(特別会計)",
        taxCategory: "課税売上10%",
      }),
    ];

    const merged = mergeCategoryRules(sampleGlobalRules, userRules);
    const matched = findMatchingRule("クライアントA社 業務委託料", merged);

    expect(matched?.account).toBe("業務委託売上(特別会計)");
  });

  it("still falls through to global rules for descriptions the user rules do not match", () => {
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({ pattern: "クライアントA社", account: "特別売上", taxCategory: "課税売上10%" }),
    ];

    const merged = mergeCategoryRules(sampleGlobalRules, userRules);
    const matched = findMatchingRule("事務所家賃の支払い", merged);

    expect(matched?.account).toBe("地代家賃");
  });

  it("returns null when neither user rules nor global rules match", () => {
    const merged = mergeCategoryRules(sampleGlobalRules, []);
    expect(findMatchingRule("謎の支出XYZ123", merged)).toBeNull();
  });

  it("does not mutate the input arrays", () => {
    const globalCopy = [...sampleGlobalRules];
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({ pattern: "クライアントA社", account: "特別売上", taxCategory: "課税売上10%" }),
    ];
    const userCopy = [...userRules];

    mergeCategoryRules(sampleGlobalRules, userRules);

    expect(sampleGlobalRules).toEqual(globalCopy);
    expect(userRules).toEqual(userCopy);
  });
});
