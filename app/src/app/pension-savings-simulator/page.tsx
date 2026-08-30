import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { PensionSavingsSimulatorForm } from "@/components/PensionSavingsSimulatorForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "小規模企業共済・iDeCo 掛金シミュレーター｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "小規模企業共済・iDeCoの年間想定拠出額から、小規模企業共済等掛金控除による所得税・住民税の減少額を概算するシミュレーション（開発中プロトタイプ）。",
};

export default function PensionSavingsSimulatorPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">MVP — 小規模企業共済・iDeCo 掛金シミュレーター</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">小規模企業共済・iDeCo 掛金シミュレーター</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            小規模企業共済・iDeCo（個人型確定拠出年金）は、いずれも掛金の全額が「小規模企業共済等掛金控除」として
            上限なく所得控除の対象になる制度です。控除前の課税所得と、仮に拠出した場合の年間掛金額を入力すると、
            所得税・住民税がどの程度減る見込みかを概算で試算できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は一般的な制度・税率に基づく簡易シミュレーションであり、個別具体的な税務相談・助言には
            該当しません（税理士法第2条）。特定の金額での拠出を推奨するものではなく、実際の税額は他の控除の
            適用状況等により変動します。拠出のご判断や最終的な税額の確認は、必ずご自身で行うか、税理士等の
            専門家にご相談ください。
          </p>
        </section>

        <PensionSavingsSimulatorForm />
      </PageContainer>
    </div>
  );
}
