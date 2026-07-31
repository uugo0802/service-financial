import type { Metadata } from "next";
import Link from "next/link";
import { RecurringTransactionsPanel } from "@/components/RecurringTransactionsPanel";

export const metadata: Metadata = {
  title: "定期取引テンプレート｜税務申告AI（ジャービス）",
  description: "家賃・サブスクリプション費用・顧問料など毎月発生する定期取引をテンプレート登録し、記帳漏れをチェックする画面（開発中プロトタイプ）。",
};

export default function RecurringTransactionsPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500">定期取引テンプレート</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">定期取引テンプレート（記帳漏れチェック）</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            家賃・サブスクリプション費用・顧問料など、毎月ほぼ同じ内容で発生する取引をテンプレートとして登録しておくと、
            新しく取り込んだ取引との自動マッチ提案や、「発生するはずなのにまだ記帳されていない」取引の検出に使えます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mt-1">
            このツールが提示する提案・記帳漏れの判定はパターンに基づく簡易な自動チェックであり、正式な税務判断ではありません。
            最終的な勘定科目・税区分・金額の確定は必ずご自身でご確認ください（本サービスは税理士法上の税務代理・個別税務相談を行うものではなく、本人申告を支援するツールです）。
          </p>
        </div>

        <RecurringTransactionsPanel />

        <p className="text-xs text-stone-400">
          この画面は開発中のプロトタイプです。登録したテンプレートはこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
        </p>
      </main>

      <footer className="border-t border-stone-300 bg-white mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
