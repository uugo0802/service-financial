"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useDashboardWidgetLayout } from "@/hooks/useDashboardWidgetLayout";
import { DashboardWidgetId, getWidgetLabel } from "@/lib/dashboard/widgetLayout";

// 元々dashboard/page.tsxに直接埋め込まれていた並び替え・表示切替UI
// （旧components/dashboard/WidgetLayoutControls.tsx）をsettings/appearanceへ移設し、
// ドラッグ&ドロップでの並び替えを追加したもの。並び順・表示状態の永続化ロジック自体は
// 変更していない（hooks/useDashboardWidgetLayout.ts、localStorage）。
//
// package.jsonに軽量D&Dライブラリが入っていないため、ネイティブHTML5の
// drag-and-dropイベント（draggable + onDragStart/onDragOver/onDrop）で実装する。
// D&Dはポインタ操作前提でキーボード単体では操作できないため、既存の上下ボタン
// （moveWidget）と表示/非表示トグルはアクセシビリティのフォールバックとして残す。

const buttonClass =
  "inline-flex h-7 w-7 items-center justify-center border border-border text-muted-foreground text-xs hover:border-danger hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground transition-colors";

export function DashboardWidgetOrderEditor() {
  const { layout, toggle, move, reorder } = useDashboardWidgetLayout();
  const [draggingId, setDraggingId] = useState<DashboardWidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<DashboardWidgetId | null>(null);

  function handleDrop(targetId: DashboardWidgetId) {
    if (draggingId && draggingId !== targetId) {
      reorder(draggingId, targetId);
    }
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-1">ダッシュボードウィジェットの並び替え</h2>
      <p className="text-xs text-muted-foreground mb-3">
        ドラッグ&ドロップ、または矢印ボタンで表示順を入れ替え、「表示」ボタンで各パネルの表示/非表示を切り替えられます。設定はこの端末に保存されます。
      </p>
      <ul className="flex flex-col gap-2">
        {layout.map((entry, index) => {
          const label = getWidgetLabel(entry.id);
          const isDragOver = dragOverId === entry.id && draggingId !== entry.id;
          return (
            <li
              key={entry.id}
              draggable
              onDragStart={() => setDraggingId(entry.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(entry.id);
              }}
              onDragLeave={() => setDragOverId((prev) => (prev === entry.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(entry.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              className={`flex items-center justify-between gap-3 border rounded px-3 py-2 text-sm cursor-grab active:cursor-grabbing transition-colors ${
                isDragOver ? "border-accent" : "border-border"
              } ${draggingId === entry.id ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className={entry.visible ? "" : "text-muted-foreground line-through"}>{label}</span>
              </div>
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
