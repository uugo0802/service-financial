import { describe, expect, it } from "vitest";
import {
  APP_SHELL_URLS,
  CACHE_NAME,
  OFFLINE_FALLBACK_URL,
  isImmutableStaticAsset,
  isNetworkOnlyRequest,
} from "./offlineCache";

describe("APP_SHELL_URLS", () => {
  it("only precaches static, non-sensitive shell pages", () => {
    expect(APP_SHELL_URLS).toContain("/");
    expect(APP_SHELL_URLS).toContain(OFFLINE_FALLBACK_URL);
  });

  it("never includes an /api/ route (accounting data must never be precached)", () => {
    for (const url of APP_SHELL_URLS) {
      expect(url.startsWith("/api/")).toBe(false);
    }
  });
});

describe("CACHE_NAME", () => {
  it("is a non-empty, stable identifier", () => {
    expect(CACHE_NAME).toBeTruthy();
    expect(CACHE_NAME).toMatch(/^jarvis-shell-/);
  });
});

describe("isNetworkOnlyRequest", () => {
  it("bypasses the cache for non-GET methods regardless of path", () => {
    expect(isNetworkOnlyRequest("POST", "/")).toBe(true);
    expect(isNetworkOnlyRequest("PUT", "/transactions")).toBe(true);
    expect(isNetworkOnlyRequest("DELETE", "/")).toBe(true);
  });

  it("bypasses the cache for any /api/ path, which may carry financial data", () => {
    expect(isNetworkOnlyRequest("GET", "/api/transactions")).toBe(true);
    expect(isNetworkOnlyRequest("GET", "/api/journal/export")).toBe(true);
  });

  it("is case-insensitive on the HTTP method", () => {
    expect(isNetworkOnlyRequest("get", "/dashboard")).toBe(false);
    expect(isNetworkOnlyRequest("post", "/api/transactions")).toBe(true);
  });

  it("allows caching for GET requests outside of /api/", () => {
    expect(isNetworkOnlyRequest("GET", "/")).toBe(false);
    expect(isNetworkOnlyRequest("GET", "/dashboard")).toBe(false);
    expect(isNetworkOnlyRequest("GET", "/offline")).toBe(false);
  });
});

describe("isImmutableStaticAsset", () => {
  it("treats hashed Next.js build assets as immutable", () => {
    expect(isImmutableStaticAsset("/_next/static/chunks/main.abc123.js")).toBe(true);
    expect(isImmutableStaticAsset("/_next/static/css/app.css")).toBe(true);
  });

  it("does not treat ordinary pages or API routes as immutable static assets", () => {
    expect(isImmutableStaticAsset("/")).toBe(false);
    expect(isImmutableStaticAsset("/dashboard")).toBe(false);
    expect(isImmutableStaticAsset("/api/transactions")).toBe(false);
  });
});
