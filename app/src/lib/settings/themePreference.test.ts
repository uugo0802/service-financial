import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSystemTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
} from "./themePreference";

// このプロジェクトのvitestはデフォルトでNode環境（jsdomなし）で動作するため、
// windowはグローバルに存在しない。各テストで必要な分だけスタブし、テスト後に
// 必ず削除して他のテストファイル・後続テストに影響を与えないようにする。
function stubWindow({
  storage,
  matches,
}: {
  storage?: Record<string, string>;
  matches?: boolean;
} = {}) {
  const store = storage ?? {};
  const localStorageStub = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };

  const matchMediaStub = vi.fn().mockReturnValue({ matches: matches ?? false });

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: localStorageStub,
      matchMedia: matchMediaStub,
    },
    configurable: true,
    writable: true,
  });

  return { store, matchMediaStub };
}

function unstubWindow() {
  Reflect.deleteProperty(globalThis, "window");
}

afterEach(() => {
  unstubWindow();
});

describe("getThemePreference", () => {
  it("returns 'system' when window is unavailable (SSR/test environment)", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("returns 'system' when nothing is stored", () => {
    stubWindow();
    expect(getThemePreference()).toBe("system");
  });

  it("returns the stored preference when it is valid", () => {
    stubWindow({ storage: { "theme-preference": "dark" } });
    expect(getThemePreference()).toBe("dark");
  });

  it("falls back to 'system' for an invalid stored value", () => {
    stubWindow({ storage: { "theme-preference": "purple" } });
    expect(getThemePreference()).toBe("system");
  });

  it("falls back to 'system' (without throwing) when localStorage.getItem throws (e.g. private browsing)", () => {
    stubWindow();
    Object.defineProperty(globalThis.window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("SecurityError: localStorage is disabled");
        },
      },
      configurable: true,
    });
    expect(() => getThemePreference()).not.toThrow();
    expect(getThemePreference()).toBe("system");
  });
});

describe("setThemePreference", () => {
  it("does nothing when window is unavailable (SSR/test environment)", () => {
    expect(() => setThemePreference("dark")).not.toThrow();
  });

  it("persists the preference so it can be read back", () => {
    const { store } = stubWindow();
    setThemePreference("light");
    expect(store["theme-preference"]).toBe("light");
    expect(getThemePreference()).toBe("light");
  });

  it("silently swallows a write failure (e.g. storage quota exceeded / disabled) instead of throwing", () => {
    stubWindow();
    Object.defineProperty(globalThis.window, "localStorage", {
      value: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      configurable: true,
    });
    expect(() => setThemePreference("dark")).not.toThrow();
  });
});

describe("getSystemTheme", () => {
  it("returns 'light' when window/matchMedia is unavailable", () => {
    expect(getSystemTheme()).toBe("light");
  });

  it("returns 'dark' when the OS prefers dark mode", () => {
    stubWindow({ matches: true });
    expect(getSystemTheme()).toBe("dark");
  });

  it("returns 'light' when the OS prefers light mode", () => {
    stubWindow({ matches: false });
    expect(getSystemTheme()).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("returns 'light' and 'dark' unchanged", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves 'system' against the OS preference", () => {
    stubWindow({ matches: true });
    expect(resolveTheme("system")).toBe("dark");

    stubWindow({ matches: false });
    expect(resolveTheme("system")).toBe("light");
  });

  it("resolves 'system' to 'light' when window is unavailable", () => {
    expect(resolveTheme("system")).toBe("light");
  });
});
