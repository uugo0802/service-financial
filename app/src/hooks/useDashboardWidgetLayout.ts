"use client";

import { useSyncExternalStore } from "react";
import {
  DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY,
  DashboardWidgetId,
  DashboardWidgetLayout,
  getDefaultWidgetLayout,
  moveWidget,
  parseWidgetLayout,
  reorderWidget,
  serializeWidgetLayout,
  toggleWidgetVisibility,
} from "@/lib/dashboard/widgetLayout";

// localStorageはサーバー側で参照できないブラウザ専用APIのため、購読可能な小さな
// 外部ストアとしてモジュールスコープに閉じ込める（ReceiptUpload.tsxのカメラ対応判定
// (isCameraCaptureSupported + useSyncExternalStore)と同じ考え方）。カメラ対応判定と
// 違い、こちらはユーザー操作によって値が変わるため、変更のたびにlistenersへ通知する。
//
// このフックは元々components/dashboard/WidgetLayoutControls.tsxに同居していたが、
// 並び替えUI自体をsettings/appearanceへ移設したのに合わせ、hooks/配下（他の
// useLedgerTransactions等と同じ場所）へ切り出した。dashboard/page.tsx側は並び順の
// 読み取り専用でこのフックを使い続ける。

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
 * settings/appearanceの並び替えUI（DashboardWidgetOrderEditor）と、実際にパネルを
 * 並べるapp/dashboard/page.tsx側の両方から同じフックを呼び出すことで、設定画面での
 * 操作結果が即座にダッシュボードの表示へ反映される（同一タブ内はlisteners経由、
 * 別タブはstorageイベントを購読していないため反映されない点は既存実装のまま）。
 */
export function useDashboardWidgetLayout(): {
  layout: DashboardWidgetLayout;
  toggle: (id: DashboardWidgetId) => void;
  move: (id: DashboardWidgetId, direction: "up" | "down") => void;
  reorder: (sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => void;
} {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    layout,
    toggle: (id) => persist(toggleWidgetVisibility(layout, id)),
    move: (id, direction) => persist(moveWidget(layout, id, direction)),
    reorder: (sourceId, targetId) => persist(reorderWidget(layout, sourceId, targetId)),
  };
}
