import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { AssetLedgerForm } from "@/components/AssetLedgerForm";
import { AssetLifecycleAlertBanner } from "@/components/AssetLifecycleAlertBanner";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "固定資産台帳・減価償却費の計算｜決算書作成から税務申告までワンクリック（スグル）",
  description: "固定資産を登録し、定額法による当期償却額・期末帳簿価額の概算シミュレーションを行うツール（開発中プロトタイプ）。",
};

export default function AssetsPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">MVP — 固定資産台帳・減価償却費の計算</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        {/*
          ライブの資産一覧（AssetLedgerFormのstate）が未連携のため、このページ単体では
          空配列を渡している（AssetLedgerForm.tsxは変更せず読み取りのみに留める方針のため）。
          資産の登録状態が共有ストア等に載った時点で、実際の assets / period を渡すこと。
        */}
        <AssetLifecycleAlertBanner assets={[]} period={{ start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` }} />

        <section>
          <h1 className="text-2xl font-semibold mb-2">固定資産台帳・減価償却費の計算</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            パソコンや車両などの固定資産を登録すると、定額法（月割り）による当期の減価償却費と期末帳簿価額を自動計算します。
            取得価額30万円未満の資産には、少額減価償却資産の特例（取得年度に全額を経費算入）も選択できます。
            資産を廃棄・スクラップ（除却）または売却した場合は、下部の「資産を除却・売却する」から未償却残高と除却損・売却損益の概算を計算できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            これはあくまで下書き作成を補助する概算シミュレーションであり、正式な減価償却費の計算書（法人税申告書 別表十六・所得税青色申告決算書の「減価償却費の計算」欄）そのものではありません。
            法定耐用年数の判定や少額減価償却資産の年間合計300万円の上限確認など、最終的な内容は必ずご自身（または税理士等の専門家）でご確認のうえ申告・記帳に反映してください。
            税務代理・個別具体的な税務相談は行っておりません。
          </p>
        </section>

        <AssetLedgerForm />
      </PageContainer>
    </div>
  );
}
