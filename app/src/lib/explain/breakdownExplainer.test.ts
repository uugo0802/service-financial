import { describe, expect, it } from "vitest";
import { explainBreakdown, explainCategorization, explainEstimateAssumptions } from "./breakdownExplainer";
import { CategorizedTransaction } from "../categorize/engine";
import { IndividualEstimate } from "../tax/estimate";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("explainCategorization", () => {
  it("explains a rule-matched transaction with full confidence", () => {
    const result = explainCategorization(
      tx({ description: "事務所家賃", account: "地代家賃", taxCategory: "課税仕入10%", confidence: 1, source: "rule" })
    );

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("ルールベースで自動確定");
    expect(result[0].detail).toContain("事務所家賃");
    expect(result[0].detail).toContain("地代家賃");
    expect(result[0].detail).toContain("100%");
  });

  it("explains an AI-escalated transaction above the confidence threshold, including the reasoning note", () => {
    const result = explainCategorization(
      tx({
        description: "スターバックス 渋谷店",
        account: "会議費",
        taxCategory: "課税仕入10%",
        confidence: 0.9,
        source: "ai",
        note: "取引先との打ち合わせに関連する飲食と推定されるため会議費と判定",
      })
    );

    expect(result.map((s) => s.label)).toEqual(["AIによる判定", "AIの判定根拠"]);
    expect(result[0].detail).toContain("90%");
    expect(result[1].detail).toBe("取引先との打ち合わせに関連する飲食と推定されるため会議費と判定");
  });

  it("adds a low-confidence follow-up step for AI results below the review threshold", () => {
    const result = explainCategorization(
      tx({
        description: "謎の支出XYZ",
        account: "要確認",
        confidence: 0.4,
        source: "ai",
        note: "内容から判断できず確信度を低く設定",
      })
    );

    expect(result.map((s) => s.label)).toEqual(["AIによる判定", "確信度が低いため要確認", "AIの判定根拠"]);
    expect(result[1].detail).toContain("40%");
  });

  it("explains an uncategorized transaction with no matching rule and no AI escalation", () => {
    const result = explainCategorization(
      tx({ description: "謎の支出XYZ123", account: "要確認(未分類の経費)", confidence: 0, source: "uncategorized" })
    );

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("未分類（要確認）");
    expect(result[0].detail).toContain("謎の支出XYZ123");
  });

  it("appends a personal-deduction-only step when the account is not a business expense", () => {
    const result = explainCategorization(
      tx({
        description: "国民健康保険料",
        account: "社会保険料(個人)",
        confidence: 1,
        source: "rule",
        personalDeductionOnly: true,
      })
    );

    expect(result.map((s) => s.label)).toContain("事業の必要経費には含まれません");
  });

  it("omits the note step when no note is present", () => {
    const result = explainCategorization(tx({ source: "rule", confidence: 1, note: undefined }));
    expect(result.every((s) => s.label !== "補足" && s.label !== "AIの判定根拠")).toBe(true);
  });
});

describe("explainEstimateAssumptions", () => {
  it("converts each assumption string into a numbered explanation step", () => {
    const estimate: Pick<IndividualEstimate, "assumptions"> = {
      assumptions: ["青色申告特別控除65万円を一律適用しています", "住民税・事業税は含まれていません"],
    };

    const result = explainEstimateAssumptions(estimate);

    expect(result).toEqual([
      { label: "試算の前提 1", detail: "青色申告特別控除65万円を一律適用しています" },
      { label: "試算の前提 2", detail: "住民税・事業税は含まれていません" },
    ]);
  });

  it("returns an empty array when there are no assumptions", () => {
    expect(explainEstimateAssumptions({ assumptions: [] })).toEqual([]);
  });
});

describe("explainBreakdown", () => {
  it("combines transaction and estimate explanations when both are provided", () => {
    const result = explainBreakdown({
      transaction: tx({ source: "rule", confidence: 1, description: "売上入金" }),
      estimate: { assumptions: ["基礎控除48万円のみ考慮しています"] },
    });

    expect(result[0].label).toBe("ルールベースで自動確定");
    expect(result[1]).toEqual({ label: "試算の前提 1", detail: "基礎控除48万円のみ考慮しています" });
  });

  it("returns an empty array when neither transaction nor estimate is provided", () => {
    expect(explainBreakdown({})).toEqual([]);
  });

  it("returns only estimate explanations when no transaction is provided", () => {
    const result = explainBreakdown({ estimate: { assumptions: ["住民税・事業税は含まれていません"] } });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("試算の前提 1");
  });
});
