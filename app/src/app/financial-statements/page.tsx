import type { Metadata } from "next";
import Link from "next/link";
import { DocumentPreviewFrame } from "@/components/ui/DocumentPreviewFrame";
import { FinancialStatementsClient } from "./FinancialStatementsClient";

export const metadata: Metadata = {
  title: "決算書類（貸借対照表・株主資本等変動計算書・個別注記表）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "記帳データから貸借対照表・株主資本等変動計算書・個別注記表の概算下書きをまとめて確認できる画面（開発中プロトタイプ）。",
};

export default function FinancialStatementsPage() {
  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">決算書類（貸借対照表・株主資本等変動計算書・個別注記表）</div>
        </div>
      </header>

      <DocumentPreviewFrame as="main" maxWidth="4xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">決算書類（貸借対照表・株主資本等変動計算書・個別注記表）</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            記帳された取引明細と資本金・期首現金残高の入力から、貸借対照表・株主資本等変動計算書・個別注記表の
            <b className="font-medium">概算の下書き</b>をまとめて表示します。
            正式な決算書の作成・確定は、ご自身または税理士等の専門家が行ってください。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本サービスがこれらの書類をもって申告・決算の確定を代行することはありません。
            本ページは開発中のプロトタイプであり、簡易試算であり正式な決算書ではありません。
          </p>
        </section>

        <FinancialStatementsClient />
      </DocumentPreviewFrame>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される貸借対照表・株主資本等変動計算書・個別注記表は記帳内容に基づく簡易試算であり、正式な決算書ではありません。
          個別具体的な税務・会計上の相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
