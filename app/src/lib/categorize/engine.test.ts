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

  it("does not auto-confirm a matched rule whose tax category is itself 要確認 (needs review)", () => {
    // 諸会費/商工会議所等は勘定科目は特定できても、課税仕入か不課税かはルールだけでは
    // 判定できないため、taxCategory: "要確認" のルールが用意されている。
    // このとき「ルールに一致した」ことをもって confidence=1 で自動確定してしまうと、
    // 税区分が未確定のまま人間レビュー・AIエスカレーションの対象から漏れてしまう。
    const result = ruleBasedCategorize({ id: "6", date: "2026-01-05", description: "商工会議所 年会費", amount: -12000 });
    expect(result.account).toBe("諸会費");
    expect(result.taxCategory).toBe("要確認");
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("uncategorized");
    expect(needsEscalation(result)).toBe(true);
  });

  it("routes 外注費 (subcontracting) to 要確認 instead of silently tagging it as 不課税 like salary", () => {
    // 外注費は給与と異なり、多くの場合は課税仕入（インボイス登録の有無で控除税額が変わる）。
    // 給与と同じ不課税で自動確定すると、本来控除できるはずの仕入税額控除が消費税試算から
    // 漏れ落ち、消費税の払い過ぎにつながる。
    const result = ruleBasedCategorize({ id: "7", date: "2026-01-05", description: "A社 外注費 12月分", amount: -300000 });
    expect(result.account).toBe("給料賃金/外注工賃");
    expect(result.taxCategory).toBe("要確認");
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("uncategorized");
  });

  it("still auto-confirms plain salary payments as 不課税 (unaffected by the 外注費 split)", () => {
    const result = ruleBasedCategorize({ id: "8", date: "2026-01-05", description: "給与振込 田中太郎", amount: -250000 });
    expect(result.account).toBe("給料賃金/外注工賃");
    expect(result.taxCategory).toBe("不課税");
    expect(result.confidence).toBe(1);
    expect(result.source).toBe("rule");
  });

  it("flags loan disbursements and capital contributions as nonRevenue so they don't inflate income", () => {
    const loan = ruleBasedCategorize({ id: "9", date: "2026-01-05", description: "銀行融資 借入実行", amount: 3000000 });
    expect(loan.account).toBe("借入金");
    expect(loan.nonRevenue).toBe(true);

    const capital = ruleBasedCategorize({ id: "10", date: "2026-01-05", description: "資本金 出資払込", amount: 1000000 });
    expect(capital.account).toBe("元入金");
    expect(capital.nonRevenue).toBe(true);

    const sales = ruleBasedCategorize({ id: "11", date: "2026-01-05", description: "クライアントA社 業務委託料", amount: 300000 });
    expect(sales.nonRevenue).toBeUndefined();
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
