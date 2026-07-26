import { describe, expect, it } from "vitest";
import { parseImageDimensions } from "./imageMeta";

function writeUint32BE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

/** IHDRチャンクのみを持つ最小限のPNGバイト列を組み立てる（CRCは検証されないためダミー値で良い） */
function buildPngBuffer(width: number, height: number, colorType: number): ArrayBuffer {
  const bytes = new Uint8Array(8 + 4 + 4 + 13 + 4);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  writeUint32BE(bytes, 8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  bytes[24] = 8; // bit depth
  bytes[25] = colorType;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  return bytes.buffer;
}

/** SOF0セグメントのみを持つ最小限のJPEGバイト列を組み立てる */
function buildJpegBuffer(width: number, height: number, numComponents: number): ArrayBuffer {
  const componentBytes = numComponents * 3;
  const segmentLength = 2 + 1 + 2 + 2 + 1 + componentBytes;
  const bytes: number[] = [0xff, 0xd8]; // SOI
  bytes.push(0xff, 0xc0); // SOF0
  bytes.push((segmentLength >> 8) & 0xff, segmentLength & 0xff);
  bytes.push(8); // precision
  bytes.push((height >> 8) & 0xff, height & 0xff);
  bytes.push((width >> 8) & 0xff, width & 0xff);
  bytes.push(numComponents);
  for (let i = 0; i < numComponents; i++) {
    bytes.push(i + 1, 0x11, 0);
  }
  return new Uint8Array(bytes).buffer;
}

describe("parseImageDimensions", () => {
  describe("PNG", () => {
    it("parses width/height and detects a truecolor (RGB) image as color", () => {
      const buffer = buildPngBuffer(3024, 4032, 2);
      const result = parseImageDimensions(buffer, "image/png");
      expect(result).toEqual({ width: 3024, height: 4032, isColor: true });
    });

    it("detects a grayscale PNG (colorType 0) as not color", () => {
      const buffer = buildPngBuffer(800, 600, 0);
      const result = parseImageDimensions(buffer, "image/png");
      expect(result?.isColor).toBe(false);
    });

    it("detects an RGBA PNG (colorType 6) as color", () => {
      const buffer = buildPngBuffer(1200, 1600, 6);
      const result = parseImageDimensions(buffer, "image/png");
      expect(result?.isColor).toBe(true);
    });

    it("recognizes the PNG signature even without the image/png mime type", () => {
      const buffer = buildPngBuffer(100, 100, 2);
      const result = parseImageDimensions(buffer, "application/octet-stream");
      expect(result).not.toBeNull();
    });
  });

  describe("JPEG", () => {
    it("parses width/height and detects a 3-component (YCbCr/RGB) image as color", () => {
      const buffer = buildJpegBuffer(4000, 3000, 3);
      const result = parseImageDimensions(buffer, "image/jpeg");
      expect(result).toEqual({ width: 4000, height: 3000, isColor: true });
    });

    it("detects a single-component JPEG as grayscale", () => {
      const buffer = buildJpegBuffer(640, 480, 1);
      const result = parseImageDimensions(buffer, "image/jpeg");
      expect(result?.isColor).toBe(false);
    });
  });

  describe("unsupported or invalid input", () => {
    it("returns null for an unsupported mime type with no recognizable signature", () => {
      const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]); // "RIFF..." (WebP-ish, not implemented)
      const result = parseImageDimensions(bytes.buffer, "image/webp");
      expect(result).toBeNull();
    });

    it("returns null for a truncated/corrupt PNG buffer instead of throwing", () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
      expect(() => parseImageDimensions(bytes.buffer, "image/png")).not.toThrow();
      expect(parseImageDimensions(bytes.buffer, "image/png")).toBeNull();
    });

    it("returns null for a JPEG with only an SOI marker and no SOF segment", () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // SOI + EOI only
      const result = parseImageDimensions(bytes.buffer, "image/jpeg");
      expect(result).toBeNull();
    });

    it("returns null for an empty buffer", () => {
      const result = parseImageDimensions(new ArrayBuffer(0), "image/jpeg");
      expect(result).toBeNull();
    });
  });
});
