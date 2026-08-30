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

function NavLinkItem({
  href,
  label,
  pathname,
  onNavigate,
  variant = "default",
}: {
  href: string;
  label: string;
  pathname: string;
  onNavigate?: () => void;
  variant?: "default" | "standalone";
}) {
  const active = isNavLinkActive(pathname, href);
  // "standalone"（例: ダッシュボード）は、他のグループがカテゴリ見出しとして
  // 常時目にするフォントサイズ・太さ（text-base font-semibold uppercase
  // tracking-wide）に揃える。グループ見出しを持たない単独リンクだからといって
  // 通常のページリンクより見劣りしないようにするため。
  const sizeClass = variant === "standalone" ? "text-base font-semibold uppercase tracking-wide" : "text-sm";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-2 py-1.5 ${sizeClass} transition-colors ${
        active ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-surface"
      }`}
    >
      {label}
    </Link>
  );
}

/** リンクが1件だけで、そのリンクのラベルがグループ名と同じグループ（例: 「ダッシュボード」）は、
 * グループ見出し・折りたたみを持たない単独リンクとして描画する。 */
function isStandaloneGroup(group: NavGroup): boolean {
  return group.links.length === 1 && group.links[0].label === group.label;
}

function NavGroupList({ groups, pathname, onNavigate }: { groups: readonly NavGroup[]; pathname: string; onNavigate?: () => void }) {
  const collapsibleGroups = groups.filter((g) => !isStandaloneGroup(g));

  // どれか1つのグループを開いたら、他は必ず全て閉じる（複数同時展開はできない）。
  // 初期状態は「現在アクティブなページを含むグループ」を展開する。
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    () => collapsibleGroups.find((g) => groupContainsActiveLink(g, pathname))?.label ?? null
  );
  const [manuallyToggled, setManuallyToggled] = useState(false);

  useEffect(() => {
    const matchedGroup = collapsibleGroups.find((g) => groupContainsActiveLink(g, pathname))?.label ?? null;
    if (matchedGroup === null) {
      // 該当するグループがないページ（ダッシュボード等の単独リンク）に来た場合は、
      // 手動で開閉した記憶もリセットして必ず全グループを閉じる。
      setManuallyToggled(false);
      setExpandedGroup(null);
      return;
    }
    if (manuallyToggled) return; // ユーザーが手動で開閉した後は、自動追従を止める
    setExpandedGroup(matchedGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setManuallyToggled(true);
    setExpandedGroup((prev) => (prev === label ? null : label));
  }

  return (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-1">
      {groups.map((group) => {
        if (isStandaloneGroup(group)) {
          const link = group.links[0];
          return (
            <NavLinkItem
              key={group.label}
              href={link.href}
              label={link.label}
              pathname={pathname}
              onNavigate={onNavigate}
              variant="standalone"
            />
          );
        }

        const isExpanded = expandedGroup === group.label;
        const panelId = `nav-group-${group.label}`;
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-base font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface"
            >
              {group.label}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {isExpanded && (
              <ul id={panelId} className="mt-1 flex flex-col gap-0.5 pl-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <NavLinkItem href={link.href} label={link.label} pathname={pathname} onNavigate={onNavigate} />
                  </li>
                ))}
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
      className="font-sans text-lg font-semibold tracking-wide text-foreground"
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
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:gap-6 md:overflow-y-auto md:border-r md:border-border md:bg-surface md:px-4 md:py-6">
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
