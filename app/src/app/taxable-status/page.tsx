import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { TaxableStatusChecker } from "@/components/TaxableStatusChecker";

export const metadata: Metadata = {
  title: "消費税課税事業者判定シミュレーター｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "基準期間・特定期間の課税売上高、新設法人の資本金特例、インボイス発行事業者登録の有無から、当期が消費税の課税事業者・免税事業者のいずれになるかを判定するツール（開発中プロトタイプ）。",
};

export default function TaxableStatusPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 消費税課税事業者判定シミュレーター</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">消費税課税事業者判定シミュレーター</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            基準期間（原則2年前）・特定期間（原則前年の上半期6か月）の課税売上高、新設法人の資本金特例、
            インボイス発行事業者（適格請求書発行事業者）としての登録の有無を入力すると、当期が消費税の
            「課税事業者」か「免税事業者」かを、どのルールが判定の決め手になったかを示しながら計算します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この判定は一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言には該当しません。
            合併・分割、特定新規設立法人、高額特定資産の取得など、本ツールが考慮していない特例に該当する場合は
            結果が変わる可能性があります。最終的な判定・申告内容は必ず税理士等の専門家にご確認ください。
          </p>
        </section>

        <TaxableStatusChecker />
      </PageContainer>
    </div>
  );
}
