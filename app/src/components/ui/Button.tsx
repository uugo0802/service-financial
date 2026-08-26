import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // プライマリ: 緑背景
  primary: "bg-accent text-white hover:opacity-90",
  // セカンダリ: ボーダーのみ、背景は透明
  secondary: "border border-border bg-transparent text-foreground hover:bg-surface",
};

/**
 * プライマリ（緑背景）／セカンダリ（ボーダーのみ、背景透明）の2バリアントを持つ
 * 共通ボタンコンポーネント。
 */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`} {...props} />;
}
