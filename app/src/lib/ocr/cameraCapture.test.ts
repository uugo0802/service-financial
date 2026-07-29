import { describe, expect, it } from "vitest";
import { getCameraCaptureLabel, getFilePickerLabel, isCameraCaptureSupported } from "./cameraCapture";

describe("isCameraCaptureSupported", () => {
  it("returns true for an iPhone Safari user agent", () => {
    expect(
      isCameraCaptureSupported({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("returns true for an Android Chrome user agent", () => {
    expect(
      isCameraCaptureSupported({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("returns true for a touch-capable device even with a non-mobile-looking user agent", () => {
    expect(isCameraCaptureSupported({ userAgent: "SomeUnknownBrowser/1.0", maxTouchPoints: 1 })).toBe(true);
  });

  it("returns false for a typical desktop Chrome user agent with no touch support", () => {
    expect(
      isCameraCaptureSupported({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        maxTouchPoints: 0,
      })
    ).toBe(false);
  });

  it("returns false when no environment info is available at all (e.g. SSR)", () => {
    expect(isCameraCaptureSupported({ userAgent: "", maxTouchPoints: 0 })).toBe(false);
  });

  it("treats a missing field as its default (empty UA / 0 touch points) rather than throwing", () => {
    expect(() => isCameraCaptureSupported({ userAgent: "iPhone" })).not.toThrow();
    expect(isCameraCaptureSupported({ userAgent: "iPhone" })).toBe(true);
    expect(isCameraCaptureSupported({ maxTouchPoints: 2 })).toBe(true);
  });
});

describe("getCameraCaptureLabel", () => {
  it("shows the capture prompt when idle", () => {
    expect(getCameraCaptureLabel(false)).toBe("カメラで撮影");
  });

  it("shows an in-progress label while loading", () => {
    expect(getCameraCaptureLabel(true)).toBe("解析中…");
  });
});

describe("getFilePickerLabel", () => {
  it("shows the file picker prompt when idle", () => {
    expect(getFilePickerLabel(false)).toBe("ファイルを選択");
  });

  it("shows an in-progress label while loading", () => {
    expect(getFilePickerLabel(true)).toBe("解析中…");
  });
});
