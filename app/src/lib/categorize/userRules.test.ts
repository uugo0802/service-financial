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

  it("rejects a pattern made only of full-width (全角) spaces, same as half-width whitespace", () => {
    const errors = validateUserCategoryRuleDraft({ ...validDraft, pattern: "　　　" });
    expect(errors.pattern).toBeDefined();
  });

  it("accepts a 3-character full-width (全角) Japanese pattern and rejects a 2-character one", () => {
    // MIN_PATTERN_LENGTH is a raw .length check; full-width Japanese characters are single UTF-16
    // code units (unlike astral-plane emoji), so a 2-character keyword like "税理" must still be
    // rejected as too short, and a 3-character one like "税理士" must be accepted.
    const tooShort = validateUserCategoryRuleDraft({ ...validDraft, pattern: "税理" });
    expect(tooShort.pattern).toBeDefined();

    const longEnough = validateUserCategoryRuleDraft({ ...validDraft, pattern: "税理士" });
    expect(longEnough.pattern).toBeUndefined();
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

  it("matches case-insensitively for ASCII keywords", () => {
    const userRule = createUserCategoryRule({ pattern: "ClientCorp", account: "売上高", taxCategory: "課税売上10%" });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("clientcorp からの入金")).toBe(true);
    expect(rule.pattern.test("CLIENTCORP invoice")).toBe(true);
  });

  it("escapes a broad set of regex metacharacters so a keyword like '1+1=2?' is matched literally", () => {
    const userRule = createUserCategoryRule({ pattern: "1+1=2?", account: "雑収入", taxCategory: "課税売上10%" });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("計算式 1+1=2? のメモ")).toBe(true);
    // If unescaped, "+" and "?" would be interpreted as quantifiers and "1=2" alone might match.
    expect(rule.pattern.test("1=2")).toBe(false);
  });

  it("escapes a literal dot so it does not act as a regex wildcard", () => {
    const userRule = createUserCategoryRule({ pattern: "v2.5plan", account: "売上高", taxCategory: "課税売上10%" });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("v2.5plan 契約")).toBe(true);
    // An unescaped "." would also match any single character in place of the literal dot.
    expect(rule.pattern.test("v2X5plan 契約")).toBe(false);
  });

  it("matches a full-width (全角) Japanese keyword literally against a full-width description", () => {
    const userRule = createUserCategoryRule({ pattern: "取引先ＡＢＣ", account: "売上高", taxCategory: "課税売上10%" });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("取引先ＡＢＣからの入金")).toBe(true);
  });

  // Documents current behavior (not a bug fix): the pattern is matched as a literal substring with
  // no full-width/half-width normalization, so a full-width digit keyword will NOT match a
  // half-width digit description and vice versa. If bank CSV descriptions turn out to mix widths in
  // practice, normalizing both sides before matching would need to be a deliberate follow-up change.
  it("does not match across full-width vs half-width digit forms (no NFKC normalization on match)", () => {
    const userRule = createUserCategoryRule({ pattern: "１２３商店", account: "外注費", taxCategory: "課税仕入10%" });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.pattern.test("１２３商店 御中")).toBe(true);
    expect(rule.pattern.test("123商店 御中")).toBe(false);
  });

  // Regression: a tenant-defined keyword routed to an account that is unambiguously
  // personalDeductionOnly/excludeFromIncome in the global dictionary (e.g. "社会保険料(個人)",
  // "借入金", "元入金") must carry that same flag, exactly like aiEscalate.ts re-attaches it for
  // AI-classified rows (see dictionary.ts's isPersonalDeductionOnlyAccount/isExcludeFromIncomeAccount).
  // Without this, a user rule mapping a custom keyword to "社会保険料(個人)" would silently count
  // that spend as a deductible business expense instead of a personal-deduction item, and a user
  // rule mapping to "借入金"/"元入金" would silently count loan/capital inflows as taxable revenue.
  it("re-attaches personalDeductionOnly for a user rule mapped to a personal-deduction-only account", () => {
    const userRule = createUserCategoryRule({
      pattern: "○○共済掛金",
      account: "社会保険料(個人)",
      taxCategory: "非課税",
    });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.personalDeductionOnly).toBe(true);
    expect(rule.excludeFromIncome).toBeUndefined();
  });

  it("re-attaches excludeFromIncome for a user rule mapped to a balance-sheet account (loan proceeds)", () => {
    const userRule = createUserCategoryRule({
      pattern: "○○銀行融資",
      account: "借入金",
      taxCategory: "対象外",
    });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.excludeFromIncome).toBe(true);
    expect(rule.personalDeductionOnly).toBeUndefined();
  });

  it("leaves both flags undefined for a user rule mapped to an ordinary expense/income account", () => {
    const userRule = createUserCategoryRule({
      pattern: "クライアントD社",
      account: "売上高",
      taxCategory: "課税売上10%",
    });
    const rule = userCategoryRuleToCategoryRule(userRule);

    expect(rule.personalDeductionOnly).toBeUndefined();
    expect(rule.excludeFromIncome).toBeUndefined();
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

describe("findMatchingRule", () => {
  it("returns null for an empty rules array regardless of the description", () => {
    expect(findMatchingRule("何か", [])).toBeNull();
  });

  it("returns null when the description is an empty string and no rule matches it", () => {
    expect(findMatchingRule("", sampleGlobalRules)).toBeNull();
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

  it("lets the first-registered user rule win when multiple user rules match the same description", () => {
    // Comment in userRules.ts: "ユーザールール同士は配列内の順序（登録順）で先勝ちとする。"
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({ pattern: "クライアントA社", account: "先勝ちルール", taxCategory: "課税売上10%" }),
      createUserCategoryRule({ pattern: "クライアントA社", account: "後勝ちルール(採用されないはず)", taxCategory: "課税売上10%" }),
    ];

    const merged = mergeCategoryRules(sampleGlobalRules, userRules);
    const matched = findMatchingRule("クライアントA社 業務委託料", merged);

    expect(matched?.account).toBe("先勝ちルール");
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
