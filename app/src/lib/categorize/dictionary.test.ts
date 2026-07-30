import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPENSE,
  DEFAULT_INCOME,
  EXPENSE_RULES,
  INCOME_RULES,
  TAX_CATEGORIES,
  TaxCategory,
} from "./dictionary";

// engine.test.ts / engine.ts exercise the dictionary only indirectly through
// ruleBasedCategorize (which also folds in the income/expense sign of a Transaction).
// This file tests the dictionary's own rule tables and regex patterns directly:
// dictionary.ts exports no separate "matching" function, so `firstMatch` below
// mirrors the same "first rule in array order wins" semantics that both
// engine.ts's matchRules and userRules.ts's findMatchingRule implement, applied
// directly to EXPENSE_RULES/INCOME_RULES without going through ruleBasedCategorize.
function firstMatch(rules: typeof EXPENSE_RULES, description: string) {
  return rules.find((rule) => rule.pattern.test(description)) ?? null;
}

describe("TAX_CATEGORIES", () => {
  it("includes every taxCategory value actually used across the rule tables", () => {
    const used = new Set<TaxCategory>([
      ...EXPENSE_RULES.map((r) => r.taxCategory),
      ...INCOME_RULES.map((r) => r.taxCategory),
      DEFAULT_EXPENSE.taxCategory,
      DEFAULT_INCOME.taxCategory,
    ]);
    for (const category of used) {
      expect(TAX_CATEGORIES, `expected TAX_CATEGORIES to include "${category}"`).toContain(category);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(TAX_CATEGORIES).size).toBe(TAX_CATEGORIES.length);
  });
});

describe("DEFAULT_EXPENSE / DEFAULT_INCOME fallbacks", () => {
  it("match any non-empty description (catch-all patterns)", () => {
    expect(DEFAULT_EXPENSE.pattern.test("何らかの支出")).toBe(true);
    expect(DEFAULT_INCOME.pattern.test("何らかの収入")).toBe(true);
  });

  it("also match an empty string, since /.*/ matches zero-length input", () => {
    expect(DEFAULT_EXPENSE.pattern.test("")).toBe(true);
    expect(DEFAULT_INCOME.pattern.test("")).toBe(true);
  });

  it("carry the expected default account/tax category", () => {
    expect(DEFAULT_EXPENSE.account).toBe("要確認(未分類の経費)");
    expect(DEFAULT_EXPENSE.taxCategory).toBe("要確認");
    expect(DEFAULT_INCOME.account).toBe("売上高");
    expect(DEFAULT_INCOME.taxCategory).toBe("課税売上10%");
  });
});

describe("EXPENSE_RULES — empty/no-match input", () => {
  it("no rule matches an empty description (only the DEFAULT_EXPENSE catch-all does)", () => {
    expect(firstMatch(EXPENSE_RULES, "")).toBeNull();
  });

  it("no rule matches an unrelated, unrecognized description", () => {
    expect(firstMatch(EXPENSE_RULES, "謎の支出XYZ123")).toBeNull();
  });
});

describe("EXPENSE_RULES — direct pattern coverage not already exercised via engine.test.ts", () => {
  it("matches coffee-shop/meeting expenses (会議費)", () => {
    const rule = firstMatch(EXPENSE_RULES, "スターバックス 打ち合わせ");
    expect(rule?.account).toBe("会議費");
  });

  it("matches courier/delivery expenses (荷造運賃)", () => {
    const rule = firstMatch(EXPENSE_RULES, "ヤマト運輸 宅急便");
    expect(rule?.account).toBe("荷造運賃");
  });

  it("matches bank/payment transfer fees (支払手数料)", () => {
    const rule = firstMatch(EXPENSE_RULES, "振込手数料");
    expect(rule?.account).toBe("支払手数料");
  });

  it("matches gasoline purchases (車両費) case-insensitively for the brand name", () => {
    const rule = firstMatch(EXPENSE_RULES, "eneos 給油");
    expect(rule?.account).toBe("車両費");
  });

  it("matches domain/server hosting fees (支払手数料(ソフトウェア利用料))", () => {
    const rule = firstMatch(EXPENSE_RULES, "お名前.com ドメイン更新");
    expect(rule?.account).toBe("支払手数料(ソフトウェア利用料)");
  });

  it("matches job-ad recruiting expenses (広告宣伝費)", () => {
    const rule = firstMatch(EXPENSE_RULES, "Indeed 求人広告掲載料");
    expect(rule?.account).toBe("広告宣伝費");
  });

  it("splits newspaper subscriptions (軽減税率8%) from book purchases (標準税率10%)", () => {
    const newspaper = firstMatch(EXPENSE_RULES, "日本経済新聞 定期購読料");
    const books = firstMatch(EXPENSE_RULES, "Kindleで書籍購入");
    expect(newspaper?.account).toBe("新聞図書費");
    expect(newspaper?.taxCategory).toBe("課税仕入8%(軽減)");
    expect(books?.account).toBe("新聞図書費");
    expect(books?.taxCategory).toBe("課税仕入10%");
  });

  it("flags life insurance premiums as a personal-deduction-only item, not a business expense", () => {
    const rule = firstMatch(EXPENSE_RULES, "生命保険料引き落とし");
    expect(rule?.personalDeductionOnly).toBe(true);
  });

  it("flags condolence money (香典) as out-of-scope for consumption tax (対象外)", () => {
    const rule = firstMatch(EXPENSE_RULES, "取引先へ香典");
    expect(rule?.account).toBe("接待交際費");
    expect(rule?.taxCategory).toBe("対象外");
  });

  it("matches donations (寄付金) as out-of-scope for consumption tax", () => {
    const rule = firstMatch(EXPENSE_RULES, "災害義援金として寄付");
    expect(rule?.account).toBe("寄付金");
    expect(rule?.taxCategory).toBe("対象外");
  });
});

