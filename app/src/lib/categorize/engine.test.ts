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

  // Regression: the software-subscription rule's bare "AWS" keyword (no word boundary) matched
  // as a substring of "LAWSON" (L-AWS-ON), the nationwide Japanese convenience store chain, whose
  // name commonly appears in Roman characters on card statements. This silently miscategorized
  // ordinary convenience-store purchases as an AWS software subscription expense (with an
  // inapplicable reverse-charge note) - the same class of unbounded-short-keyword false positive
  // as au/ANA/JR/JAL/ETC.
  it("does not misclassify a LAWSON convenience-store purchase as an AWS software subscription", () => {
    const result = ruleBasedCategorize({ id: "13", date: "2026-01-05", description: "LAWSON 渋谷店", amount: -580 });
    expect(result.account).not.toBe("支払手数料(ソフトウェア利用料)");
  });

  it("still matches a genuine AWS charge as a software subscription", () => {
    const result = ruleBasedCategorize({ id: "14", date: "2026-01-05", description: "AWS利用料", amount: -12000 });
    expect(result.account).toBe("支払手数料(ソフトウェア利用料)");
  });

  // Regression: the utilities rule's "ガス(?!ソリン)" pattern matched the bare 2-character
  // substring "ガス" anywhere in the description. "ガスト" (Gusto, a nationwide family
  // restaurant chain) begins with those same two characters, so a dining expense at Gusto was
  // silently misclassified as a utility bill instead of falling through to 会議費/接待交際費.
  it("does not misclassify a Gusto family-restaurant receipt as a gas utility bill", () => {
    const result = ruleBasedCategorize({ id: "15", date: "2026-01-05", description: "ガスト 渋谷店", amount: -1200 });
    expect(result.account).not.toBe("水道光熱費");
  });

  it("still matches a real gas utility bill", () => {
    const result = ruleBasedCategorize({ id: "16", date: "2026-01-05", description: "東京ガス 引落し", amount: -6000 });
    expect(result.account).toBe("水道光熱費");
  });

  // Regression: the case-insensitive \bETC\b match collided with the common English
  // abbreviation "etc." used in real Japanese bookkeeping memos (e.g. "文房具・伝票用紙etc."),
  // misclassifying ordinary expenses as highway-toll charges. ETC (the toll system) is always
  // written in uppercase in real statement descriptions, so the rule must be case-sensitive.
  it("does not misclassify a memo ending in the English abbreviation 'etc.' as an ETC highway toll", () => {
    const result = ruleBasedCategorize({ id: "17", date: "2026-01-05", description: "文房具・伝票用紙etc.", amount: -3000 });
    expect(result.account).not.toBe("旅費交通費");
  });

  it("still matches an uppercase ETC toll charge", () => {
    const result = ruleBasedCategorize({ id: "18", date: "2026-01-05", description: "ETC利用料", amount: -2000 });
    expect(result.account).toBe("旅費交通費");
  });

  // Regression: 所得税・住民税 (an individual filer's own income/resident tax payments) were
  // mapped to 租税公課 without personalDeductionOnly, so they were counted as a deductible
  // business expense instead of being excluded as the proprietor's personal (家事上の) tax
  // payment - unlike 印紙税/事業の消費税納付, which legitimately are deductible.
  it("flags 所得税/住民税 payments as personalDeductionOnly, not an ordinary deductible expense", () => {
    const incomeTax = ruleBasedCategorize({ id: "19", date: "2026-01-05", description: "所得税及び復興特別所得税 納付", amount: -300000 });
    expect(incomeTax.personalDeductionOnly).toBe(true);

    const residentTax = ruleBasedCategorize({ id: "20", date: "2026-01-05", description: "住民税 第1期", amount: -80000 });
    expect(residentTax.personalDeductionOnly).toBe(true);
  });

  it("does not flag 印紙税/事業の消費税納付 as personalDeductionOnly", () => {
    const result = ruleBasedCategorize({ id: "21", date: "2026-01-05", description: "収入印紙 購入", amount: -2000 });
    expect(result.personalDeductionOnly).toBeUndefined();
  });

  // Regression: 借入金の実行・出資（資本金）の払込みは負債・純資産の増加であり事業の収入では
  // ないため、収入合計・所得金額・免税判定から除外しなければならない（excludeFromIncome）。
  it("flags loan proceeds and capital contributions as excludeFromIncome", () => {
    const loan = ruleBasedCategorize({ id: "22", date: "2026-01-05", description: "銀行融資 借入実行", amount: 1000000 });
    expect(loan.excludeFromIncome).toBe(true);

    const capital = ruleBasedCategorize({ id: "23", date: "2026-01-05", description: "資本金 払込み", amount: 3000000 });
    expect(capital.excludeFromIncome).toBe(true);
  });

  it("does not flag ordinary sales as excludeFromIncome", () => {
    const result = ruleBasedCategorize({ id: "24", date: "2026-01-05", description: "クライアントA社 業務委託料", amount: 300000 });
    expect(result.excludeFromIncome).toBeUndefined();
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
