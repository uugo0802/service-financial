import type { Metadata } from "next";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildTrialBalance, DEFAULT_CASH_ACCOUNT } from "@/lib/tax/trialBalance";
import { TrialBalanceTable } from "@/components/TrialBalanceTable";

export const metadata: Metadata = {
  title: "合計残高試算表｜決算書作成から税務申告までワンクリック（スグル）",
  description: "記帳データから勘定科目別の前期繰越高・当期発生高・残高をまとめて確認できる合計残高試算表（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。実データ（Supabase）との連携は別トラックのため、
// financial-statements/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ（金額はサンプル）。
const SAMPLE_ENTITY_NAME = "今ごえん合同会社";
const SAMPLE_CAPITAL_STOCK = 1_000_000; // 資本金（前期繰越高・貸方）
const SAMPLE_OPENING_CASH = 3_000_000; // 期首現金残高（前期繰越高・借方）

const SAMPLE_ENTRIES: CategorizedTransaction[] = [
  {
    id: "sample-1",
    date: "2026-04-10",
    description: "コンサルティングフィー入金（A社）",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-2",
    date: "2026-04-15",
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
    date: "2026-05-02",
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
    date: "2026-05-20",
    description: "会計ソフト・クラウドサービス利用料",
    amount: -12_400,
    account: "支払手数料(ソフトウェア利用料)",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-5",
    date: "2026-06-01",
    description: "資産管理コンサルティングフィー入金（B社）",
    amount: 780_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

export default function TrialBalancePage() {
  // balanceSheetForm.ts / equityChangeForm.tsと同じ簡易化：期首時点は
  // 「資産＝現金のみ・負債ゼロ」と仮定し、期首繰越利益剰余金＝期首現金－資本金として
  // 前期繰越高を組み立てる。これにより前期繰越高段階から借方合計＝貸方合計になる。
  const openingRetainedEarnings = SAMPLE_OPENING_CASH - SAMPLE_CAPITAL_STOCK;

  const tb = buildTrialBalance(SAMPLE_ENTRIES, {
    openingBalances: {
      [DEFAULT_CASH_ACCOUNT]: { debit: SAMPLE_OPENING_CASH },
      資本金: { credit: SAMPLE_CAPITAL_STOCK },
      繰越利益剰余金: { credit: openingRetainedEarnings },
    },
  });

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">合計残高試算表</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">合計残高試算表</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            記帳された取引明細から、勘定科目ごとの<b className="font-medium">前期繰越高・当期借方合計・当期貸方合計・残高</b>
            をまとめて表示します。表全体の借方合計と貸方合計が一致していることが、複式簿記の基本的な検算になります。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本サービスがこの試算表をもって申告・決算の確定を代行することはありません。
            本ページは開発中のプロトタイプであり、簡易試算であり正式な会計帳簿に基づく試算表ではありません。
            {SAMPLE_ENTITY_NAME}を想定したサンプルデータで表示しています。
          </p>
        </section>

        <TrialBalanceTable tb={tb} />
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される合計残高試算表は記帳内容に基づく簡易試算であり、正式な会計帳簿ではありません。
          個別具体的な税務・会計上の相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
