import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { SimplifiedTaxationSimulator } from "@/components/SimplifiedTaxationSimulator";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "簡易課税 vs 原則課税 選択シミュレーター｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "当期の課税売上高（事業区分別内訳）と課税仕入高の見込みから、簡易課税・原則課税それぞれの消費税額を概算比較するシミュレーション（開発中プロトタイプ）。",
};

export default function SimplifiedTaxationPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">簡易課税 vs 原則課税 選択シミュレーター</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            基準期間の課税売上高、当期の課税売上高（事業区分別内訳）、原則課税を選んだ場合の課税仕入高の
            見込みを入力すると、簡易課税・原則課税それぞれで見込まれる消費税額を概算で比較します。
            簡易課税は基準期間の課税売上高が5,000万円以下の場合のみ選択でき、選択すると原則として
            2年間は原則課税に戻れません（2年縛り）。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言には
            該当しません。実際の消費税額は、軽減税率取引の有無や実際の取引データによって変動します。
            簡易課税・原則課税のどちらを選択すべきかは本ツールが決定するものではなく、必ず税理士等の
            専門家にご確認のうえ、ご自身の判断で選択してください。
          </p>
        </section>

        <SimplifiedTaxationSimulator />
      </PageContainer>
    </div>
  );
}
