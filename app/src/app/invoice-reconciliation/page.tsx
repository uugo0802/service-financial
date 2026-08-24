import type { Metadata } from "next";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";
import { InvoicePaymentMatchPanel } from "@/components/InvoicePaymentMatchPanel";

export const metadata: Metadata = {
  title: "入金消込（請求書マッチング）｜税務申告AI（ジャービス）",
  description:
    "取り込んだ銀行の入金取引と、発行済みの未収請求書を自動で突き合わせ、どの入金がどの請求書への支払いかの候補を確認できるツール（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。実際のアップロード・請求書発行フローとは独立した
// 自己完結型のプロトタイプ画面であり、Supabase等の実データとは連携しない（reconcile/page.tsx と同様の方針）。
// 意図的に、高信頼度（金額のみで一意）・中信頼度（同額のため摘要の名寄せで絞込）・
// 部分入金・まとめ入金・未消込のパターンをそれぞれ1件以上含めている。
const SAMPLE_INVOICES: ReceivableInvoiceInput[] = [
  {
    invoiceNumber: "INV-20260601-0001",
    clientName: "A商事株式会社",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    grandTotal: 330000,
  },
  {
    invoiceNumber: "INV-20260605-0002",
    clientName: "B工業株式会社",
    issueDate: "2026-06-05",
    dueDate: "2026-07-05",
    grandTotal: 220000,
  },
  {
    invoiceNumber: "INV-20260608-0003",
    clientName: "Cデザイン合同会社",
    issueDate: "2026-06-08",
    dueDate: "2026-07-08",
    grandTotal: 220000,
  },
  {
    invoiceNumber: "INV-20260610-0004",
    clientName: "D商店",
    issueDate: "2026-06-10",
    dueDate: "2026-07-10",
    grandTotal: 500000,
  },
  {
    invoiceNumber: "INV-20260612-0005",
    clientName: "E物産株式会社",
    issueDate: "2026-06-12",
    dueDate: "2026-07-12",
    grandTotal: 150000,
  },
  {
    invoiceNumber: "INV-20260613-0006",
    clientName: "E物産株式会社",
    issueDate: "2026-06-13",
    dueDate: "2026-07-13",
    grandTotal: 250000,
  },
  {
    invoiceNumber: "INV-20260615-0007",
    clientName: "F運輸株式会社",
    issueDate: "2026-06-15",
    dueDate: "2026-07-15",
    grandTotal: 88000,
  },
];

const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-tx-1",
    date: "2026-06-20",
    description: "フリコミ）エイシヨウジ",
    amount: 330000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-tx-2",
    date: "2026-06-22",
    description: "デザイン制作費入金（Cデザイン合同会社分）",
    amount: 220000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-3",
    date: "2026-06-24",
    description: "入金 D商店",
    amount: 300000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-4",
    date: "2026-06-26",
    description: "フリコミ）エイブツサン",
    amount: 400000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-5",
    date: "2026-06-28",
    description: "身に覚えのない入金",
    amount: 77000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 0.4,
    source: "uncategorized",
  },
];

export default function InvoiceReconciliationPage() {
  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">入金消込（請求書マッチング）</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">入金消込（請求書マッチング）</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            発行済みの請求書のうち<b className="font-medium">まだ入金が確認できていないもの</b>
            （<Link href="/reconcile" className="underline hover:no-underline">未収入金・銀行残高突合</Link>
            とは別の、より具体的な単位での確認です）を、取り込んだ銀行の入金取引と自動で突き合わせます。
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            入金額が請求書の金額とちょうど一致すれば<b className="font-medium">高信頼度</b>のマッチとして、
            金額が同額の請求書が複数ある場合は振込摘要の請求先名から絞り込んだ<b className="font-medium">中信頼度</b>のマッチとして表示します。
            入金額が請求書の金額を下回る場合は<b className="font-medium">部分入金</b>、
            複数請求書の合計額と一致する場合は<b className="font-medium">まとめ入金の可能性（要確認）</b>として、
            それぞれ誤って「一致」と扱わないよう区別しています。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本ページは開発中のプロトタイプであり、サンプルデータを使用しています。実際のアップロード・請求書発行フローとは連携していません。
          </p>
        </section>

        <section>
          <InvoicePaymentMatchPanel invoices={SAMPLE_INVOICES} transactions={SAMPLE_TRANSACTIONS} />
        </section>
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示されるマッチング候補は入金額・取引摘要に基づく機械的な当たりづけであり、消込の最終確定はご自身、
          または税理士等の専門家にご確認のうえ行ってください。
        </div>
      </footer>
    </div>
  );
}
