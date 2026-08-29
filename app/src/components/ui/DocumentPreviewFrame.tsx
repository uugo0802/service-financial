import { HTMLAttributes } from "react";

export type DocumentPreviewFrameMaxWidth = "3xl" | "4xl" | "5xl";

const MAX_WIDTH_CLASS: Record<DocumentPreviewFrameMaxWidth, string> = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

export interface DocumentPreviewFrameProps extends HTMLAttributes<HTMLElement> {
  /** レンダリングする要素。ページ本文の`<main>`として使う場合は"main"を指定する（既定は"div"）。 */
  as?: "div" | "main";
  /** 最大幅（既定は"4xl"）。 */
  maxWidth?: DocumentPreviewFrameMaxWidth;
}

/**
 * 申告書・帳票・請求書・見積書等、A4相当の固定レイアウトで組まれた書類プレビュー
 * （`PrintableStatementLayout` / `InvoicePrintLayout` / `QuotePrintLayout` /
 * `DocumentPreview` 等をimportしているページ）を画面表示する際の共通フレーム。
 *
 * これらの書類は印刷時に`print:w-[186mm]`のようなA4を意識した固定幅を維持する
 * 必要があるため、`PageContainer`のように中身の幅を狭い画面に合わせて縮めることは
 * しない。代わりにフレーム自体（`overflow-x-auto`）を横スクロール可能にすることで、
 * 狭い画面でも書類のレイアウトを崩さずに確認できるようにする
 * （`print:overflow-visible`で印刷時はスクロールコンテナによる意図しないクリップを防ぐ）。
 *
 * 書類プレビュー画面は、design-refresh-foundation（2026-08-24）の時点で
 * 「常にライト固定（ダークモード非対応）」とすでに決まっている
 * （申告書・帳票の見た目を毎回同じ紙面イメージで確認できるようにするため）。
 * そのため`--background`等のダークモード対応トークンは使わず、bg-white/stone系の
 * 色を固定で使う。
 *
 * 【重要・2026-08-30に実際に踏んだ罠】このフレームの子として描画されるコンポーネント
 * （page.tsx側の説明文セクション・PrintableStatementLayout・InvoicePrintLayout・
 * QuotePrintLayout・DocumentPreview・OfficialForm等）も、同じ理由で`bg-background`
 * `text-foreground`等のトークンクラスを使ってはいけない。トークンはCSS変数
 * （`--foreground`等）経由でdata-theme属性から全ページ共通に解決されるため、
 * 「親のこのフレームだけ固定白」であっても、子がトークンクラスを使えばダークモード時に
 * ダーク用の文字色・背景色がこの固定白の紙面に乗ってしまい、コントラストが崩れる
 * （このフレーム自体がbg-whiteで、子だけダークモード対応にしても意味がない）。
 * このフレームの子孫は必ずbg-white/stone系の固定色のみを使うこと。
 */
export function DocumentPreviewFrame({
  as = "div",
  maxWidth = "4xl",
  className = "",
  children,
  ...rest
}: DocumentPreviewFrameProps) {
  const combinedClassName =
    `mx-auto w-full min-w-0 bg-white px-4 py-6 text-stone-900 sm:px-6 sm:py-8 md:py-10 ${MAX_WIDTH_CLASS[maxWidth]} ${className}`.trim();
  const content = <div className="min-w-0 overflow-x-auto print:overflow-visible">{children}</div>;

  if (as === "main") {
    return (
      <main className={combinedClassName} {...rest}>
        {content}
      </main>
    );
  }

  return (
    <div className={combinedClassName} {...rest}>
      {content}
    </div>
  );
}
