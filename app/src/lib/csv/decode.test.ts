import { describe, expect, it } from "vitest";
import { decodeCsvBuffer } from "./decode";

describe("decodeCsvBuffer", () => {
  it("decodes a valid UTF-8 buffer as utf-8", () => {
    const text = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const buffer = new TextEncoder().encode(text).buffer;

    const result = decodeCsvBuffer(buffer);

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe(text);
  });

  it("decodes a UTF-8 buffer with a BOM as utf-8, stripping the BOM", () => {
    // TextDecoder("utf-8") strips a leading BOM by default (ignoreBOM: false),
    // so decodeCsvBuffer returns clean text with no U+FEFF prefix.
    const text = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);

    const result = decodeCsvBuffer(withBom.buffer);

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe(text);
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("decodes a Shift-JIS (CP932) buffer as shift_jis", () => {
    // Real Shift-JIS bytes for "日付,摘要,金額\n2026-01-05,家賃,-120000\n",
    // produced with `iconv -f UTF-8 -t SHIFT_JIS` and verified to round-trip
    // via TextDecoder("shift_jis"). These bytes are not valid UTF-8 (the
    // strict utf-8 TextDecoder throws on them), so decodeCsvBuffer must fall
    // back to the shift_jis branch.
    const sjisBytes = new Uint8Array([
      0x93, 0xfa, 0x95, 0x74, 0x2c, 0x93, 0x45, 0x97, 0x76, 0x2c, 0x8b, 0xe0, 0x8a, 0x7a, 0x0a, 0x32, 0x30, 0x32,
      0x36, 0x2d, 0x30, 0x31, 0x2d, 0x30, 0x35, 0x2c, 0x89, 0xc6, 0x92, 0xc0, 0x2c, 0x2d, 0x31, 0x32, 0x30, 0x30,
      0x30, 0x30, 0x0a,
    ]);

    const result = decodeCsvBuffer(sjisBytes.buffer);

    expect(result.encoding).toBe("shift_jis");
    expect(result.text).toBe("日付,摘要,金額\n2026-01-05,家賃,-120000\n");
  });

  it("decodes a plain ASCII buffer as utf-8", () => {
    const text = "date,description,amount\n2026-01-05,rent,-120000\n";
    const buffer = new TextEncoder().encode(text).buffer;

    const result = decodeCsvBuffer(buffer);

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe(text);
  });

  it("decodes an empty buffer as utf-8 with empty text", () => {
    const result = decodeCsvBuffer(new ArrayBuffer(0));

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe("");
  });

  it("falls back to shift_jis for a lone byte that is not valid UTF-8 (0xa4, hiragana range in CP932)", () => {
    // 0xa4 alone is an invalid UTF-8 continuation byte, so the strict utf-8
    // decoder throws and decodeCsvBuffer falls back to shift_jis, which maps
    // single bytes in this range without raising an error (never fatal).
    const bytes = new Uint8Array([0xa4]);

    const result = decodeCsvBuffer(bytes.buffer);

    expect(result.encoding).toBe("shift_jis");
    expect(result.text.length).toBe(1);
  });

  it("decodes truncated/invalid byte sequences as shift_jis without throwing", () => {
    // Bytes that are invalid as UTF-8 (lone continuation/start bytes) must not
    // propagate an exception out of decodeCsvBuffer even though shift_jis
    // decoding of garbage input may itself contain replacement characters.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x81]);

    expect(() => decodeCsvBuffer(bytes.buffer)).not.toThrow();
    const result = decodeCsvBuffer(bytes.buffer);
    expect(result.encoding).toBe("shift_jis");
  });
});
