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
 * <html>要素にdata-theme属性を設定/削除してテーマを適用する。
 * "system"の場合はdata-theme属性を削除し、globals.cssのprefers-color-scheme
 * メディアクエリにOSの設定を委ねる。
 */
function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", resolveTheme(preference));
  }
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

  function handleSelect(next: ThemePreference) {
    setThemePreference(next);
    notifyListeners();
  }

  return (
    <div
      role="radiogroup"
      aria-label="表示テーマ"
      className="inline-flex rounded-md border border-stone-300 p-1 gap-1"
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
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