describe("EXPENSE_RULES — negative-lookahead edge cases (rules that deliberately exclude a longer match)", () => {
  it("does not classify a consumption-tax refund as 租税公課 (the pattern excludes '還付' via negative lookahead)", () => {
    const rule = firstMatch(EXPENSE_RULES, "消費税の還付");
    expect(rule).toBeNull();
  });

  it("still classifies an ordinary consumption-tax payment as 租税公課", () => {
    const rule = firstMatch(EXPENSE_RULES, "消費税納付");
    expect(rule?.account).toBe("租税公課");
  });

  it("does not misclassify catered/purchased food products (飲食料品) as 接待交際費 via the bare '飲食' substring", () => {
    const rule = firstMatch(EXPENSE_RULES, "飲食料品の仕入");
    expect(rule).toBeNull();
  });

  it("still classifies ordinary dining/entertainment expenses as 接待交際費", () => {
    const rule = firstMatch(EXPENSE_RULES, "取引先と飲食");
    expect(rule?.account).toBe("接待交際費");
  });
});

describe("EXPENSE_RULES — rule ordering / multiple candidate matches", () => {
  it("prioritizes the company-paid social-insurance rule (法定福利費) over the generic personal one (社会保険料) when both patterns could apply", () => {
    // "社会保険料（会社負担）" matches the first rule's more specific pattern
    // (社会保険料.{0,4}(会社|法人)負担) as well as the much later, more generic
    // "社会保険料" rule. Array order must make the specific/earlier rule win.
    const rule = firstMatch(EXPENSE_RULES, "社会保険料（会社負担分）");
    expect(rule?.account).toBe("法定福利費");
    expect(rule?.taxCategory).toBe("不課税");
  });

  it("falls through to the generic personal social-insurance rule when there is no company-paid wording", () => {
    const rule = firstMatch(EXPENSE_RULES, "社会保険料引き落とし");
    expect(rule?.account).toBe("社会保険料(個人)");
    expect(rule?.personalDeductionOnly).toBe(true);
  });

  it("prioritizes the earlier national-health-insurance rule over the later generic 社会保険料 rule when a description matches both", () => {
    // "国民健康保険 社会保険料通知" contains both "国民健康保険" (the earlier,
    // more specific rule at array index 14) and "社会保険料" (the later, generic
    // rule at index 17). Since matching is first-in-array-wins, the earlier rule's
    // note (about 国民健康保険/国民年金 specifically) must be the one returned.
    const rule = firstMatch(EXPENSE_RULES, "国民健康保険 社会保険料通知");
    expect(rule?.account).toBe("社会保険料(個人)");
    expect(rule?.note).toContain("所得控除");
    expect(rule?.pattern.test("国民健康保険")).toBe(true);
  });
});

describe("EXPENSE_RULES — case/whitespace variants", () => {
  it("matches case-insensitive brand patterns regardless of upper/lower case", () => {
    expect(firstMatch(EXPENSE_RULES, "aws利用料")?.account).toBe("支払手数料(ソフトウェア利用料)");
    expect(firstMatch(EXPENSE_RULES, "AWS利用料")?.account).toBe("支払手数料(ソフトウェア利用料)");
    expect(firstMatch(EXPENSE_RULES, "AwS利用料")?.account).toBe("支払手数料(ソフトウェア利用料)");
  });

  it("matches regardless of surrounding whitespace, since the patterns are unanchored substring matches", () => {
    expect(firstMatch(EXPENSE_RULES, "  AWS利用料  ")?.account).toBe("支払手数料(ソフトウェア利用料)");
    expect(firstMatch(EXPENSE_RULES, "\tAmazon購入\n")?.account).toBe("消耗品費");
  });
});

describe("INCOME_RULES", () => {
  it("returns null (no match) for an empty description", () => {
    expect(firstMatch(INCOME_RULES, "")).toBeNull();
  });

  it("returns null for an unrelated income description (falls through to DEFAULT_INCOME upstream)", () => {
    expect(firstMatch(INCOME_RULES, "クライアントA社 業務委託料")).toBeNull();
  });

  it("matches refunds/cashback as 雑収入, out of scope for consumption tax", () => {
    const rule = firstMatch(INCOME_RULES, "キャッシュバック");
    expect(rule?.account).toBe("雑収入");
    expect(rule?.taxCategory).toBe("対象外");
  });

  it("excludes loan proceeds from income accounting (excludeFromIncome)", () => {
    const rule = firstMatch(INCOME_RULES, "事業融資実行分");
    expect(rule?.account).toBe("借入金");
    expect(rule?.excludeFromIncome).toBe(true);
  });

  it("excludes capital contributions from income accounting (excludeFromIncome)", () => {
    const rule = firstMatch(INCOME_RULES, "出資受入れ");
    expect(rule?.account).toBe("元入金");
    expect(rule?.excludeFromIncome).toBe(true);
  });

  it("matches received interest as non-taxable (非課税), not excluded from income", () => {
    const rule = firstMatch(INCOME_RULES, "受取利息入金");
    expect(rule?.account).toBe("受取利息");
    expect(rule?.taxCategory).toBe("非課税");
    expect(rule?.excludeFromIncome).toBeUndefined();
  });
});
