import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyReceiptImage,
  isSupportedImageMediaType,
  isSupportedPdfMediaType,
  isSupportedReceiptMediaType,
  validateOcrToolInput,
} from "./receiptOcr";

function mockToolUseResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      content: [
        {
          type: "tool_use",
          input: {
            date: "2026-07-20",
            counterparty: "スターバックス 渋谷店",
            amount: 580,
            account: "会議費",
            taxCategory: "課税仕入10%",
            confidence: 0.92,
            reasoning: "カフェでの飲食のため会議費と判定",
            rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
            ...overrides,
          },
        },
      ],
    }),
  };
}

describe("isSupportedImageMediaType", () => {
  it("accepts common image types", () => {
    expect(isSupportedImageMediaType("image/jpeg")).toBe(true);
    expect(isSupportedImageMediaType("image/png")).toBe(true);
    expect(isSupportedImageMediaType("image/gif")).toBe(true);
    expect(isSupportedImageMediaType("image/webp")).toBe(true);
  });

  it("rejects non-image or unsupported types", () => {
    expect(isSupportedImageMediaType("application/pdf")).toBe(false);
    expect(isSupportedImageMediaType("text/csv")).toBe(false);
    expect(isSupportedImageMediaType("image/heic")).toBe(false);
  });

  it("is case-sensitive and rejects an empty string (documents current strict matching)", () => {
    expect(isSupportedImageMediaType("IMAGE/JPEG")).toBe(false);
    expect(isSupportedImageMediaType("")).toBe(false);
  });
});

describe("isSupportedPdfMediaType", () => {
  it("accepts application/pdf", () => {
    expect(isSupportedPdfMediaType("application/pdf")).toBe(true);
  });

  it("rejects image types and other unsupported types", () => {
    expect(isSupportedPdfMediaType("image/jpeg")).toBe(false);
    expect(isSupportedPdfMediaType("text/csv")).toBe(false);
    expect(isSupportedPdfMediaType("")).toBe(false);
  });
});

describe("isSupportedReceiptMediaType", () => {
  it("accepts every supported image type", () => {
    expect(isSupportedReceiptMediaType("image/jpeg")).toBe(true);
    expect(isSupportedReceiptMediaType("image/png")).toBe(true);
    expect(isSupportedReceiptMediaType("image/gif")).toBe(true);
    expect(isSupportedReceiptMediaType("image/webp")).toBe(true);
  });

  it("accepts PDF (scanned document upload)", () => {
    expect(isSupportedReceiptMediaType("application/pdf")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isSupportedReceiptMediaType("text/csv")).toBe(false);
    expect(isSupportedReceiptMediaType("image/heic")).toBe(false);
    expect(isSupportedReceiptMediaType("")).toBe(false);
  });
});

