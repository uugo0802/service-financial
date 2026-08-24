"use client";

import {
  QUOTE_PRINT_NOTICE,
  QUOTE_TAX_RATE_LABELS,
  Quote,
  buildQuotePrintHeaderFields,
  formatQuoteStatusLabel,
} from "@/lib/quote/quote";

// ------------------------------------------------------------------
// 発行済み見積書1件を印刷／PDF保存するための画面レイアウト。
//
// components/InvoicePrintLayout.tsx と同じ「window.print()を呼び出すだけのブラウザ標準
// 印刷/PDF保存」方式を採用し、新規PDFライブラリへの依存を増やさない
// （docs/cto-tech-architecture.md 2章の低ランニングコスト方針に準拠）。
// window.printを呼ぶボタンを持つため、このファイルもクライアントコンポーネントとする。
//
// 見積書は「価格提示」であり契約成立・請求そのものではないため、当社が税務代理・
// 税務書類の作成・個別具体的な税務相談を行うものではないことを、印刷書面のフッターに
// 常時明記する（削除・非表示にする手段はUI上に用意しない）。文言は
// src/lib/quote/quote.ts の QUOTE_PRINT_NOTICE を唯一の出典とする。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuotePrintLayoutProps {
  quote: Quote;
  /** 印刷プレビューから元の画面（見積書フォーム）へ戻る操作。省略時は「戻る」ボタンを表示しない。 */
  onClose?: () => void;
  /** 印刷ボタンのラベル。省略時は既定の「印刷 / PDFで保存」。 */
  printButtonLabel?: string;
}

export function QuotePrintLayout({ quote, onClose, printButtonLabel = "印刷 / PDFで保存" }: QuotePrintLayoutProps) {
  const headerFields = buildQuotePrintHeaderFields(quote);
  const fieldByKey = Object.fromEntries(headerFields.map((f) => [f.key, f]));

  return (
    <div className="quote-print-layout">
      {/*
        ブラウザの印刷/PDF保存ダイアログを開くだけの操作。当社が代わりに送信・提出する
        機能ではなく、あくまでこの画面をそのまま印刷／PDF化するショートカットである。
        メール送信機能は現時点では未対応（別スコープ）。
      */}
      <div className="mb-6 flex flex-wrap justify-end gap-3 print:hidden">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            見積書一覧へ戻る
          </button>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        >
          {printButtonLabel}
        </button>
      </div>

      <div className="border border-stone-300 bg-white p-6 sm:p-10 dark:border-stone-700 dark:bg-stone-900 print:border-0 print:mx-auto print:w-[186mm] print:p-0 print:pt-[8mm] print:pb-[18mm]">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-stone-300 pb-4 dark:border-stone-700">
          <div>
            <p className="text-2xl font-serif tracking-widest">御見積書</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              {fieldByKey.clientName?.value ?? quote.clientName} 様
            </p>
          </div>
          <div className="text-right text-sm text-stone-600 dark:text-stone-300">
            {(["quoteNumber", "issueDate", "validUntil"] as const).map((key) => (
              <p key={key}>
                <span className="text-stone-400 dark:text-stone-500">{fieldByKey[key]?.label}: </span>
                {fieldByKey[key]?.value}
              </p>
            ))}
          </div>
        </div>

        <div className="mb-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {(["issuerName", "issuerRegistrationNumber"] as const).map((key) => (
            <p key={key}>
              <span className="text-stone-400 dark:text-stone-500">{fieldByKey[key]?.label}: </span>
              {fieldByKey[key]?.value}
            </p>
          ))}
        </div>

        <p className="mb-6 text-xs text-stone-500 dark:text-stone-400">
          ステータス: {formatQuoteStatusLabel(quote, todayISO())}
        </p>

        {quote.lineItems.length === 0 ? (
          <p className="text-sm text-stone-500">明細が未入力です。</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs dark:border-stone-700 dark:text-stone-400">
                  <th className="px-2 py-1.5 font-normal">品目・内容</th>
                  <th className="px-2 py-1.5 font-normal text-right">数量</th>
                  <th className="px-2 py-1.5 font-normal text-right whitespace-nowrap">単価（税抜）</th>
                  <th className="px-2 py-1.5 font-normal text-right">税率</th>
                  <th className="px-2 py-1.5 font-normal text-right whitespace-nowrap">金額（税抜）</th>
                </tr>
              </thead>
              <tbody>
                {quote.lineItems.map((item, index) => (
                  <tr
                    key={index}
                    className="border-b border-stone-100 last:border-0 dark:border-stone-800 print:break-inside-avoid"
                  >
                    <td className="px-2 py-1.5">{item.description || "（未入力）"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{item.quantity || 0}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{yen.format(item.unitPrice || 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {QUOTE_TAX_RATE_LABELS[item.taxRate]}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{yen.format(item.lineAmountExcludingTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6 print:break-inside-avoid sm:flex-row sm:justify-end">
          <table className="w-full text-sm sm:w-auto">
            <tbody>
              {quote.taxRateSubtotals.map((s) => (
                <tr key={s.taxRate}>
                  <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap dark:text-stone-400">
                    {QUOTE_TAX_RATE_LABELS[s.taxRate]} 対象額
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxableBase)}</td>
                </tr>
              ))}
              {quote.taxRateSubtotals.map((s) => (
                <tr key={`tax-${s.taxRate}`}>
                  <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap dark:text-stone-400">
                    {QUOTE_TAX_RATE_LABELS[s.taxRate]} 消費税額
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxAmount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-800 font-semibold dark:border-stone-300">
                <td className="pr-6 py-1.5 whitespace-nowrap">御見積金額合計（税込）</td>
                <td className="py-1.5 text-right tabular-nums">{yen.format(quote.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {quote.note && (
          <div className="mt-6 border-t border-stone-200 pt-4 text-sm dark:border-stone-800 print:break-inside-avoid">
            <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">備考</p>
            <p className="whitespace-pre-wrap text-stone-700 dark:text-stone-300">{quote.note}</p>
          </div>
        )}
      </div>

      {/*
        印刷時のみ表示する固定フッター。position: fixedにより各ページの末尾に繰り返し
        表示される。このフッターを非表示にするUI操作は用意しない。
      */}
      <div className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:border-t print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-center print:text-[7.5pt] print:leading-snug print:text-stone-700">
        {QUOTE_PRINT_NOTICE}
      </div>
      {/* 画面表示時は通常のフッターとして同じ注記を表示する（印刷時のみ隠す）。 */}
      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-stone-400 print:hidden">{QUOTE_PRINT_NOTICE}</p>
    </div>
  );
}
