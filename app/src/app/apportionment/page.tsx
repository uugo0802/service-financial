import type { Metadata } from "next";
import { ApportionmentCalculator } from "@/components/ApportionmentCalculator";

export const metadata: Metadata = {
  title: "家事按分（家事関連費按分）の計算｜決算書作成から税務申告までワンクリック（スグル）",
  description: "自宅の一部を事業用に使用している場合の家賃・水道光熱費・通信費等について、床面積按分または使用時間按分から必要経費となる金額を計算するツール（開発中プロトタイプ）。",
};

export default function ApportionmentPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 家事按分（家事関連費按分）の計算</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">家事按分（家事関連費按分）の計算</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
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
        </section>

        <ApportionmentCalculator />
      </main>
    </div>
  );
}
