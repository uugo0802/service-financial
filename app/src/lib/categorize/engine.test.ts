import { describe, expect, it } from "vitest";
import { ruleBasedCategorize, needsEscalation, CONFIDENCE_THRESHOLD } from "./engine";

describe("ruleBasedCategorize", () => {
  it("matches a known expense pattern with confidence 1", () => {
    const result = ruleBasedCategorize({ id: "1", date: "2026-01-05", description: "事務所家賃", amount: -150000 });
    expect(result.account).toBe("地代家賃");
    expect(result.taxCategory).toBe("課税仕入10%");
    expect(result.confidence).toBe(1);
    expect(result.source).toBe("rule");
  });

  it("falls back to the default expense category when nothing matches", () => {
    const result = ruleBasedCategorize({ id: "2", date: "2026-01-05", description: "謎の支出XYZ123", amount: -5000 });
    expect(result.account).toBe("要確認(未分類の経費)");
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("uncategorized");
  });

  it("treats positive amounts as income and matches income rules", () => {
    const result = ruleBasedCategorize({ id: "3", date: "2026-01-05", description: "銀行融資 借入実行", amount: 1000000 });
    expect(result.account).toBe("借入金");
    expect(result.taxCategory).toBe("対象外");
  });

  it("falls back to 売上高 for unmatched income", () => {
    const result = ruleBasedCategorize({ id: "4", date: "2026-01-05", description: "クライアントA社 業務委託料", amount: 300000 });
    expect(result.account).toBe("売上高");
    expect(result.confidence).toBe(0);
  });

  it("flags personal-deduction-only accounts for individual mode handling", () => {
    const result = ruleBasedCategorize({ id: "5", date: "2026-01-05", description: "国民健康保険料", amount: -30000 });
    expect(result.personalDeductionOnly).toBe(true);
  });

  // Regression: loan proceeds and capital contributions are balance-sheet items (増加する負債・純資産), not
  // business revenue. They must be flagged so downstream tax calculators (estimate.ts, corporateEstimate.ts,
  // etc.) can exclude them from taxable income - otherwise drawing down a business loan or injecting capital
  // would be miscounted as taxable sales and inflate the income/corporate tax estimate.
  it("flags loan proceeds as excluded from income", () => {
    const result = ruleBasedCategorize({ id: "13", date: "2026-01-05", description: "銀行融資 借入実行", amount: 3000000 });
    expect(result.account).toBe("借入金");
    expect(result.excludeFromIncome).toBe(true);
  });

  it("flags capital contributions as excluded from income", () => {
    const result = ruleBasedCategorize({ id: "14", date: "2026-01-05", description: "資本金払込み", amount: 1000000 });
    expect(result.account).toBe("元入金");
    expect(result.excludeFromIncome).toBe(true);
  });

  it("does not flag ordinary sales as excluded from income", () => {
    const result = ruleBasedCategorize({ id: "15", date: "2026-01-05", description: "クライアントA社 業務委託料", amount: 300000 });
    expect(result.excludeFromIncome).toBeUndefined();
  });

  // Regression: the bare "ANA"/"JR"/"JAL"/"ETC"/"au" keywords in the travel and
  // telecom rules previously had no word-boundary, so they matched as a plain
  // substring anywhere in the description (case-insensitively, via the /i flag).
  // Common English loanwords/brand names used in real-world Japanese card/bank
  // statements contain these letters (e.g. "Restaurant" contains "au", "Panasonic"
  // and "Kanagawa" contain "ana"), which caused unrelated expenses to be
  // misclassified as 通信費/旅費交通費 instead of falling through to the correct
  // rule (or the default "要確認" bucket).
  it("does not misclassify a restaurant receipt as 通信費 via the bare 'au' substring", () => {
    const result = ruleBasedCategorize({
      id: "6",
      date: "2026-01-05",
      description: "Restaurant領収書 接待",
      amount: -8000,
    });
    expect(result.account).not.toBe("通信費");
    expect(result.account).toBe("接待交際費");
  });

  it("does not misclassify a Panasonic purchase as 旅費交通費 via the bare 'ANA' substring", () => {
    const result = ruleBasedCategorize({
      id: "7",
      date: "2026-01-05",
      description: "Panasonic製品購入",
      amount: -12000,
    });
    expect(result.account).not.toBe("旅費交通費");
  });

  it("does not misclassify a business-trip destination as 旅費交通費 via the bare 'ANA' substring in a place name", () => {
    const result = ruleBasedCategorize({
      id: "8",
      date: "2026-01-05",
      description: "Kanagawa出張 打ち合わせ",
      amount: -3000,
    });
    expect(result.account).not.toBe("旅費交通費");
  });

  // Regression: the previous fix added \b word boundaries around ETC, but "ETC" the highway-toll
  // brand and "etc" the English abbreviation ("et cetera") are the same token at word-boundary
  // granularity. Real Japanese bookkeeping memos routinely end with "...etc." or "...etc" to mean
  // "and so on", which should NOT be classified as 旅費交通費 (a highway toll charge).
  it("does not misclassify a supplies purchase noted with the English abbreviation 'etc.' as 旅費交通費", () => {
    const result = ruleBasedCategorize({
      id: "16",
      date: "2026-01-05",
      description: "文房具・伝票用紙etc.",
      amount: -3000,
    });
    expect(result.account).not.toBe("旅費交通費");
    expect(result.account).toBe("消耗品費");
  });

  // Regression: the 水道光熱費 rule's "ガス(?!ソリン)" pattern matched the bare 2-character
  // substring "ガス" anywhere in the description. "ガスト" (Gusto, a nationwide Japanese
  // family restaurant chain) contains "ガス" as its first two characters, so a dining/
  // entertainment expense at Gusto was silently misclassified as a utility bill
  // (水道光熱費) instead of falling through to the 会議費/接待交際費 rules later in the list.
  it("does not misclassify a Gusto restaurant receipt as 水道光熱費 via the bare 'ガス' substring", () => {
    const result = ruleBasedCategorize({
      id: "17",
      date: "2026-01-05",
      description: "ガスト 渋谷店",
      amount: -3200,
    });
    expect(result.account).not.toBe("水道光熱費");
  });

  it("still matches actual gas utility bills as 水道光熱費", () => {
    expect(
      ruleBasedCategorize({ id: "18", date: "2026-01-05", description: "東京ガス 都市ガス料金", amount: -4500 }).account
    ).toBe("水道光熱費");
    expect(
      ruleBasedCategorize({ id: "19", date: "2026-01-05", description: "プロパンガス代", amount: -6000 }).account
    ).toBe("水道光熱費");
  });

  it("still matches ANA/JR/ETC/au as whole-word brand references", () => {
    expect(ruleBasedCategorize({ id: "9", date: "2026-01-05", description: "ANA航空券購入", amount: -30000 }).account).toBe(
      "旅費交通費"
    );
    expect(ruleBasedCategorize({ id: "10", date: "2026-01-05", description: "JR東日本 定期代", amount: -10000 }).account).toBe(
      "旅費交通費"
    );
    expect(ruleBasedCategorize({ id: "11", date: "2026-01-05", description: "ETC利用料", amount: -2000 }).account).toBe(
      "旅費交通費"
    );
    expect(ruleBasedCategorize({ id: "12", date: "2026-01-05", description: "auひかり利用料", amount: -5000 }).account).toBe(
      "通信費"
    );
  });
});

describe("needsEscalation", () => {
  it("returns true when confidence is below the threshold", () => {
    const tx = ruleBasedCategorize({ id: "6", date: "2026-01-05", description: "未知の取引", amount: -1000 });
    expect(tx.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(needsEscalation(tx)).toBe(true);
  });

  it("returns false when a rule matched with full confidence", () => {
    const tx = ruleBasedCategorize({ id: "7", date: "2026-01-05", description: "AWS利用料", amount: -12000 });
    expect(needsEscalation(tx)).toBe(false);
  });
});
