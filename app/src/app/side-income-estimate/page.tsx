import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { SideIncomeEstimateForm } from "@/components/SideIncomeEstimateForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "給与所得+事業所得（副業）の合算税額シミュレーション｜決算書作成から税務申告までワンクリック スグル",
  description:
    "会社員としての給与収入と、副業・個人事業の事業所得を合算した総合課税の所得税額を概算します。給与所得控除の計算を含む概算シミュレーションであり、個別の税務相談・助言ではありません。",
};

export default function SideIncomeEstimatePage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">給与所得 + 事業所得（副業）の合算税額シミュレーション</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            会社員として給与を受け取りながら、副業や個人事業（フリーランス収入）もお持ちの方向けの機能です。
            給与所得と事業所得は、いずれも「総合課税」の対象として合算し、同一の超過累進税率表に基づいて
            所得税額を計算します。このページでは、給与収入から給与所得控除を差し引いた給与所得と、
            副業の事業所得を合算した場合のおおよその所得税額（概算）を計算します。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            なお、これは一般的な制度に基づく概算シミュレーションであり、個別具体の税務相談・助言には
            あたりません（税理士法上、個別の税務相談は税理士の独占業務のため、本サービスでは行いません）。
            社会保険料控除・配偶者控除など、給与所得側・事業所得側いずれについても一部の所得控除は
            含まれていないため、実際の税額とは異なる場合があります。正確な金額は必ずご自身（または税理士）の
            確認を経てください。
          </p>
        </section>

        <section className="border border-border bg-surface p-6">
          <SideIncomeEstimateForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">よくある注意点</h2>
          <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
            <li>
              副業の所得が「事業所得」ではなく「雑所得」に区分される場合があります。区分によって
              青色申告特別控除の適用可否などが変わるため、区分に迷う場合は税理士にご相談ください。
            </li>
            <li>
              給与から天引きされている源泉徴収税額や、年末調整との過不足精算は、このシミュレーションには
              含まれていません。
            </li>
            <li>住民税・事業税は別途計算されるため、このページの金額には含まれていません。</li>
          </ul>
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページの計算結果は、給与収入と事業所得（副業）に基づく所得税額の概算であり、正式な確定申告書の
          計算ではありません。社会保険料控除・配偶者控除など一部の所得控除は含まれておらず、個別の事情を
          踏まえた最終的な税額の確認は、ご自身（または税理士）の確認を経てください。
        </div>
      </footer>
    </div>
  );
}
