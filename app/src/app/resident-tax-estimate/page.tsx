import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { ResidentTaxEstimateForm } from "@/components/ResidentTaxEstimateForm";

export const metadata: Metadata = {
  title: "個人住民税 概算シミュレーター｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "所得税の課税所得金額から、翌年度に課税される見込みの個人住民税（所得割・均等割）を概算するシミュレーション（開発中プロトタイプ）。",
};

export default function ResidentTaxEstimatePage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 個人住民税 概算シミュレーター</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">個人住民税 概算シミュレーター</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            住民税（道府県民税・市町村民税）は、前年の所得に対して、その年の1月1日時点に
            住所を有する市区町村・都道府県が翌年度に課税する地方税です。確定申告で計算した
            所得税の課税所得金額を入力すると、所得割（標準税率10%）と均等割（標準額6,000円、
            森林環境税を含む）から、翌年度に課税される見込みの住民税額を概算で試算できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は標準税率・一般的な制度に基づく簡易な参考試算であり、個別具体的な
            税務相談・助言には該当しません（税理士法第2条）。調整控除は考慮していないほか、
            均等割の金額は自治体の超過課税により異なる場合があります。実際の住民税額は
            住民税決定通知書に記載された金額が正式なものであり、本ツールの概算とは異なる
            場合があります。実際の納税額の確認や申告手続きは、必ずご自身の判断で行うか、
            税理士等の専門家にご相談ください。
          </p>
        </section>

        <ResidentTaxEstimateForm />
      </PageContainer>
    </div>
  );
}
