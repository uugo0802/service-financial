"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY,
  DashboardWidgetId,
  DashboardWidgetLayout,
  getDefaultWidgetLayout,
  getWidgetLabel,
  moveWidget,
  parseWidgetLayout,
  serializeWidgetLayout,
  toggleWidgetVisibility,
} from "@/lib/dashboard/widgetLayout";

// localStorageはサーバー側で参照できないブラウザ専用APIのため、購読可能な小さな
// 外部ストアとしてモジュールスコープに閉じ込める（ReceiptUpload.tsxのカメラ対応判定
// (isCameraCaptureSupported + useSyncExternalStore)と同じ考え方）。カメラ対応判定と
// 違い、こちらはユーザー操作によって値が変わるため、変更のたびにlistenersへ通知する。

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedLayout: DashboardWidgetLayout | null = null;

function readFromLocalStorage(): DashboardWidgetLayout {
  try {
    return parseWidgetLayout(window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY));
  } catch {
    // プライベートブラウジング等でlocalStorageへのアクセス自体が例外を投げる環境でも、
    // 表示自体は既定レイアウトで継続させる（永続化だけ諦める）
    return getDefaultWidgetLayout();
  }
}

function getSnapshot(): DashboardWidgetLayout {
  if (cachedLayout === null) {
    cachedLayout = readFromLocalStorage();
  }
  return cachedLayout;
}

// サーバー上（SSR/ビルド時のプリレンダー）ではlocalStorageが存在しないため、
// 常に既定レイアウトを返す。ハイドレーション後にgetSnapshotへ切り替わる。
function getServerSnapshot(): DashboardWidgetLayout {
  return getDefaultWidgetLayout();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(next: DashboardWidgetLayout) {
  cachedLayout = next;
  try {
    window.localStorage.setItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY, serializeWidgetLayout(next));
  } catch {
    // 保存に失敗しても、このタブ内で選んだ並び順・表示設定の反映自体は継続させる
  }
  for (const listener of listeners) listener();
}

/**
 * ダッシュボードのウィジェット並び順・表示設定（localStorage永続化）を読み書きするフック。
 * WidgetLayoutControls自身に加え、実際にパネルを並べるapp/dashboard/page.tsx側からも
 * 同じフックを呼び出すことで、操作結果が即座にパネルの表示へ反映される。
 */
export function useDashboardWidgetLayout(): {
  layout: DashboardWidgetLayout;
  toggle: (id: DashboardWidgetId) => void;
  move: (id: DashboardWidgetId, direction: "up" | "down") => void;
} {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    layout,
    toggle: (id) => persist(toggleWidgetVisibility(layout, id)),
    move: (id, direction) => persist(moveWidget(layout, id, direction)),
  };
}

const buttonClass =
  "inline-flex h-7 w-7 items-center justify-center border border-border text-muted-foreground text-xs hover:border-danger hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground transition-colors";

/**
 * ダッシュボードの各パネルの表示順・表示/非表示を利用者が調整するための操作パネル。
 * ドラッグ&ドロップは使わず、上下移動ボタンと表示/非表示切り替えボタンのみのシンプルな構成。
 */
export function WidgetLayoutControls() {
  const { layout, toggle, move } = useDashboardWidgetLayout();

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-1">表示するウィジェットの並び替え</h2>
      <p className="text-xs text-muted-foreground mb-3">
        矢印で表示順を入れ替え、「表示」ボタンで各パネルの表示/非表示を切り替えられます。設定はこの端末に保存されます。
      </p>
      <ul className="flex flex-col gap-2">
        {layout.map((entry, index) => {
          const label = getWidgetLabel(entry.id);
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 border border-border rounded px-3 py-2 text-sm"
            >
              <span className={entry.visible ? "" : "text-muted-foreground line-through"}>{label}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => move(entry.id, "up")}
                  disabled={index === 0}
                  aria-label={`${label}を上に移動`}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => move(entry.id, "down")}
                  disabled={index === layout.length - 1}
                  aria-label={`${label}を下に移動`}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`${buttonClass} w-auto px-2`}
                  onClick={() => toggle(entry.id)}
                  aria-pressed={entry.visible}
                  aria-label={`${label}を${entry.visible ? "非表示" : "表示"}にする`}
                >
                  {entry.visible ? "表示中" : "非表示"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