describe("validateOcrToolInput", () => {
  it("returns a fully-populated result for a valid input", () => {
    const result = validateOcrToolInput({
      date: "2026-07-20",
      counterparty: "スターバックス 渋谷店",
      amount: 580,
      account: "会議費",
      taxCategory: "課税仕入10%",
      confidence: 0.92,
      reasoning: "カフェでの飲食のため会議費と判定",
      rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
    });

    expect(result).toEqual({
      date: "2026-07-20",
      counterparty: "スターバックス 渋谷店",
      amount: 580,
      account: "会議費",
      taxCategory: "課税仕入10%",
      confidence: 0.92,
      reasoning: "カフェでの飲食のため会議費と判定",
      rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
    });
  });

  it("returns null when account is missing", () => {
    expect(validateOcrToolInput({ taxCategory: "課税仕入10%", confidence: 0.9, reasoning: "" })).toBeNull();
  });

  it("returns null when account is an empty string", () => {
    expect(validateOcrToolInput({ account: "   ", taxCategory: "課税仕入10%", confidence: 0.9, reasoning: "" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validateOcrToolInput(null)).toBeNull();
    expect(validateOcrToolInput(undefined)).toBeNull();
    expect(validateOcrToolInput("not an object")).toBeNull();
    expect(validateOcrToolInput(42)).toBeNull();
  });

  it("falls back to 要確認 for an unknown taxCategory value", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "存在しない区分", confidence: 0.5, reasoning: "" });
    expect(result?.taxCategory).toBe("要確認");
  });

  it("nulls out an invalid date format", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 0.5, reasoning: "", date: "2026/07/20" });
    expect(result?.date).toBeNull();
  });

  it("nulls out an empty-string counterparty", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 0.5, reasoning: "", counterparty: "  " });
    expect(result?.counterparty).toBeNull();
  });

  it("nulls out a non-numeric amount", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 0.5, reasoning: "", amount: "580円" });
    expect(result?.amount).toBeNull();
  });

  it("clamps confidence above 1 down to 1", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 1.5, reasoning: "" });
    expect(result?.confidence).toBe(1);
  });

  it("clamps confidence below 0 up to 0", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: -0.3, reasoning: "" });
    expect(result?.confidence).toBe(0);
  });

  it("defaults confidence to 0.5 when missing or non-numeric", () => {
    expect(validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", reasoning: "" })?.confidence).toBe(0.5);
    expect(validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: "high", reasoning: "" })?.confidence).toBe(0.5);
  });

  it("defaults confidence to 0.5 when it is NaN", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: NaN, reasoning: "" });
    expect(result?.confidence).toBe(0.5);
  });

  it("accepts amount 0 and a negative amount (e.g. refunds) as valid numbers rather than nulling them out", () => {
    expect(validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 0.5, reasoning: "", amount: 0 })?.amount).toBe(0);
    expect(validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認", confidence: 0.5, reasoning: "", amount: -500 })?.amount).toBe(
      -500
    );
  });

  it("defaults reasoning and rawOcrText to empty strings when missing", () => {
    const result = validateOcrToolInput({ account: "消耗品費", taxCategory: "要確認" });
    expect(result?.reasoning).toBe("");
    expect(result?.rawOcrText).toBe("");
  });
});

describe("classifyReceiptImage", () => {
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

    it("returns null without calling fetch", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" });

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("when ANTHROPIC_API_KEY is set", () => {
    beforeEach(() => {
      vi.stubEnv("ANTHROPIC_API_KEY", "test-api-key");
    });

    it("sends the image as a base64 content block and returns the parsed classification", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" });

      expect(result).toEqual({
        date: "2026-07-20",
        counterparty: "スターバックス 渋谷店",
        amount: 580,
        account: "会議費",
        taxCategory: "課税仕入10%",
        confidence: 0.92,
        reasoning: "カフェでの飲食のため会議費と判定",
        rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.headers["x-api-key"]).toBe("test-api-key");

      const body = JSON.parse(init.body);
      const imageBlock = body.messages[0].content.find((c: { type: string }) => c.type === "image");
      expect(imageBlock.source).toEqual({ type: "base64", media_type: "image/jpeg", data: "ZmFrZQ==" });
    });

    it("sends a PDF as a document content block (not an image block) and returns the parsed classification", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockToolUseResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "cGRmZmFrZQ==", mimeType: "application/pdf" });

      expect(result).toEqual({
        date: "2026-07-20",
        counterparty: "スターバックス 渋谷店",
        amount: 580,
        account: "会議費",
        taxCategory: "課税仕入10%",
        confidence: 0.92,
        reasoning: "カフェでの飲食のため会議費と判定",
        rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const documentBlock = body.messages[0].content.find((c: { type: string }) => c.type === "document");
      expect(documentBlock.source).toEqual({ type: "base64", media_type: "application/pdf", data: "cGRmZmFrZQ==" });
      expect(body.messages[0].content.find((c: { type: string }) => c.type === "image")).toBeUndefined();
    });

    it("returns null when the API responds with a non-ok status", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" });
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" });
      expect(result).toBeNull();
    });

    it("returns null when the response has no tool_use content block", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "text", text: "..." }] }) });
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" });
      expect(result).toBeNull();
    });

    it("returns null when the response has no content field at all", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);

      const result = await classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" });
      expect(result).toBeNull();
    });

    it("returns null instead of throwing when fetch itself rejects (network error)", async () => {
      // Regression test: classifyReceiptImage is documented to return null when the API call
      // fails, but previously only guarded against a non-ok HTTP status, not a rejected fetch
      // promise (e.g. DNS failure, connection reset, timeout).
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" })).resolves.toBeNull();
    });

    it("returns null instead of throwing when the response body is not valid JSON", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(classifyReceiptImage({ base64: "ZmFrZQ==", mimeType: "image/jpeg" })).resolves.toBeNull();
    });
  });
});
