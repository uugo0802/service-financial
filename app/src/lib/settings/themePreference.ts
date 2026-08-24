// ------------------------------------------------------------------
// テーマ設定（ライト/ダーク/システム）の読み書き・解決を行う純粋関数群。
// app/src/app/globals.css は prefers-color-scheme で自動追従するが、
// ここではユーザーがOSの設定とは別にアプリ内で明示的に上書きできるように、
// localStorage に希望テーマを保持し、"system" 選択時のみ OS 設定
// （window.matchMedia）を参照して実際のライト/ダークを解決する。
//
// Vitest（非ブラウザ環境）からもインポートできるよう、window/localStorage
// へのアクセスは必ず typeof window !== "undefined" でガードする。
// ------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme-preference";

const VALID_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (VALID_PREFERENCES as readonly string[]).includes(value);
}

/**
 * localStorage に保存されているテーマ設定を読み出す。
 * 未設定・不正値・ブラウザ環境外（SSR/テスト）の場合は "system" を返す。
 */
export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // localStorageが使えない環境（プライベートブラウジング等）ではsystem扱い。
    return "system";
  }
}

/**
 * テーマ設定をlocalStorageに保存する。
 * ブラウザ環境外では何もしない（安全に呼び出せる）。
 */
export function setThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // 書き込みに失敗しても（容量超過等）例外を投げずに黙って諦める。
  }
}

/**
 * OS/ブラウザのカラースキーム設定を返す。
 * matchMediaが使えない環境（SSR/テスト）では "light" を既定値として返す。
 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * テーマ設定を実際に適用すべきライト/ダークに解決する。
 * "system" の場合はOSの設定を参照する。
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return getSystemTheme();
}
