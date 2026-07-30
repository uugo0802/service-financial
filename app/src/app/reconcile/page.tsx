import type { Metadata } from "next";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { BankReconciliationPanel } from "@/components/BankReconciliationPanel";

export const metadata: Metadata = {
  title: "銀行残高突合チェック｜税務申告AI（ジャービス）",
  description:
    "取り込んだ銀行明細が期間全体を過不足なく反映しているかを、期首残高・実際の期末残高との突合で確認するツール（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。実際のアップロード・記帳フロー（app/page.tsx）とは
// 独立した自己完結型のプロトタイプ画面であり、Supabase等の実データとは連携しない。
// export/page.tsxのSAMPLE_ENTRIESと同様、「今ごえん合同会社」を想定した小規模法人の
// サンプル明細（金額はダミー）を使う。
//
// 意図的に「取込漏れ」を再現できるデータにしている: 期首残高100万円に対して
// 下記の取引合計は+18万円なので、あるべき期末残高は118万円。実際の期末残高として
// 130万円のように大きい値を入力すると「取込漏れの可能性」のヒントが、
// 118万円ちょうど（またはその近辺）を入力すると「一致」の結果が確認できる。
const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-1",
    date: "2026-06-05",
    description: "コンサルティングフィー入金（A社）",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-2",
    date: "2026-06-10",
    description: "コワーキングスペース利用料",
    amount: -32_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "WeWork月額利用料",
  },
  {
    id: "sample-3",
    date: "2026-06-18",
    description: "取引先との会食, 打ち合わせ費用",
    amount: -8_800,
    account: "接待交際費",
    taxCategory: "課税仕入10%",
    confidence: 0.82,
    source: "ai",
    note: "領収書に \"接待\" の記載あり",
  },
  {
    id: "sample-4",
    date: "2026-06-22",
    description: "会計ソフト・クラウドサービス利用料",
    amount: -12_400,
    account: "支払手数料(ソフトウェア利用料)",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-5",
    date: "2026-06-28",
    description: "資産管理コンサルティングフィー入金（B社）",
    amount: 283_200,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

const SAMPLE_OPENING_BALANCE = "1000000";

export default function ReconcilePage() {
  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">銀行残高突合チェック</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">銀行残高突合チェック</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            CSVで取り込んだ取引明細は、ファイルの中身自体は正しく読み込めていても、その
            <b className="font-medium">ファイルが期間全体の取引を漏れなく含んでいるか</b>までは保証されません
            （日付範囲の指定ミス、複数ページに分かれたエクスポートの一部だけの取込、銀行側のエクスポート仕様による行の欠落、等）。
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            そこで、記帳の基本的なコントロールである「残高突合」を行います。
            <b className="font-medium">
              期首残高＋取り込んだ全取引の金額合計が、銀行明細に記載の実際の期末残高と一致するか
            </b>
            を確認することで、取込漏れ・重複取込を早期に発見できます。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本ページは開発中のプロトタイプであり、サンプルデータを使用しています。実際のアップロード・記帳フロー
            （トップページ）とは連携していません。
          </p>
        </section>

        <section>
          <BankReconciliationPanel
            transactions={SAMPLE_TRANSACTIONS}
            initialOpeningBalance={SAMPLE_OPENING_BALANCE}
          />
        </section>
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される突合結果は、入力された残高と取込済みの取引データに基づく機械的な検算であり、差額の原因の最終的な特定や
          記帳内容の修正が必要かどうかの判断はご自身、または税理士等の専門家が行ってください。
        </div>
      </footer>
    </div>
  );
}
