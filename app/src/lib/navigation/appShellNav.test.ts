import { describe, expect, it } from "vitest";
import {
  APP_SHELL_EXCLUDED_PATHS,
  getActiveNavLabel,
  isAppShellExcludedPath,
  isNavLinkActive,
  NAV_GROUPS,
} from "./appShellNav";

describe("isAppShellExcludedPath", () => {
  it("対象外リストに含まれるパスをtrueと判定する", () => {
    for (const path of APP_SHELL_EXCLUDED_PATHS) {
      expect(isAppShellExcludedPath(path)).toBe(true);
    }
  });

  it("対象外リストに含まれないパスをfalseと判定する", () => {
    expect(isAppShellExcludedPath("/dashboard")).toBe(false);
    expect(isAppShellExcludedPath("/settings")).toBe(false);
    expect(isAppShellExcludedPath("/settings/team")).toBe(false);
  });

  it("対象外パスのサブパスは対象外にしない（完全一致のみ）", () => {
    // 例: "/login/callback" のような将来のサブルートがもしできても、
    // 明示的に対象外リストへ追加しない限りAppShellの対象に含める設計。
    expect(isAppShellExcludedPath("/login/callback")).toBe(false);
  });
});

describe("NAV_GROUPS", () => {
  const allLinks = NAV_GROUPS.flatMap((group) => group.links);

  it("グループが1つ以上存在する", () => {
    expect(NAV_GROUPS.length).toBeGreaterThan(0);
  });

  it("すべてのグループに1つ以上のリンクがある", () => {
    for (const group of NAV_GROUPS) {
      expect(group.links.length).toBeGreaterThan(0);
    }
  });

  it("リンクのhrefに重複がない", () => {
    const hrefs = allLinks.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("すべてのリンクのhrefはAppShell対象外パスと重複しない", () => {
    for (const link of allLinks) {
      expect(isAppShellExcludedPath(link.href)).toBe(false);
    }
  });

  it("すべてのリンクにラベルが設定されている", () => {
    for (const link of allLinks) {
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("ダッシュボードへのリンクを含む", () => {
    expect(allLinks.some((link) => link.href === "/dashboard")).toBe(true);
  });
});

describe("isNavLinkActive", () => {
  it("パスがリンク先と完全一致する場合はtrue", () => {
    expect(isNavLinkActive("/settings", "/settings")).toBe(true);
  });

  it("パスがリンク先のサブページの場合はtrue", () => {
    expect(isNavLinkActive("/settings/security", "/settings")).toBe(true);
  });

  it("無関係なパスの場合はfalse", () => {
    expect(isNavLinkActive("/dashboard", "/settings")).toBe(false);
  });

  it("前方一致だが別ページ（区切り文字なし）の場合はfalseにする", () => {
    // "/settings-old" は "/settings" のサブページではない
    expect(isNavLinkActive("/settings-old", "/settings")).toBe(false);
  });
});

describe("getActiveNavLabel", () => {
  it("一致するリンクがあればそのラベルを返す", () => {
    expect(getActiveNavLabel("/dashboard")).toBe("ダッシュボード");
  });

  it("サブページでも一致するリンクのラベルを返す", () => {
    expect(getActiveNavLabel("/settings/security")).toBe("セキュリティ");
  });

  it("一致するリンクがなければnullを返す", () => {
    expect(getActiveNavLabel("/no-such-page")).toBeNull();
  });
});
