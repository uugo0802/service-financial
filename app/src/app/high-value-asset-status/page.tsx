import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { HighValueAssetStatusChecker } from "@/components/HighValueAssetStatusChecker";

export const metadata: Metadata = {
  title: "高額特定資産の取得チェッカー｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "税抜き取得価額1,000万円以上の高額特定資産を取得した場合に、免税事業者・簡易課税制度の選択が制限される課税期間（消費税法12条の4）を試算するツール（開発中プロトタイプ）。",
};

export default function HighValueAssetStatusPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-muted-foreground">MVP — 高額特定資産の取得チェッカー</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">高額特定資産の取得チェッカー</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            課税事業者が税抜き取得価額1,000万円以上の資産（高額特定資産）を取得すると、取得した課税期間及び
            その後2課税期間は、事業者免税点制度・簡易課税制度の適用が制限されます（消費税法12条の4）。
            課税期間と資産取得の情報を入力すると、この特例が適用されるか、適用される場合はいつまで
            制限されるかを機械的に試算します。
          </p>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            基準期間・特定期間の課税売上高など、課税事業者・免税事業者の基本的な判定については
            <Link href="/taxable-status" className="text-red-700 underline underline-offset-2">
              消費税課税事業者判定シミュレーター
            </Link>
            も合わせてご利用ください。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この判定は一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言には該当しません。
            自己建設高額特定資産、高額特定資産に該当する棚卸資産の調整、調整対象固定資産に係る仕入税額の調整など、
            本ツールが考慮していない特例に該当する場合は結果が変わる可能性があります。最終的な判定・申告内容は
            必ず税理士等の専門家にご確認ください。
          </p>
        </section>

        <HighValueAssetStatusChecker />
      </PageContainer>
    </div>
  );
}
