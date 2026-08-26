"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  WithholdingPaymentRecord,
  WITHHOLDING_RECONCILIATION_ASSUMPTIONS,
  reconcileWithholdingTaxCredits,
} from "@/lib/tax/withholdingTaxCreditReconciliation";
import { WithholdingCreditReconciliationPanel } from "@/components/WithholdingCreditReconciliationPanel";

// このページ専用のサンプルデータ。動作確認用で、他ページのサンプルデータとはあえて
// 切り離している。標準税率どおりに一致するケース、差異があるケース、100万円ちょうどの
// 支払、100万円を超える支払（混合税率）の両方を含めている。
const SAMPLE_RECORDS: WithholdingPaymentRecord[] = [
  {
    id: "wh-1",
    date: "2026-02-20",
    clientName: "株式会社アルファ出版",
    grossAmount: 300_000,
    recordedWithholdingTax: 30_630,
  },
  {
    id: "wh-2",
    date: "2026-04-10",
    clientName: "ベータデザイン株式会社",
    grossAmount: 450_000,
    recordedWithholdingTax: 40_000,
  },
  {
    id: "wh-3",
    date: "2026-06-01",
    clientName: "ガンマコンサルティング株式会社",
    grossAmount: 1_000_000,
    recordedWithholdingTax: 102_100,
  },
  {
    id: "wh-4",
    date: "2026-08-15",
    clientName: "デルタメディア株式会社",
    grossAmount: 1_500_000,
    recordedWithholdingTax: 204_200,
  },
  {
    id: "wh-5",
    date: "2026-09-05",
    clientName: "デルタメディア株式会社",
    grossAmount: 2_000_000,
    recordedWithholdingTax: Math.floor(2_000_000 * 0.1021), // 誤って一律10.21%が適用された例
  },
];

export default function WithholdingCreditReconciliationPage() {
  const result = useMemo(() => reconcileWithholdingTaxCredits(SAMPLE_RECORDS), []);

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500">源泉徴収税額の控除照合（下書き）</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">源泉徴収税額の控除照合（下書き）</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            デザイン・原稿執筆・コンサルティング等の報酬をクライアント（業務委託先）から受け取る際、
            クライアント側で源泉徴収された税額は、確定申告の所得税額から差し引ける税額控除になります。
            この画面は、記帳データや受け取った
            <Link href="/payment-report" className="underline hover:text-stone-900">
              支払調書
            </Link>
            をもとに、支払ごとの記録額を標準税率（10.21%／100万円超部分20.42%）から算出した期待値と突き合わせ、
            差異のある支払を洗い出したうえで、確定申告に使う源泉徴収税額の控除合計を機械的に算出する
            <b className="font-medium">下書き</b>作成画面です。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            対応しているのは「報酬、料金、契約金及び賞金」に共通する標準税率（支払1回につき100万円以下の部分10.21%・
            超える部分20.42%）のみです。ホステス等の報酬・馬主が受ける競馬の賞金など、計算方法が異なる区分はこの画面では扱っていません。
            <b className="font-medium">
              確定申告の税額控除として実際に使用できるのは、クライアントが実際に源泉徴収した金額です。
              期待値との差異は、記載内容をクライアントにご確認いただくための目安としてご利用ください。
            </b>
            税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。
          </p>
        </section>

        <section>
          <WithholdingCreditReconciliationPanel result={result} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">前提・注意事項</h2>
          <ul className="list-disc list-inside text-xs text-stone-500 leading-relaxed flex flex-col gap-1">
            {WITHHOLDING_RECONCILIATION_ASSUMPTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-stone-300 bg-white mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される金額は記帳データに基づく参考表示（下書き）です。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
