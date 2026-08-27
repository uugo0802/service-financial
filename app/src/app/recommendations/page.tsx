import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { CrossSellRecommendations } from "@/components/CrossSellRecommendations";
import { CrossSellInputs, getCrossSellRecommendations } from "@/lib/recommendations/crossSell";

export const metadata: Metadata = {
  title: "関連サービスの参考情報｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "年間利益・資金繰りの傾向に基づく、投資・保険・融資・不動産に関する一般的・教育的な参考情報（個別助言ではありません）。",
};

// このページ専用のサンプル集計値（デモ表示用）。
// 実データ（dashboard 側の記帳データ）とは連携していません。
const SAMPLE_INPUTS: CrossSellInputs = {
  annualProfitYen: 6_200_000,
  cashTrend: "increasing",
};

export default function RecommendationsPage() {
  const items = getCrossSellRecommendations(SAMPLE_INPUTS);

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-8">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl leading-tight">関連サービスの参考情報</h1>
          <p className="text-stone-600 mt-3 text-sm leading-relaxed">
            これは記帳データから集計した年間利益や資金繰りの傾向をもとに、投資・保険・融資・不動産に関する一般的な参考情報をご紹介する画面です（サンプルデータで表示しています）。
            税理士法・金融商品取引法・保険業法・貸金業法・宅地建物取引業法に定める個別具体の助言や勧誘は行いません。
          </p>
        </div>

        <CrossSellRecommendations items={items} />
      </PageContainer>
    </div>
  );
}
