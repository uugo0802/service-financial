import { describe, expect, it } from "vitest";
import { buildCategorizationRationale, RATIONALE_DISCLAIMER } from "./rationale";
import { CategorizedTransaction } from "./engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-05",
    description: "Amazon.co.jp",
    amount: -3000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildCategorizationRationale", () => {
  describe("rule source", () => {
    it("uses the rule's note when present and reports full confidence", () => {
      const result = buildCategorizationRationale(
        tx({
          account: "地代家賃",
          taxCategory: "課税仕入10%",
          note: "事業用と仮定。住居兼用の場合は家事按分が必要",
        })
      );

      expect(result.headline).toBe("ルール一致（自動判定）");
      expect(result.explanation).toContain("ルール一致");
      expect(result.explanation).toContain("事業用と仮定");
      expect(result.tone).toBe("confirmed");
      expect(result.confidencePercent).toBe(100);
      expect(result.reviewMessage).toBeNull();
    });

    it("falls back to a generated explanation when the rule has no note", () => {
      const result = buildCategorizationRationale(tx({ note: undefined }));

      expect(result.explanation).toContain("Amazon.co.jp");
      expect(result.explanation).toContain("消耗品費");
      expect(result.tone).toBe("confirmed");
    });

    it("flags needsReview when the tax category is 要確認, even though the rule matched", () => {
      const result = buildCategorizationRationale(
        tx({
          account: "諸会費",
          taxCategory: "要確認",
          note: "対価性の有無により課税仕入/不課税の判定が分かれるため要確認",
        })
      );

      expect(result.tone).toBe("needsReview");
      expect(result.reviewMessage).not.toBeNull();
    });
  });

  describe("ai source", () => {
    it("reports confidence as a percentage and stays confirmed above the threshold", () => {
      const result = buildCategorizationRationale(
        tx({ source: "ai", confidence: 0.92, note: "定期的なサブスクリプション利用料と判断" })
      );

      expect(result.headline).toBe("AI判定（確信度92%）");
      expect(result.explanation).toContain("AI判定（確信度92%）");
      expect(result.explanation).toContain("定期的なサブスクリプション利用料と判断");
      expect(result.tone).toBe("confirmed");
      expect(result.confidencePercent).toBe(92);
      expect(result.reviewMessage).toBeNull();
    });

    it("flags needsReview and asks for confirmation when confidence is low", () => {
      const result = buildCategorizationRationale(
        tx({ source: "ai", confidence: 0.42, note: "家事按分が必要な可能性があるため要確認" })
      );

      expect(result.headline).toBe("AI判定（確信度42%）");
      expect(result.tone).toBe("needsReview");
      expect(result.reviewMessage).toContain("確認");
    });

    it("falls back to a generated explanation when the AI provided no reasoning text", () => {
      const result = buildCategorizationRationale(tx({ source: "ai", confidence: 0.8, note: "" }));

      expect(result.explanation).toContain("推定しました");
    });
  });

  describe("manual source", () => {
    it("has no numeric confidence and is always confirmed", () => {
      const result = buildCategorizationRationale(tx({ source: "manual", confidence: 1 }));

      expect(result.headline).toBe("手入力");
      expect(result.tone).toBe("confirmed");
      expect(result.confidencePercent).toBeNull();
      expect(result.reviewMessage).toBeNull();
    });

    it("includes the user's own note when present", () => {
      const result = buildCategorizationRationale(tx({ source: "manual", note: "現金払いの領収書より入力" }));

      expect(result.explanation).toContain("現金払いの領収書より入力");
    });
  });

  describe("uncategorized source", () => {
    it("always needs review regardless of confidence", () => {
      const result = buildCategorizationRationale(
        tx({ source: "uncategorized", account: "要確認(未分類の経費)", taxCategory: "要確認", confidence: 0 })
      );

      expect(result.headline).toBe("未分類（要確認）");
      expect(result.tone).toBe("needsReview");
      expect(result.confidencePercent).toBe(0);
      expect(result.reviewMessage).not.toBeNull();
    });
  });
});

describe("RATIONALE_DISCLAIMER", () => {
  it("makes clear this is not individual tax advice", () => {
    expect(RATIONALE_DISCLAIMER).toContain("税務相談ではありません");
  });
});
