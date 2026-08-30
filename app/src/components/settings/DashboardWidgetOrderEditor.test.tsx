/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY, getDefaultWidgetLayout } from "@/lib/dashboard/widgetLayout";
import { DashboardWidgetOrderEditor } from "./DashboardWidgetOrderEditor";

// dashboard/page.test.tsxと同じ理由（Vitest 4のjsdom環境はwindow.localStorageを
// 引き継がないギャップがある）で、最小限のlocalStorageスタブを用意する。
function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: createLocalStorageStub(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdomはHTML5 drag-and-dropのDataTransferを実装していないため、
// テスト内ではイベントオブジェクトへ最小限のdataTransferスタブを与える。
function makeDragEvent() {
  return { dataTransfer: {} };
}

describe("DashboardWidgetOrderEditor", () => {
  it("既定の全ウィジェットを表示順に一覧表示する", () => {
    const { container } = render(<DashboardWidgetOrderEditor />);

    // プレビュー内の実チャートが独自の<ul>/<li>を持つ場合があるため、
    // 一覧表示の件数はドラッグ対象（各ウィジェットカードのルート要素）の数で数える。
    const defaultLabels = getDefaultWidgetLayout().length;
    expect(container.querySelectorAll('li[draggable="true"]')).toHaveLength(defaultLabels);
    // プレビュー内の実チャート自身も同じラベル文言を見出しとして持つことがあるため、
    // 「少なくとも1回は表示されている」ことのみ確認する。
    expect(screen.getAllByText("取引にタグを付ける").length).toBeGreaterThan(0);
    expect(screen.getAllByText("予算実績（概要）").length).toBeGreaterThan(0);
  });

  it("表示/非表示ボタンでウィジェットの表示状態を切り替え、localStorageに反映する", () => {
    render(<DashboardWidgetOrderEditor />);

    const toggleButton = screen.getByRole("button", { name: "取引にタグを付けるを非表示にする" });
    fireEvent.click(toggleButton);

    expect(screen.getByRole("button", { name: "取引にタグを付けるを表示にする" })).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY)!);
    expect(saved.find((e: { id: string }) => e.id === "tagging").visible).toBe(false);
  });

  it("上矢印ボタンでウィジェットを1つ上に移動する", () => {
    render(<DashboardWidgetOrderEditor />);

    fireEvent.click(screen.getByRole("button", { name: "経費構成の参考比較（対売上比）を上に移動" }));

    const saved = JSON.parse(window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY)!);
    const ids = saved.map((e: { id: string }) => e.id);
    expect(ids.indexOf("benchmark")).toBeLessThan(ids.indexOf("expenseBreakdown"));
  });

  it("ドラッグ&ドロップでウィジェットの並び順を変更し、localStorageに反映する", () => {
    const { container } = render(<DashboardWidgetOrderEditor />);

    // ドラッグ対象は各ウィジェットカードのルート<li draggable>のみ（プレビュー内の
    // 実チャートが持つ可能性のあるネストした<li>は対象外にする）。
    const items = Array.from(container.querySelectorAll('li[draggable="true"]'));
    const source = items.find((li) => li.textContent?.includes("取引にタグを付ける"))!;
    const target = items.find((li) => li.textContent?.includes("サマリー指標"))!;

    fireEvent.dragStart(source, makeDragEvent());
    fireEvent.dragOver(target, makeDragEvent());
    fireEvent.drop(target, makeDragEvent());

    const saved = JSON.parse(window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY)!);
    const ids = saved.map((e: { id: string }) => e.id);
    expect(ids[0]).toBe("tagging");
  });
});
