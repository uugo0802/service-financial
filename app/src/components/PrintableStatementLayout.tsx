"use client";

import type { ReactNode } from "react";
import {
  PRINT_FOOTER_NOTICE,
  buildPrintSectionPlan,
  selectPrintVisibleFields,
} from "@/lib/export/printLayout";

// ------------------------------------------------------------------
// 決算書類（貸借対照表・株主資本等変動計算書・個別注記表 等）を印刷／PDF保存
// する際に使う、A4サイズを意識したラッパーコンポーネント。
//
// window.print() を呼び出すボタンを持つため、このファイル自体はクライアント
// コンポーネントとして宣言する（"use client"）。ただし各セクションの内容
// （children相当の React 要素）はサーバーコンポーネント側（page.tsx）で
// 構築したものをそのまま props として渡してもらう想定であり、Next.jsの
// 「Server ComponentsをClient Componentsのpropsとして渡す」パターンに従う。
//
// 【法的に重要】ここで表示するヘッダー・フッター注記は、この決算書類が
// あくまで下書き・シミュレーションであり正式な決算書ではないことを示すための
// ものであり、削除・非表示にする手段をUI上に用意しないこと（印刷しても必ず
// 一緒に出力される）。文言は src/lib/export/printLayout.ts を唯一の出典とする。
// なお、紙面中央に重ねる大きな斜めの透かし文字は、視認性・見た目を理由に
// オーナーの明示的な判断で2026-08-30に撤去した（同じ注記はフッターに残す）。
// ------------------------------------------------------------------

export interface PrintableStatementSection {
  /** セクションを一意に識別するID（React keyにも使用）。 */
  id: string;
  content: ReactNode;
  /** trueの場合、このセクションの直前で強制的に改ページする（先頭セクションを除く）。 */
  forceNewPage?: boolean;
}

export interface PrintableStatementLayoutProps {
  /** ヘッダーに表示する事業者名（テナント名）。 */
  tenantName: string;
  /** ヘッダーに表示する対象期間（会計年度）のラベル。 */
  fiscalYearLabel: string;
  sections: PrintableStatementSection[];
  /** 印刷ボタンのラベル。省略時は既定の「印刷 / PDFで保存」。 */
  printButtonLabel?: string;
}

export function PrintableStatementLayout({
  tenantName,
  fiscalYearLabel,
  sections,
  printButtonLabel = "印刷 / PDFで保存",
}: PrintableStatementLayoutProps) {
  const headerFields = selectPrintVisibleFields([
    { key: "tenant", label: "事業者名", value: tenantName },
    { key: "fiscalYear", label: "対象期間", value: fiscalYearLabel },
  ]);
  const sectionPlan = buildPrintSectionPlan(
    sections.map((section) => ({ id: section.id, forceNewPage: section.forceNewPage }))
  );

  return (
    <div className="printable-statement-layout">
      {/*
        ブラウザの印刷/PDF保存ダイアログを開くだけの操作。当社が代わりに送信・提出する
        機能ではなく、あくまでこの画面をそのまま印刷／PDF化するショートカットである。
      */}
      <div className="mb-6 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        >
          {printButtonLabel}
        </button>
      </div>

      {/* 画面表示用のヘッダー（印刷時は下の固定ヘッダーに置き換わるため隠す） */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-300 pb-3 print:hidden dark:border-stone-700">
        {headerFields.map((field) => (
          <div key={field.key} className="text-sm text-stone-700 dark:text-stone-300">
            <span className="text-stone-400 dark:text-stone-500">{field.label}: </span>
            <span className="font-medium">{field.value}</span>
          </div>
        ))}
      </div>

      {/*
        印刷時のみ表示する固定ヘッダー。position: fixedにより、印刷対応ブラウザでは
        各ページの先頭に繰り返し表示される（A4・210mm幅を想定した余白）。
      */}
      <div className="hidden print:fixed print:inset-x-0 print:top-0 print:z-10 print:flex print:items-baseline print:justify-between print:border-b print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-[9pt] print:text-stone-800">
        {headerFields.map((field) => (
          <span key={field.key}>
            {field.label}: {field.value}
          </span>
        ))}
      </div>

      {/* 本文（各決算書類セクション）。A4印刷時の左右余白と、印刷用ヘッダー/フッターの分の上下パディングを確保する。 */}
      <div className="relative z-[1] flex flex-col gap-10 print:mx-auto print:w-[186mm] print:gap-6 print:pt-[14mm] print:pb-[18mm]">
        {sections.map((section, i) => (
          <div key={section.id} className={sectionPlan[i]?.className}>
            {section.content}
          </div>
        ))}
      </div>

      {/*
        印刷時のみ表示する固定フッター（透かしと同じ「下書き」の位置づけを、より
        詳細な文言で常時表示する）。position: fixedにより各ページの末尾に繰り返し
        表示される。このフッターを非表示にするUI操作は用意しない。
      */}
      <div className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:border-t print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-center print:text-[7.5pt] print:leading-snug print:text-stone-700">
        {PRINT_FOOTER_NOTICE}
      </div>
    </div>
  );
}
