import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { ApportionmentCalculator } from "@/components/ApportionmentCalculator";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "床面積・時間按分の計算｜決算書作成から税務申告までワンクリック（スグル）",
  description: "自宅の一部を事業用に使用している場合の家賃・水道光熱費・通信費等について、床面積按分または使用時間按分から必要経費となる金額を計算するツール（開発中プロトタイプ）。",
};

export default function ApportionmentPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">床面積・時間按分の計算</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            自宅の一部を事業用に使用している場合、家賃・水道光熱費・通信費などの「家事関連費」は、
            事業使用割合に応じた金額のみを必要経費に算入できます。総額と按分基準（床面積按分または使用時間按分）を
            入力すると、必要経費となる金額（円未満切り捨て）を自動計算します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            このツールは入力された基準・比率に基づく機械的な計算を行うのみです。床面積・使用時間などどの按分基準や
            比率が事業の実態に照らして「合理的」と言えるかは、納税者ご自身（または税理士等の専門家）の判断事項であり、
            このツールは判定・助言を行いません。税務代理・個別具体的な税務相談には該当しませんので、最終的な判断・
            申告内容は必ずご自身または税理士等の専門家にご確認ください。
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            このページは床面積・使用時間から按分率そのものを算出する単一項目向けの簡易計算ツールです。
            複数の勘定科目をまとめて按分計算したい場合は
            <Link href="/expense-allocation" className="underline hover:text-red-700">按分計算ページ</Link>
            をご利用ください。
          </p>
        </section>

        <ApportionmentCalculator />
      </PageContainer>
    </div>
  );
}
