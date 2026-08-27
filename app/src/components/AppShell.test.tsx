/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { NAV_GROUPS } from "@/lib/navigation/appShellNav";

// usePathnameはNext.jsのルーター文脈に依存するため、テストでは差し替え可能にする。
let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップ（afterEachへのグローバル登録）が
// 効かない。各テスト間でJSDOMのdocumentに前のrender()の要素が残り続け、
// screen.getByXxxが複数要素にマッチしてしまうため、明示的にクリーンアップする。
afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("対象外ページ（例: ログイン画面）ではchromeを描画せず、childrenのみ描画する", () => {
    mockPathname = "/login";
    render(
      <AppShell>
        <p>ログイン画面の本文</p>
      </AppShell>
    );
    expect(screen.getByText("ログイン画面の本文")).toBeTruthy();
    expect(screen.queryByLabelText("メニューを開く")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("トップページ（対象外）でもchromeを描画しない", () => {
    mockPathname = "/";
    render(
      <AppShell>
        <p>トップページの本文</p>
      </AppShell>
    );
    expect(screen.queryByLabelText("メニューを開く")).toBeNull();
  });

  it("対象ページではハンバーガーボタンと子要素の両方を描画する", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>ダッシュボード本文</p>
      </AppShell>
    );
    expect(screen.getByText("ダッシュボード本文")).toBeTruthy();
    expect(screen.getByLabelText("メニューを開く")).toBeTruthy();
  });

  it("すべてのナビゲーショングループ・リンクのラベルが存在する", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    for (const group of NAV_GROUPS) {
      // デスクトップサイドバー・モバイル上部バーの両方から見つかる可能性があるが、
      // 少なくとも1つは存在することを確認する。
      expect(screen.getAllByText(group.label).length).toBeGreaterThan(0);
      for (const link of group.links) {
        expect(screen.getAllByText(link.label).length).toBeGreaterThan(0);
      }
    }
  });

  it("初期状態ではドロワー（モーダルダイアログ）は閉じている", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ハンバーガーボタンを押すとドロワーが開く", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    expect(screen.getByRole("dialog", { name: "メインナビゲーション" })).toBeTruthy();
  });

  it("ドロワーを閉じるボタンを押すとドロワーが閉じる", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog", { name: "メインナビゲーション" });
    fireEvent.click(within(dialog).getByLabelText("メニューを閉じる"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("背景（バックドロップ）をクリックするとドロワーが閉じる", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("メニューを閉じる", { selector: "button.absolute" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ドロワー内のナビゲーションリンクをクリックするとドロワーが閉じる", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog", { name: "メインナビゲーション" });
    fireEvent.click(within(dialog).getByText("総勘定元帳"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("現在のページに対応するリンクにaria-current=pageが付く", () => {
    mockPathname = "/journal";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    const activeLinks = screen.getAllByText("仕訳入力").map((el) => el.closest("a"));
    expect(activeLinks.every((a) => a?.getAttribute("aria-current") === "page")).toBe(true);
  });
});
