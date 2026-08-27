import { HTMLAttributes } from "react";

export type PageContainerMaxWidth = "md" | "xl" | "3xl" | "4xl" | "5xl";

const MAX_WIDTH_CLASS: Record<PageContainerMaxWidth, string> = {
  md: "max-w-md",
  xl: "max-w-xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

export interface PageContainerProps extends HTMLAttributes<HTMLElement> {
  /** レンダリングする要素。ページ本文の`<main>`として使う場合は"main"を指定する（既定は"div"）。 */
  as?: "div" | "main";
  /** 最大幅。既存ページの`max-w-md/3xl/4xl/5xl`相当をそのまま指定できる（既定は"5xl"）。 */
  maxWidth?: PageContainerMaxWidth;
}

/**
 * 各ページで個別に手書きされていた `mx-auto max-w-5xl px-6 py-10` 相当のラッパーを
 * 共通化するコンポーネント。レスポンシブなpadding（狭い画面ではpx-4/py-6、`sm:`以上で
 * px-6/py-8、`md:`以上でpy-10）と`min-w-0`を内包する。
 *
 * `min-w-0`は、AppShellの本文領域のようなflex/gridアイテムの内側に置かれた際、
 * 内部の表（テーブル）等の内在幅（min-content）でこのコンテナ自身が押し広げられて
 * ページ全体が横スクロールしてしまう問題（[[design_refresh_followup]]で報告された
 * ダッシュボードの横あふれバグ）を構造的に防ぐためのもの。実際に横スクロール可能に
 * するのは中身の表側（`components/ui/TableScrollArea.tsx`）の役割で、こちらはあくまで
 * 「祖先が広がりすぎない」ことだけを担当する。
 */
export function PageContainer({ as = "div", maxWidth = "5xl", className = "", children, ...rest }: PageContainerProps) {
  const combinedClassName =
    `mx-auto w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 md:py-10 ${MAX_WIDTH_CLASS[maxWidth]} ${className}`.trim();

  if (as === "main") {
    return (
      <main className={combinedClassName} {...rest}>
        {children}
      </main>
    );
  }

  return (
    <div className={combinedClassName} {...rest}>
      {children}
    </div>
  );
}
