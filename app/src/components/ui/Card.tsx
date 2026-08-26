import { HTMLAttributes } from "react";

/**
 * サーフェス色＋ボーダー＋角丸のラッパー。
 * ダッシュボードの各セクションで都度書かれていた
 * `border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md`
 * を置き換える基本コンポーネント。影は使わず、区切りは常に1pxボーダーで表現する。
 *
 * パディングは呼び出し側で `className` から指定する（デフォルトでは付与しない）。
 */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${className}`}
      {...props}
    />
  );
}
