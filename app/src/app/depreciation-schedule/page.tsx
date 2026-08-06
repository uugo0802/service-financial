import type { Metadata } from "next";
import Link from "next/link";
import { Asset, FiscalPeriod } from "@/lib/tax/depreciation";
import { buildDepreciationScheduleForm } from "@/lib/tax/depreciationScheduleForm";
import { DepreciationScheduleTable } from "@/components/DepreciationScheduleTable";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { formatFiscalYearRange } from "@/lib/export/printLayout";

export const metadata: Metadata = {
  title: "別表十六（一）減価償却の計算に関する明細書｜税務申告AI（ジャービス）",
  description:
    "固定資産台帳の登録内容から、法人税申告書に添付する別表十六（一）（定額法による減価償却資産の償却額の計算に関する明細書）の下書きを確認できる画面（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。実データ（固定資産台帳の登録内容）との連携は
// 別トラックのため、ここでは別表十六（一）の見え方を確認できるダミーの資産一覧を
// 用意する。history/page.tsx・financial-statements/page.tsxと同じ
// 「今ごえん合同会社」を想定した小規模法人のデータ（金額はサンプル）。
const SAMPLE_ENTITY_NAME = "今ごえん合同会社";

const SAMPLE_PERIOD: FiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

const SAMPLE_ASSETS: Asset[] = [
  {
    id: "sample-asset-1",
    name: "ノートパソコン（業務用）",
    acquisitionDate: "2024-01-10",
    acquisitionCost: 480_000,
    usefulLifeYears: 4,
    method: "straight-line",
  },
  {
    id: "sample-asset-2",
    name: "オフィス什器一式",
    acquisitionDate: "2023-06-01",
    acquisitionCost: 200_000,
    usefulLifeYears: 8,
    method: "straight-line",
  },
  {
    id: "sample-asset-3",
    name: "業務用車両",
    acquisitionDate: "2026-07-15",
    acquisitionCost: 2_400_000,
    usefulLifeYears: 6,
    method: "straight-line",
  },
  {
    id: "sample-asset-4",
    name: "サーバー機器（定率法選択）",
    acquisitionDate: "2025-04-01",
    acquisitionCost: 900_000,
    usefulLifeYears: 5,
    method: "declining-balance",
  },
  {
    id: "sample-asset-5",
    name: "複合プリンター",
    acquisitionDate: "2026-05-20",
    acquisitionCost: 180_000,
    usefulLifeYears: 5,
    immediateExpensing: true,
  },
];

export default function DepreciationSchedulePage() {
  const form = buildDepreciationScheduleForm(SAMPLE_ASSETS, SAMPLE_PERIOD);
  const fiscalYearLabel = formatFiscalYearRange(SAMPLE_PERIOD.start, SAMPLE_PERIOD.end);

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">
            別表十六（一）減価償却の計算に関する明細書
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">別表十六（一）減価償却の計算に関する明細書</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            固定資産台帳（
            <Link href="/assets" className="underline hover:no-underline">
              固定資産台帳・減価償却費の計算
            </Link>
            ）に登録した資産のうち、定額法で計算している資産について、法人税申告書に添付する
            別表十六（一）の欄構成に沿った<b className="font-medium">概算の下書き</b>を表示します。
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 max-w-2xl leading-relaxed">
            これはあくまで下書き作成を補助する概算シミュレーションであり、正式に検証された別表十六（一）そのものではありません。
            定率法を選択した資産は別表十六（二）、少額減価償却資産の特例を適用した資産は別表十六（七）にそれぞれ記載すべきものですが、
            本アプリはこれらの生成には対応していません（対象外の資産は下記に一覧表示します）。
            最終的な内容は必ずご自身（または税理士等の専門家）でご確認のうえ、申告書の添付書類としてご利用ください。
            税務代理・個別具体的な税務相談は行っておりません。
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl">
            本ページは開発中のプロトタイプであり、{SAMPLE_ENTITY_NAME}を想定したサンプルの固定資産データで表示しています。
            固定資産台帳の登録状態がまだ共有ストアに連携されていないため、実際に登録した資産とは連動していません。
          </p>
        </section>

        <PrintableStatementLayout
          tenantName={SAMPLE_ENTITY_NAME}
          fiscalYearLabel={fiscalYearLabel}
          printButtonLabel="印刷 / PDFで保存（別表十六（一））"
          sections={[{ id: "depreciation-schedule", content: <DepreciationScheduleTable form={form} /> }]}
        />
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される別表十六（一）の下書きは固定資産台帳の登録内容に基づく簡易試算であり、正式な申告書添付書類ではありません。
          個別具体的な税務・会計上の相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
