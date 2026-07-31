import type { Metadata } from "next";
import Link from "next/link";
import { AdvisorReferralForm } from "@/components/AdvisorReferralForm";
import { ExportDataButton } from "@/components/ExportDataButton";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildDataHandoffPackage } from "@/lib/advisorReferral/dataHandoffExport";

export const metadata: Metadata = {
  title: "提携税理士への紹介（有償相談）｜税務申告AI ジャービス",
  description:
    "本サービスは自動化されたセルフ申告支援であり、個別の税務相談は行いません。より複雑なケースや安心を求める方向けに、提携税理士への紹介・有償相談をご案内します。",
};

// このページ専用のサンプルデータ。実データ（Supabase）との連携は別トラックのため、
// export/page.tsx・trial-balance/page.tsxと同じ「今ごえん合同会社」を想定した
// 小規模法人のデータ（金額はサンプル）でハンドオフパッケージの見え方を確認できるようにしている。
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
    description: "取引先との会食、打ち合わせ費用",
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

export default function AdvisorReferralPage() {
  const estimate = estimateForMicroCorp(SAMPLE_ENTRIES);
  const handoffPackage = buildDataHandoffPackage({
    entries: SAMPLE_ENTRIES,
    taxEstimate: { kind: "corporate", estimate },
    recipientLabel: "提携税理士事務所",
  });

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500">提携税理士連携（追加課金プラン）</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">提携税理士への紹介・有償相談</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            本サービスは、記帳の自動化と申告書下書きの自動生成を行う<b>セルフ申告支援ツール</b>です。
            税理士法上、個別具体的な税務相談・税務代理・税務書類の作成代行は税理士の独占業務であるため、
            当社が個別のご事情に踏み込んだ税務相談に応じることはできません。
          </p>
          <p className="text-sm text-stone-600 leading-relaxed">
            一方で、次のようなケースでは専門家に直接相談したほうが安心です。
          </p>
          <ul className="text-sm text-stone-600 list-disc list-inside space-y-1">
            <li>副業・不動産所得・相続など、自動試算の前提に当てはまらない複雑な事情がある</li>
            <li>過去の申告内容の修正や、税務調査への対応が必要</li>
            <li>法人設立・組織再編など、税務戦略そのものを相談したい</li>
            <li>自動生成された下書きの内容について、専門家の最終チェックを受けたい</li>
          </ul>
          <p className="text-sm text-stone-600 leading-relaxed">
            そこで、本サービスとは別トラックの<b>追加課金プラン（有償）</b>として、提携税理士事務所へお繋ぎする窓口を用意しています。
            紹介後の顧問契約・相談料金は提携税理士事務所との個別契約となり、本サービスの月額プランとは別料金です。
          </p>
        </section>

        <section className="border border-stone-300 bg-white p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">紹介の流れ</h2>
            <ol className="text-sm text-stone-600 list-decimal list-inside space-y-1">
              <li>下記フォームからお申し込み（この時点では課金・契約は発生しません）</li>
              <li>提携税理士事務所の担当者より、メールまたはお電話でご連絡</li>
              <li>個別相談・見積もりのうえ、ご納得いただければ提携税理士事務所と直接契約</li>
            </ol>
          </div>
          <AdvisorReferralForm />
        </section>

        <section className="border border-stone-300 bg-white p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">税理士へ渡すデータをエクスポート</h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              紹介をお申し込みいただく前後を問わず、これまでの<b>仕訳明細</b>・
              <b>合計残高試算表</b>を1つのパッケージとしてまとめて書き出せます。
              内容を説明するカバーシート（概要・対象期間・含まれるデータの一覧）も添付されるため、
              メール添付やクラウドストレージ経由でそのまま提携税理士へお渡しいただけます。
            </p>
            <p className="text-xs text-stone-500 leading-relaxed mt-2">
              現時点ではサンプルデータ（{handoffPackage.entryCount}件）でパッケージの内容を確認できます。
              本サービスがこのデータをもとに申告書を作成・提出することはありません。
            </p>
          </div>

          <dl className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-stone-500 mb-1">対象期間</dt>
              <dd>
                {handoffPackage.periodStart} 〜 {handoffPackage.periodEnd}
                {handoffPackage.spansMultipleFiscalYears && (
                  <span className="block text-xs text-red-700 mt-1">
                    複数年度（{handoffPackage.fiscalYears.join("、")}年）のデータを含みます
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500 mb-1">仕訳明細</dt>
              <dd>{handoffPackage.entryCount}件</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500 mb-1">合計残高試算表</dt>
              <dd>
                {handoffPackage.hasTrialBalanceActivity
                  ? `${handoffPackage.trialBalance.lines.length}科目（貸借${handoffPackage.trialBalance.balanced ? "一致" : "不一致"}）`
                  : "対象期間の取引がありません"}
              </dd>
            </div>
          </dl>

          <div>
            <div className="text-xs text-stone-500 mb-1">カバーシート（同梱される説明文）</div>
            <pre className="whitespace-pre-wrap text-xs text-stone-700 bg-stone-50 border border-stone-200 p-4 leading-relaxed overflow-x-auto">
              {handoffPackage.coverSheetMarkdown}
            </pre>
          </div>

          <div className="flex flex-wrap gap-3">
            <ExportDataButton
              csvContent={handoffPackage.journalExportCsv}
              fileNamePrefix="advisor-handoff-journal"
              label="仕訳明細CSVをダウンロード"
            />
            <ExportDataButton
              csvContent={handoffPackage.trialBalanceCsv}
              fileNamePrefix="advisor-handoff-trial-balance"
              label="合計残高試算表CSVをダウンロード"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページは提携税理士事務所への紹介窓口であり、当社が税務相談・税務代理を行うものではありません。
          紹介後の契約・料金は各提携税理士事務所の定めによります。お申し込み内容は紹介目的に限り提携税理士事務所と共有されます。
        </div>
      </footer>
    </div>
  );
}
