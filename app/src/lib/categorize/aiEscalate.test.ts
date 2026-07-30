import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escalateWithAi } from "./aiEscalate";
import { CategorizedTransaction } from "./engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "謎の支出",
    amount: -1000,
    account: "要確認(未分類の経費)",
    taxCategory: "要確認",
    confidence: 0,
    source: "uncategorized",
    ...overrides,
  };
}

function mockToolUseResponse(overrides: Partial<{ account: string; taxCategory: string; confidence: number; reasoning: string }> = {}) {
  return {
    ok: true,
    json: async () => ({
      content: [
        {
          type: "tool_use",
          input: {
            account: "通信費",
            taxCategory: "課税仕入10%",
            confidence: 0.9,
            reasoning: "AIによる分類",
            ...overrides,
          },
        },
      ],
    }),
  };
}

describe("escalateWithAi", () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  describe("when ANTHROPIC_API_KEY is unset", () => {
    beforeEach(() => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      delete process.env.ANTHROPIC_API_KEY;
    });

    it("returns aiConfigured=false and leaves rows unchanged", async () => {
      const rows = [tx({ id: "1" }), tx({ id: "2", source: "rule", confidence: 1 })];
      const result = await escalateWithAi(rows);

      expect(result).toEqual({
        results: rows,
        aiConfigured: false,
        escalatedCount: 0,
        cappedAt: null,
      });
    });

    it("does not call fetch", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await escalateWithAi([tx({ id: "1" })]);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("when ANTHROPIC_API_KEY is set", () => {
    beforeEach(() => {
      vi.stubEnv("ANTHROPIC_API_KEY", "test-api-key");
    });

    it("escalates an uncategorized row to source 'ai' using the mocked response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse());
      vi.stubGlobal("fetch", fetchMock);

      const rows = [tx({ id: "1" })];
      const result = await escalateWithAi(rows);

      expect(result.aiConfigured).toBe(true);
      expect(result.escalatedCount).toBe(1);
      expect(result.cappedAt).toBeNull();

      const escalated = result.results[0];
      expect(escalated.source).toBe("ai");
      expect(escalated.account).toBe("通信費");
      expect(escalated.taxCategory).toBe("課税仕入10%");
      expect(escalated.confidence).toBe(0.9);
      expect(escalated.note).toBe("AIによる分類");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "x-api-key": "test-api-key" }),
        })
      );
    });

    it("leaves rows that already have a confident source untouched", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse());
      vi.stubGlobal("fetch", fetchMock);

      const ruleRow = tx({ id: "1", source: "rule", confidence: 1, account: "地代家賃" });
      const result = await escalateWithAi([ruleRow]);

      expect(result.results[0]).toEqual(ruleRow);
      expect(result.escalatedCount).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("caps escalation at MAX_AI_ROWS_PER_REQUEST (50) and sets cappedAt", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse());
      vi.stubGlobal("fetch", fetchMock);

      const rows = Array.from({ length: 60 }, (_, i) => tx({ id: `row-${i}` }));
      const result = await escalateWithAi(rows);

      expect(result.cappedAt).toBe(50);
      expect(result.escalatedCount).toBe(50);
      expect(fetchMock).toHaveBeenCalledTimes(50);

      const escalatedRows = result.results.filter((r) => r.source === "ai");
      const untouchedRows = result.results.filter((r) => r.source === "uncategorized");
      expect(escalatedRows).toHaveLength(50);
      expect(untouchedRows).toHaveLength(10);

      // only the first 50 rows (by original order) should have been sent to the AI
      expect(escalatedRows.map((r) => r.id)).toEqual(rows.slice(0, 50).map((r) => r.id));
      expect(untouchedRows.map((r) => r.id)).toEqual(rows.slice(50).map((r) => r.id));
    });

    it("leaves a row unchanged if the API call fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" });
      vi.stubGlobal("fetch", fetchMock);

      const row = tx({ id: "1" });
      const result = await escalateWithAi([row]);

      expect(result.results[0]).toEqual(row);
      expect(result.escalatedCount).toBe(1);
    });

    // Regression: cto-tech-architecture.md 3.3 requires that tax-category correctness is ultimately
    // guaranteed by rule-based validation, not by trusting the LLM's structured output as-is. The
    // Anthropic tool-use schema only *hints* an enum to the model; nothing previously verified at
    // runtime that the returned taxCategory was actually one of the known categories. A hallucinated
    // or malformed value would have been written straight into the ledger and silently excluded from
    // every tax computation that matches on exact taxCategory strings (e.g. "課税仕入10%"), which
    // understates deductible input tax / overstates tax due without any visible error.
    it("rejects an AI response whose taxCategory is not a recognized category, leaving the row uncategorized for human review", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse({ taxCategory: "課税" as never }));
      vi.stubGlobal("fetch", fetchMock);

      const row = tx({ id: "1" });
      const result = await escalateWithAi([row]);

      expect(result.results[0].source).toBe("uncategorized");
      expect(result.results[0].taxCategory).toBe(row.taxCategory);
    });

    it("clamps an out-of-range AI confidence value into [0, 1] instead of trusting it verbatim", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse({ confidence: 5 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await escalateWithAi([tx({ id: "1" })]);

      expect(result.results[0].confidence).toBeLessThanOrEqual(1);
    });

    it("clamps a negative AI confidence value into [0, 1] instead of trusting it verbatim", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse({ confidence: -0.3 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await escalateWithAi([tx({ id: "1" })]);

      expect(result.results[0].confidence).toBeGreaterThanOrEqual(0);
    });
  });
});
