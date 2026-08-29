"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getThemePreference,
  resolveTheme,
  setThemePreference,
  ThemePreference,
} from "@/lib/settings/themePreference";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "システム" },
];

// localStorageは外部（ブラウザ）が保持する状態なので、useSyncExternalStoreで
// 読み出す。これによりSSR時と初回クライアント描画時はgetServerSnapshotの
// "system"で揃え、ハイドレーション完了後に実際の保存値へ安全に切り替わる
// （useState+useEffectでsetStateする実装だとハイドレーション不整合や
// set-state-in-effectの警告を招くため、この方式を採用している）。
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ThemePreference {
  return getThemePreference();
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

/**
 * <html>要素にdata-theme属性を設定してテーマを適用する。
 *
 * 2026-08-30変更: 以前は"system"の場合data-theme属性を削除し、globals.cssの
 * prefers-color-schemeメディアクエリにOSの設定を委ねていたが、Tailwindの
 * dark:バリアントはdata-theme属性でしか判定できない（globals.cssの
 * @custom-variant dark参照）ため、"system"であっても常にOSの現在値を解決して
 * data-theme属性に明示的に反映する。
 */
function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(preference));
}

/**
 * ライト/ダーク/システムを切り替える小さなセグメントコントロール。
 * 選択内容はlocalStorageに保存し、<html data-theme="..."> を通じて
 * globals.cssの手動上書きルールに反映する。
 */
export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 表示中のpreferenceが変わるたび（初回のシステム値解決を含む）にDOMへ反映する。
  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // "system"選択中は、OS側のprefers-color-scheme変更をライブに追従させる
  // （data-theme属性は常に明示値なので、これを行わないと選択中にOSの設定を
  // 変えてもページを再読み込みするまで反映されなくなる）。
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [preference]);

  function handleSelect(next: ThemePreference) {
    setThemePreference(next);
    notifyListeners();
  }

  return (
    <div
      role="radiogroup"
      aria-label="表示テーマ"
      className="inline-flex rounded-md border border-border p-1 gap-1"
    >
      {OPTIONS.map((opt) => {
        const selected = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => handleSelect(opt.value)}
            className={`text-sm px-3 py-1.5 rounded transition-colors ${
              selected
                ? "bg-accent text-white"
                : "text-muted-foreground hover:bg-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
