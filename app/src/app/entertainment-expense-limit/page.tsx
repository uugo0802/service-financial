import type { Metadata } from "next";
import { EntertainmentExpenseLimitCalculator } from "@/components/EntertainmentExpenseLimitCalculator";

export const metadata: Metadata = {
  title: "交際費等の損金不算入額計算機｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "資本金1億円以下の中小法人を対象に、交際費等の定額控除限度額（年800万円、月割り）と接待飲食費の50%相当額のうち有利な方を判定し、損金算入額・損金不算入額を試算するツール（開発中プロトタイプ）。",
};

export default function EntertainmentExpenseLimitPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 交際費等の損金不算入額計算機</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">交際費等の損金不算入額計算機</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            資本金1億円以下の中小法人は、交際費等について(a)年800万円までの定額控除限度額（事業年度が
            12か月に満たない場合は月割り）と、(b)接待飲食費の50%相当額（上限なし）のうち、有利な方を
            選択して損金に算入できます（租税特別措置法61条の4）。交際費等の合計額・接待飲食費の内数・
            事業年度の月数を入力すると、有利な方を判定し、損金算入額・損金不算入額（法人税申告書
            別表四での加算対象額）を機械的に試算します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言には
            該当しません。1人当たり5,000円以下の飲食費の判定や接待飲食費の該当性判定は本ツールの対象外
            です（入力する金額は、これらの判定を済ませた後の交際費等の金額としてください）。この計算結果は
            法人税の概算試算（他の計算ツール）には自動反映されません。最終的な金額・申告内容は必ず
            税理士等の専門家にご確認ください。
          </p>
        </section>

        <EntertainmentExpenseLimitCalculator />
      </main>
    </div>
  );
}
