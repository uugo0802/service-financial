import { HTMLAttributes } from "react";

export type BadgeTone = "positive" | "negative" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  positive: "bg-accent/10 text-accent",
  negative: "bg-danger/10 text-danger",
  neutral: "bg-border/40 text-muted-foreground",
};

/**
 * 増減率・ステータス表示用の小さいラベル。
 * `StatTile` の前年比パーセンテージ表示等に使う。
 */
export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]} ${className}`}
      {...props}
    />
  );
}
