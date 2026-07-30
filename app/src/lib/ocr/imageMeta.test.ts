import { describe, expect, it } from "vitest";
import { hasRecommendedMinimumResolution, parseImageDimensions, RECOMMENDED_MIN_LONG_EDGE_PX } from "./imageMeta";

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

    it("detects a palette PNG (colorType 3) as color", () => {
      const buffer = buildPngBuffer(640, 480, 3);
      const result = parseImageDimensions(buffer, "image/png");
      expect(result?.isColor).toBe(true);
    });

    it("detects a grayscale+alpha PNG (colorType 4) as not color", () => {
      const buffer = buildPngBuffer(640, 480, 4);
      const result = parseImageDimensions(buffer, "image/png");
      expect(result?.isColor).toBe(false);
    });

    it("recognizes the PNG signature even without the image/png mime type", () => {
      const buffer = buildPngBuffer(100, 100, 2);
      const result = parseImageDimensions(buffer, "application/octet-stream");
      expect(result).not.toBeNull();
    });

    it("returns null when width or height is 0", () => {
      const zeroWidth = buildPngBuffer(0, 600, 2);
      expect(parseImageDimensions(zeroWidth, "image/png")).toBeNull();

      const zeroHeight = buildPngBuffer(800, 0, 2);
      expect(parseImageDimensions(zeroHeight, "image/png")).toBeNull();
    });

    it("treats an undefined/reserved PNG color type as color-indeterminate", () => {
      const buffer = buildPngBuffer(800, 600, 1); // 1 is not a valid PNG color type
      const result = parseImageDimensions(buffer, "image/png");
      expect(result?.isColor).toBeNull();
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

    it("recognizes the JPEG signature even without the image/jpeg mime type", () => {
      const buffer = buildJpegBuffer(320, 240, 3);
      const result = parseImageDimensions(buffer, "application/octet-stream");
      expect(result).toEqual({ width: 320, height: 240, isColor: true });
    });

    it("returns null when width or height is 0", () => {
      const zeroWidth = buildJpegBuffer(0, 480, 3);
      expect(parseImageDimensions(zeroWidth, "image/jpeg")).toBeNull();

      const zeroHeight = buildJpegBuffer(640, 0, 3);
      expect(parseImageDimensions(zeroHeight, "image/jpeg")).toBeNull();
    });

    it("skips non-SOF marker segments (e.g. APP0/JFIF) before finding SOF0", () => {
      const app0Payload = [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]; // "JFIF..." (14 bytes)
      const app0Length = 2 + app0Payload.length;
      const bytes: number[] = [0xff, 0xd8]; // SOI
      bytes.push(0xff, 0xe0, (app0Length >> 8) & 0xff, app0Length & 0xff, ...app0Payload); // APP0
      const sofBuffer = new Uint8Array(buildJpegBuffer(1024, 768, 3)).slice(2); // SOF0 segment (minus SOI)
      const withApp0 = new Uint8Array([...bytes, ...sofBuffer]);

      const result = parseImageDimensions(withApp0.buffer, "image/jpeg");
      expect(result).toEqual({ width: 1024, height: 768, isColor: true });
    });

    it("skips restart markers (RST0-RST7) while scanning for SOF0", () => {
      const sofBuffer = new Uint8Array(buildJpegBuffer(200, 100, 3)).slice(2);
      const withRst = new Uint8Array([0xff, 0xd8, 0xff, 0xd0, ...sofBuffer]); // SOI + RST0 + SOF0 segment
      const result = parseImageDimensions(withRst.buffer, "image/jpeg");
      expect(result).toEqual({ width: 200, height: 100, isColor: true });
    });

    it("skips payload-less markers (e.g. TEM 0xFF01) while scanning for SOF0", () => {
      const sofBuffer = new Uint8Array(buildJpegBuffer(200, 100, 3)).slice(2);
      const withTem = new Uint8Array([0xff, 0xd8, 0xff, 0x01, ...sofBuffer]); // SOI + TEM + SOF0 segment
      const result = parseImageDimensions(withTem.buffer, "image/jpeg");
      expect(result).toEqual({ width: 200, height: 100, isColor: true });
    });

    it("returns null without hanging when a segment reports an invalid (< 2) length", () => {
      // 0xFFFE (COM marker) with a corrupt length of 1, and no SOF segment after it.
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x01]);
      const result = parseImageDimensions(bytes.buffer, "image/jpeg");
      expect(result).toBeNull();
    });

    it("returns null when the SOF segment is truncated before width/height/component bytes", () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08]); // SOF0 header cut short
      const result = parseImageDimensions(bytes.buffer, "image/jpeg");
      expect(result).toBeNull();
    });

    it("returns null instead of looping forever on a segment with a corrupt (too-short) length", () => {
      // SOI + a non-SOF marker (APP0) whose declared segment length is below the minimum of 2
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
      expect(() => parseImageDimensions(bytes.buffer, "image/jpeg")).not.toThrow();
      expect(parseImageDimensions(bytes.buffer, "image/jpeg")).toBeNull();
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

describe("hasRecommendedMinimumResolution", () => {
  it("returns true for a typical modern smartphone camera photo", () => {
    expect(hasRecommendedMinimumResolution({ width: 3024, height: 4032 })).toBe(true);
  });

  it("returns true when exactly at the threshold on the long edge", () => {
    expect(hasRecommendedMinimumResolution({ width: 800, height: RECOMMENDED_MIN_LONG_EDGE_PX })).toBe(true);
  });

  it("returns false for a low-resolution thumbnail-sized image", () => {
    expect(hasRecommendedMinimumResolution({ width: 320, height: 240 })).toBe(false);
  });

  it("uses the longer of width/height (portrait or landscape)", () => {
    expect(hasRecommendedMinimumResolution({ width: 1600, height: 200 })).toBe(true);
    expect(hasRecommendedMinimumResolution({ width: 200, height: 1600 })).toBe(true);
  });
});
