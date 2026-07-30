import { describe, expect, it } from "vitest";
import { buildReceiptCandidate, buildScanMetadata, recordCorrection } from "./receiptCandidate";
import { OcrClassificationResult } from "./receiptOcr";

function writeUint32BE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function buildPngBuffer(width: number, height: number, colorType: number): ArrayBuffer {
  const bytes = new Uint8Array(8 + 4 + 4 + 13 + 4);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  writeUint32BE(bytes, 8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes.buffer;
}

describe("buildScanMetadata", () => {
  it("marks a large, high-resolution color image as meeting the scanner storage requirement", () => {
    // 長辺2000px, 基準15cm(=5.9インチ) => 約338dpi、200dpi相当以上
    const buffer = buildPngBuffer(1500, 2000, 2); // colorType 2 = RGB
    const meta = buildScanMetadata({
      originalFileName: "receipt.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.width).toBe(1500);
    expect(meta.height).toBe(2000);
    expect(meta.isColor).toBe(true);
    expect(meta.estimatedDpi).toBeGreaterThanOrEqual(200);
    expect(meta.meetsScannerStorageRequirement).toBe(true);
    expect(meta.scannerStorageWarnings).toEqual([]);
  });

  it("warns about low resolution for a small image", () => {
    const buffer = buildPngBuffer(200, 300, 2);
    const meta = buildScanMetadata({
      originalFileName: "receipt-small.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.estimatedDpi).toBeLessThan(200);
    expect(meta.meetsScannerStorageRequirement).toBe(false);
    expect(meta.scannerStorageWarnings.some((w) => w.includes("解像度"))).toBe(true);
  });

  it("warns about grayscale images even at high resolution", () => {
    const buffer = buildPngBuffer(1500, 2000, 0); // colorType 0 = grayscale
    const meta = buildScanMetadata({
      originalFileName: "receipt-gray.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.isColor).toBe(false);
    expect(meta.meetsScannerStorageRequirement).toBe(false);
    expect(meta.scannerStorageWarnings.some((w) => w.includes("グレースケール"))).toBe(true);
  });

  it("warns and reports unknown dimensions for an unrecognized image format", () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]); // not a real image
    const meta = buildScanMetadata({
      originalFileName: "receipt.webp",
      mimeType: "image/webp",
      sizeBytes: bytes.byteLength,
      imageBuffer: bytes.buffer,
    });

    expect(meta.width).toBeNull();
    expect(meta.height).toBeNull();
    expect(meta.isColor).toBeNull();
    expect(meta.estimatedDpi).toBeNull();
    expect(meta.meetsScannerStorageRequirement).toBe(false);
    expect(meta.scannerStorageWarnings).toHaveLength(1);
  });

  it("does not warn about resolution when the estimated dpi lands exactly on the 200dpi threshold", () => {
    // 長辺591px, 基準15cm(=5.905...インチ) => ちょうど概算100dpi付近になるよう、
    // 200dpi境界ちょうどになる長辺を逆算(200dpi * (15/2.54)インチ ≈ 1181px)して使用する
    const longEdgeForExactly200Dpi = Math.round(200 * (15 / 2.54));
    const buffer = buildPngBuffer(longEdgeForExactly200Dpi, 100, 2);
    const meta = buildScanMetadata({
      originalFileName: "receipt-boundary.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.estimatedDpi).toBeGreaterThanOrEqual(200);
    expect(meta.scannerStorageWarnings.some((w) => w.includes("解像度"))).toBe(false);
    expect(meta.meetsScannerStorageRequirement).toBe(true);
  });

  it("reports both a low-resolution and a grayscale warning at once when both conditions apply", () => {
    const buffer = buildPngBuffer(200, 300, 0); // small + grayscale (colorType 0)
    const meta = buildScanMetadata({
      originalFileName: "receipt-small-gray.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.scannerStorageWarnings).toHaveLength(2);
    expect(meta.scannerStorageWarnings.some((w) => w.includes("解像度"))).toBe(true);
    expect(meta.scannerStorageWarnings.some((w) => w.includes("グレースケール"))).toBe(true);
    expect(meta.meetsScannerStorageRequirement).toBe(false);
  });

  it("uses the provided uploadedAt instead of the current time when given", () => {
    const buffer = buildPngBuffer(1500, 2000, 2);
    const meta = buildScanMetadata({
      originalFileName: "receipt.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
      uploadedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(meta.uploadedAt).toBe("2026-07-25T00:00:00.000Z");
  });

  it("defaults uploadedAt to an ISO timestamp near the current time when not given", () => {
    const before = Date.now();
    const buffer = buildPngBuffer(1500, 2000, 2);
    const meta = buildScanMetadata({
      originalFileName: "receipt.png",
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });
    const after = Date.now();

    const uploadedAtMs = new Date(meta.uploadedAt).getTime();
    expect(uploadedAtMs).toBeGreaterThanOrEqual(before);
    expect(uploadedAtMs).toBeLessThanOrEqual(after);
  });

  it("also handles JPEG buffers, not just PNG", () => {
    // SOI + SOF0 with 3 components (YCbCr), 200x300
    const bytes = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
    const buffer = new Uint8Array(bytes).buffer;
    const meta = buildScanMetadata({
      originalFileName: "receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: buffer.byteLength,
      imageBuffer: buffer,
    });

    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
    expect(meta.isColor).toBe(true);
  });
});

describe("buildReceiptCandidate", () => {
  const scanMetadata = buildScanMetadata({
    originalFileName: "receipt.png",
    mimeType: "image/png",
    sizeBytes: 100,
    imageBuffer: buildPngBuffer(1500, 2000, 2),
  });

  it("builds an 'unrecognized' candidate when classification is null (AI unavailable/failed)", () => {
    const candidate = buildReceiptCandidate({ id: "r1", classification: null, scanMetadata });

    expect(candidate.source).toBe("unrecognized");
    expect(candidate.account).toBe("要確認(OCR未実行)");
    expect(candidate.taxCategory).toBe("要確認");
    expect(candidate.confidence).toBe(0);
    expect(candidate.date).toBeNull();
    expect(candidate.correctionHistory).toEqual([]);
    expect(candidate.scanMetadata).toBe(scanMetadata);
  });

  it("builds an 'ai' candidate from a successful classification", () => {
    const classification: OcrClassificationResult = {
      date: "2026-07-20",
      counterparty: "スターバックス 渋谷店",
      amount: 580,
      account: "会議費",
      taxCategory: "課税仕入10%",
      confidence: 0.92,
      reasoning: "カフェでの飲食のため会議費と判定",
      rawOcrText: "スターバックス 渋谷店 コーヒー 580円",
    };

    const candidate = buildReceiptCandidate({ id: "r2", classification, scanMetadata });

    expect(candidate.source).toBe("ai");
    expect(candidate.date).toBe("2026-07-20");
    expect(candidate.counterparty).toBe("スターバックス 渋谷店");
    expect(candidate.amount).toBe(580);
    expect(candidate.account).toBe("会議費");
    expect(candidate.taxCategory).toBe("課税仕入10%");
    expect(candidate.confidence).toBe(0.92);
    expect(candidate.reasoning).toBe("カフェでの飲食のため会議費と判定");
    expect(candidate.correctionHistory).toEqual([]);
  });
});

describe("recordCorrection", () => {
  it("appends a correction entry without mutating the original candidate", () => {
    const scanMetadata = buildScanMetadata({
      originalFileName: "receipt.png",
      mimeType: "image/png",
      sizeBytes: 100,
      imageBuffer: buildPngBuffer(1500, 2000, 2),
    });
    const original = buildReceiptCandidate({ id: "r3", classification: null, scanMetadata });

    const updated = recordCorrection(original, "account", "要確認(OCR未実行)", "旅費交通費");

    expect(original.correctionHistory).toEqual([]);
    expect(updated.correctionHistory).toHaveLength(1);
    expect(updated.correctionHistory[0]).toMatchObject({
      field: "account",
      previousValue: "要確認(OCR未実行)",
      newValue: "旅費交通費",
    });
    expect(typeof updated.correctionHistory[0].correctedAt).toBe("string");
  });

  it("accumulates multiple corrections in order", () => {
    const scanMetadata = buildScanMetadata({
      originalFileName: "receipt.png",
      mimeType: "image/png",
      sizeBytes: 100,
      imageBuffer: buildPngBuffer(1500, 2000, 2),
    });
    const original = buildReceiptCandidate({ id: "r4", classification: null, scanMetadata });

    const step1 = recordCorrection(original, "account", "要確認(OCR未実行)", "旅費交通費");
    const step2 = recordCorrection(step1, "amount", null, 1200);

    expect(step2.correctionHistory).toHaveLength(2);
    expect(step2.correctionHistory[0].field).toBe("account");
    expect(step2.correctionHistory[1].field).toBe("amount");
  });
});
