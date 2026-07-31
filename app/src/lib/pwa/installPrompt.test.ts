import { describe, expect, it } from "vitest";
import {
  INSTALL_PROMPT_STORAGE_KEY,
  hasSeenInstallPrompt,
  markInstallPromptSeen,
  type InstallPromptStorage,
} from "./installPrompt";

/** InstallPromptStorage を満たす単純なメモリ内モック */
function memoryStorage(initial: Record<string, string> = {}): InstallPromptStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

function throwingStorage(): InstallPromptStorage {
  return {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
  };
}

describe("hasSeenInstallPrompt", () => {
  it("returns false for a fresh user with no stored dismissal", () => {
    expect(hasSeenInstallPrompt(memoryStorage())).toBe(false);
  });

  it("returns true once the seen flag has been recorded", () => {
    expect(hasSeenInstallPrompt(memoryStorage({ [INSTALL_PROMPT_STORAGE_KEY]: "1" }))).toBe(true);
  });

  it("fails closed (treats as already seen) when storage is unavailable", () => {
    expect(hasSeenInstallPrompt(null)).toBe(true);
    expect(hasSeenInstallPrompt(undefined)).toBe(true);
    expect(hasSeenInstallPrompt(throwingStorage())).toBe(true);
  });
});

describe("markInstallPromptSeen", () => {
  it("persists the seen flag so a later check reports true", () => {
    const storage = memoryStorage();
    expect(hasSeenInstallPrompt(storage)).toBe(false);

    markInstallPromptSeen(storage);

    expect(hasSeenInstallPrompt(storage)).toBe(true);
  });

  it("does not throw when storage writes fail", () => {
    expect(() => markInstallPromptSeen(throwingStorage())).not.toThrow();
  });

  it("does not throw when storage is missing", () => {
    expect(() => markInstallPromptSeen(null)).not.toThrow();
    expect(() => markInstallPromptSeen(undefined)).not.toThrow();
  });
});
