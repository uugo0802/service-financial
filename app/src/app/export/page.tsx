import type { Metadata } from "next";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildJournalExportCsv, taxEstimateSummaryRows } from "@/lib/export/journalExport";
import { ExportDataButton } from "@/components/ExportDataButton";

export const metadata: Metadata = {
  title: "記帳データのエクスポート｜税務申告AI（ジャービス）",
  description:
    "仕訳データと税額概算サマリーをCSVで書き出し、ご自身の保管や税理士への受け渡しに利用できる画面（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。実データ（Supabase）との連携は別トラックのため、
// ここではエクスポート機能単体の見え方を確認できるダミーの仕訳を用意する。
// history/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ（金額はサンプル）。
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

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export default function ExportPage() {
  const estimate = estimateForMicroCorp(SAMPLE_ENTRIES);
  const csv = buildJournalExportCsv({
    entries: SAMPLE_ENTRIES,
    taxEstimate: { kind: "corporate", estimate },
  });
  const summaryRows = taxEstimateSummaryRows({ kind: "corporate", estimate });
  const fileName = `journal-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">記帳データのエクスポート</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">記帳データをCSVで書き出す</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            これまでに記録された仕訳データと税額の概算サマリーを、Excel等で開けるCSVファイルとして書き出せます。
            <b className="font-medium"> ご自身の保管用の記録として、または税理士等の専門家にご確認いただく際の受け渡し資料としてご利用ください。</b>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本サービスがこのデータをもとに申告を代行・提出することはありません。申告書の作成・提出はご自身、または委任された税理士等の専門家が行ってください。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">
            仕訳明細（プレビュー）
            <span className="text-sm font-normal text-stone-500 dark:text-stone-400 ml-2">
              現時点ではサンプルデータを表示しています（{SAMPLE_ENTRIES.length}件）
            </span>
          </h2>
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal">日付</th>
                  <th className="px-3 py-2 font-normal">摘要</th>
                  <th className="px-3 py-2 font-normal text-right">金額</th>
                  <th className="px-3 py-2 font-normal">勘定科目</th>
                  <th className="px-3 py-2 font-normal">消費税区分</th>
                  <th className="px-3 py-2 font-normal">備考</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ENTRIES.map((entry) => (
                  <tr key={entry.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{entry.date}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={entry.description}>
                      {entry.description}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        entry.amount < 0 ? "text-stone-700 dark:text-stone-300" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {yen.format(entry.amount)}
                    </td>
                    <td className="px-3 py-2">{entry.account}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.taxCategory}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={entry.note}>
                      {entry.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">税額概算サマリー（プレビュー）</h2>
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <tbody>
                {summaryRows.map((row, i) => (
                  <tr key={`${row.label}-${i}`} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-2 text-stone-500 dark:text-stone-400 whitespace-nowrap align-top w-56">
                      {row.label}
                    </td>
                    <td className="px-3 py-2">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">CSVファイルをダウンロード</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              上記の仕訳明細と税額概算サマリーを1つのCSVファイルとして書き出します。
              税理士へメールで送付したり、ご自身のPC・クラウドストレージに保管したりしてご利用ください。
            </p>
          </div>
          <div>
            <ExportDataButton csvContent={csv} fileName={fileName} label="CSVをダウンロード" />
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          書き出されるデータは記帳内容に基づく下書き・概算情報であり、正式な申告書ではありません。
          個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
