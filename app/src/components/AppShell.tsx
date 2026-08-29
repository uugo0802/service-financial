"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { isAppShellExcludedPath, isNavLinkActive, NAV_GROUPS, NavGroup } from "@/lib/navigation/appShellNav";

// ------------------------------------------------------------------
// アプリ全体で共有するナビゲーションシェル。
//
// `md`（768px）未満はハンバーガーボタン→ドロワー、`md`以上は常時表示の
// 左サイドバーとする（docs/superpowers/specs/2026-08-27-responsive-app-shell-design.md
// 参照）。対象外ページ（ランディング・認証・法務等）ではchromeを一切描画せず、
// childrenをそのまま返す（`src/app/layout.tsx`に1箇所差し込むだけで済むようにするため、
// パス名判定はこのコンポーネント内で行う）。
//
// ドロワー/サイドバーには現在ログイン中のテナント名等は表示しない
// （ロゴ＋メニューのみ。テナント名表示は各ページ既存のヘッダー領域の役割のまま）。
// ------------------------------------------------------------------

/** グループに、現在アクティブなページへのリンクが含まれるかどうか。 */
function groupContainsActiveLink(group: NavGroup, pathname: string): boolean {
  return group.links.some((link) => isNavLinkActive(pathname, link.href));
}

function NavGroupList({ groups, pathname, onNavigate }: { groups: readonly NavGroup[]; pathname: string; onNavigate?: () => void }) {
  // 初期状態は「現在アクティブなページを含むグループ」のみ展開する。
  // pathnameが変わるたび（ページ遷移のたび）に、その時点でアクティブなグループへ
  // 自動的に開き直す（折りたたみ状態を明示的に操作していない限り）。
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.filter((g) => groupContainsActiveLink(g, pathname)).map((g) => g.label))
  );
  const [manuallyToggled, setManuallyToggled] = useState(false);

  useEffect(() => {
    if (manuallyToggled) return; // ユーザーが手動で開閉した後は、自動追従を止める
    setExpanded(new Set(groups.filter((g) => groupContainsActiveLink(g, pathname)).map((g) => g.label)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setManuallyToggled(true);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-1">
      {groups.map((group) => {
        const isExpanded = expanded.has(group.label);
        const panelId = `nav-group-${group.label}`;
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface"
            >
              {group.label}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {isExpanded && (
              <ul id={panelId} className="mt-1 flex flex-col gap-0.5">
                {group.links.map((link) => {
                  const active = isNavLinkActive(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-accent/10 font-medium text-accent"
                            : "text-foreground hover:bg-surface"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AppShellLogo() {
  return (
    <Link
      href="/dashboard"
      className="font-sans text-base font-semibold tracking-wide text-foreground"
    >
      スグル
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isAppShellExcludedPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* md以上: 常時表示の左サイドバー */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 md:overflow-y-auto md:border-r md:border-border md:bg-surface md:px-4 md:py-6">
        <AppShellLogo />
        <NavGroupList groups={NAV_GROUPS} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* md未満: ハンバーガーボタンを持つ上部バー */}
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={drawerOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-background"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <AppShellLogo />
        </div>

        {/* md未満: ドロワー（ハンバーガーで開閉） */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="メニューを閉じる"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 h-full w-full bg-black/40"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="メインナビゲーション"
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-4 py-6"
            >
              <div className="flex items-center justify-between">
                <AppShellLogo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="メニューを閉じる"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-background"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <NavGroupList groups={NAV_GROUPS} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
