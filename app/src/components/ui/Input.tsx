import { InputHTMLAttributes, forwardRef } from "react";

/**
 * フォーム入力の共通スタイル。
 * 現時点のダッシュボード画面自体には入力フォームは無いが、
 * `WidgetLayoutControls` 等の将来的な拡張のために合わせて用意する。
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
        {...props}
      />
    );
  }
);
