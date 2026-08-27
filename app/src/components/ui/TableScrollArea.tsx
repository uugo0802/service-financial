import { HTMLAttributes } from "react";

export interface TableScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** 内側の横スクロール要素（overflow-x-auto）に追加するクラス（枠線・角丸等）。 */
  innerClassName?: string;
}

/**
 * 横に長くなりがちな表（テーブル）を、狭い画面でもページ全体を横スクロールさせずに
 * 表示するための共通ラッパー。
 *
 * [[design_refresh_followup]]で報告された不具合の根本原因は、`overflow-x-auto`を
 * 表側に付けるだけでは、祖先のflex/gridコンテナがデフォルトの`min-width: auto`
 * （flexアイテムの自動最小サイズ）により表の内在幅まで広がってしまい、結局ページ全体が
 * 横スクロールしてしまうことだった。このコンポーネントのルート要素に`min-w-0`を
 * 付けることで、このコンポーネント自身がflex/gridアイテムとして配置された場合に
 * 祖先へ広がりが伝播するのを止め、内側の`overflow-x-auto`要素だけが実際に
 * 横スクロールするようにする（`components/ui/PageContainer.tsx`のコメントも参照）。
 */
export function TableScrollArea({ className = "", innerClassName = "", children, ...rest }: TableScrollAreaProps) {
  return (
    <div className={`min-w-0 ${className}`.trim()} {...rest}>
      <div className={`overflow-x-auto ${innerClassName}`.trim()}>{children}</div>
    </div>
  );
}
