import { describe, expect, it } from "vitest";
import {
  ASSUMED_RECEIPT_SHORT_EDGE_MM,
  evaluateScannerStorageCompliance,
  RECOMMENDED_MIN_SHORT_EDGE_PX,
  SCANNER_STORAGE_MIN_DPI,
} from "./scannerStorageCompliance";

describe("evaluateScannerStorageCompliance", () => {
  it("passes for a high-resolution color image (typical smartphone photo)", () => {
    const result = evaluateScannerStorageCompliance({ width: 3024, height: 4032, isColor: true });

    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.estimatedDpi).toBeGreaterThanOrEqual(SCANNER_STORAGE_MIN_DPI);
  });

  it("fails with a resolution reason for a low-resolution color image", () => {
    const result = evaluateScannerStorageCompliance({ width: 320, height: 240, isColor: true });

    expect(result.passed).toBe(false);
    expect(result.estimatedDpi).toBeLessThan(SCANNER_STORAGE_MIN_DPI);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons.some((r) => r.includes("解像度"))).toBe(true);
  });

  it("fails with a color reason for a high-resolution grayscale image", () => {
    const result = evaluateScannerStorageCompliance({ width: 3024, height: 4032, isColor: false });

    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons.some((r) => r.includes("グレースケール"))).toBe(true);
  });

  it("fails with an indeterminate-color reason when color info could not be detected", () => {
    const result = evaluateScannerStorageCompliance({ width: 3024, height: 4032, isColor: null });

    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons.some((r) => r.includes("カラー画像かどうかを自動判定できませんでした"))).toBe(true);
  });

  it("reports both a low-resolution and a grayscale reason at once when both conditions apply", () => {
    const result = evaluateScannerStorageCompliance({ width: 320, height: 240, isColor: false });

    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.some((r) => r.includes("解像度"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("グレースケール"))).toBe(true);
  });

  it("returns a not-determinable result with a single reason for null dimensions (unsupported image format)", () => {
    const result = evaluateScannerStorageCompliance(null);

    expect(result.passed).toBe(false);
    expect(result.estimatedDpi).toBeNull();
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("自動判定できませんでした");
  });

  describe("boundary: short edge exactly at the 200dpi-equivalent threshold", () => {
    it("passes when the short edge is exactly at RECOMMENDED_MIN_SHORT_EDGE_PX", () => {
      const result = evaluateScannerStorageCompliance({
        width: RECOMMENDED_MIN_SHORT_EDGE_PX,
        height: 2000,
        isColor: true,
      });

      expect(result.estimatedDpi).toBeGreaterThanOrEqual(SCANNER_STORAGE_MIN_DPI);
      expect(result.reasons.some((r) => r.includes("解像度"))).toBe(false);
      expect(result.passed).toBe(true);
    });

    it("fails when the short edge is exactly one pixel below RECOMMENDED_MIN_SHORT_EDGE_PX", () => {
      // ピクセル数そのものが判定基準であり、表示用のestimatedDpiは四捨五入するため
      // 境界の1px差はdpi表示上200と丸められる場合があるが、passed/reasonsの判定はぶれない。
      const result = evaluateScannerStorageCompliance({
        width: RECOMMENDED_MIN_SHORT_EDGE_PX - 1,
        height: 2000,
        isColor: true,
      });

      expect(result.reasons.some((r) => r.includes("解像度"))).toBe(true);
      expect(result.passed).toBe(false);
    });

    it("derives RECOMMENDED_MIN_SHORT_EDGE_PX from the assumed short edge and target dpi", () => {
      const expected = Math.ceil((SCANNER_STORAGE_MIN_DPI * ASSUMED_RECEIPT_SHORT_EDGE_MM) / 25.4);
      expect(RECOMMENDED_MIN_SHORT_EDGE_PX).toBe(expected);
    });
  });

  it("uses the shorter of width/height regardless of orientation (portrait vs landscape)", () => {
    const portrait = evaluateScannerStorageCompliance({ width: 700, height: 2000, isColor: true });
    const landscape = evaluateScannerStorageCompliance({ width: 2000, height: 700, isColor: true });

    expect(portrait).toEqual(landscape);
  });
});
