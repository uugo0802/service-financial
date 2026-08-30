"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getActiveNavLabel } from "@/lib/navigation/appShellNav";

/**
 * 各ページのヘッダー左側に表示するタイトル。固定のサービス名（旧「決算書作成から
 * 税務申告までワンクリック／スグル」）ではなく、現在選択中のナビゲーション項目名
 * （例:「ダッシュボード」「総勘定元帳」）を表示する。ブランド表示自体はサイドバーの
 * ロゴ（AppShellLogo）が常時担うため、ここでは重複させない。
 */
export function PageTitle() {
  const pathname = usePathname();
  const label = (pathname ? getActiveNavLabel(pathname) : null) ?? "スグル";

  return (
    <Link href="/dashboard" className="font-serif text-lg tracking-wide">
      {label}
    </Link>
  );
}
