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

  it("すべてのナビゲーショングループのラベルが存在し、展開するとリンクが表示される", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    for (const group of NAV_GROUPS) {
      // デスクトップサイドバー・モバイル上部バーの両方から見つかる可能性があるが、
      // 少なくとも1つは存在することを確認する。グループ見出し自体は折りたたみ中でも表示される。
      const headers = screen.getAllByText(group.label);
      expect(headers.length).toBeGreaterThan(0);
      // 初期状態でアクティブページ（/dashboard）を含まないグループは折りたたまれているため、
      // デスクトップサイドバー側の見出しボタンをクリックして展開してから中身を確認する。
      const desktopHeader = headers.find((el) => el.closest("button")?.getAttribute("aria-expanded") === "false");
      if (desktopHeader) {
        fireEvent.click(desktopHeader.closest("button")!);
      }
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
    // "総勘定元帳"は「決算書類」グループに属し、mockPathname="/dashboard"では
    // 初期状態で折りたたまれているため、先にグループ見出しを展開する。
    fireEvent.click(within(dialog).getByText("決算書類"));
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
    const activeLinks = screen.getAllByText("仕訳入力").map((el) => el.closest("a")).filter((a) => a !== null);
    expect(activeLinks.length).toBeGreaterThan(0);
    expect(activeLinks.every((a) => a.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("デスクトップサイドバーはstickyクラスを持つ", () => {
    mockPathname = "/dashboard";
    const { container } = render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("md:sticky");
    expect(aside?.className).toContain("md:top-0");
  });

  it("「ダッシュボード」はグループ見出し（開閉ボタン）を持たない単独リンクとして描画される", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    const dashboardLinks = screen.getAllByText("ダッシュボード").map((el) => el.closest("a")).filter((a) => a !== null);
    expect(dashboardLinks.length).toBeGreaterThan(0);
    // グループ見出しボタン（aria-expanded持ち）としては存在しない
    expect(screen.queryByRole("button", { name: /^ダッシュボード/ })).toBeNull();
  });

  it("あるグループを開くと、それまで開いていた別のグループは自動的に閉じる（単一展開）", () => {
    mockPathname = "/dashboard";
    render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );
    const groupA = NAV_GROUPS.find((g) => g.links.length > 1)!;
    const groupB = NAV_GROUPS.filter((g) => g.links.length > 1)[1]!;

    const headerA = screen.getAllByText(groupA.label).map((el) => el.closest("button")).find((b) => b !== null)!;
    fireEvent.click(headerA);
    expect(headerA.getAttribute("aria-expanded")).toBe("true");

    const headerB = screen.getAllByText(groupB.label).map((el) => el.closest("button")).find((b) => b !== null)!;
    fireEvent.click(headerB);
    expect(headerB.getAttribute("aria-expanded")).toBe("true");
    expect(headerA.getAttribute("aria-expanded")).toBe("false");
  });

  it("手動でグループを開いた後にダッシュボードへ移動すると、全グループが閉じる", () => {
    const groupA = NAV_GROUPS.find((g) => g.links.length > 1)!;
    mockPathname = `/${groupA.links[0].href.replace(/^\//, "")}`;
    const { rerender } = render(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );

    const headerA = screen.getAllByText(groupA.label).map((el) => el.closest("button")).find((b) => b !== null)!;
    // 自動展開中のグループを一度閉じ、手動操作フラグを立てる。
    fireEvent.click(headerA);
    expect(headerA.getAttribute("aria-expanded")).toBe("false");

    mockPathname = "/dashboard";
    rerender(
      <AppShell>
        <p>本文</p>
      </AppShell>
    );

    const headerAAfter = screen.getAllByText(groupA.label).map((el) => el.closest("button")).find((b) => b !== null)!;
    expect(headerAAfter.getAttribute("aria-expanded")).toBe("false");
  });
});
