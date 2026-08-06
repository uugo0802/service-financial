import type { Metadata } from "next";
import Link from "next/link";
import { MonthlyCloseChecklistPanel } from "./MonthlyCloseChecklistPanel";

export const metadata: Metadata = {
  title: "月次決算チェックリスト｜税務申告AI（ジャービス）",
  description:
    "銀行残高突合・入金消込・未確定の仕訳などの状態を一覧化し、当月分の記帳が締められる状態かをセルフチェックできるツール（開発中プロトタイプ）。",
};

export default function MonthlyCloseChecklistPage() {
  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">月次決算チェックリスト</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">月次決算チェックリスト</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            毎月の記帳を締める前に確認しておきたい標準的な項目（
            <b className="font-medium">銀行残高が突合済みか</b>、
            <b className="font-medium">未確定の仕訳が残っていないか</b>、
            <b className="font-medium">請求書の入金消込が完了しているか</b>
            など）を一覧化し、状態をひと目で確認できるようにします。
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            各項目の状態は、可能な限り既存の記帳・請求書データから機械的に導出します
            （銀行残高突合チェック・入金消込チェックの結果、要確認となっている仕訳の件数など）。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本ページは開発中のプロトタイプであり、サンプルデータを使用しています。実際のアップロード・記帳フロー
            （トップページ、
            <Link href="/reconcile" className="underline hover:no-underline">
              銀行残高突合チェック
            </Link>
            ）とは連携していません。
          </p>
        </section>

        <section>
          <MonthlyCloseChecklistPanel />
        </section>
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示されるチェック結果は、入力・登録されたデータに基づく機械的な集計であり、対応の要否や記帳内容の
          最終確認はご自身、または税理士等の専門家が行ってください。
        </div>
      </footer>
    </div>
  );
}
