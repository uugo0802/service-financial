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
