import type { Metadata } from "next";
import { WithholdingCalculator } from "@/components/WithholdingCalculator";

export const metadata: Metadata = {
  title: "給与所得の源泉徴収税額（月額）の計算｜税務申告AI（ジャービス）",
  description:
    "マイクロ法人の一人代表が自身に支払う月々の役員報酬について、源泉徴収税額の目安と差引支給額を計算する参考ツール（開発中プロトタイプ）。",
};

export default function PayrollPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">MVP — 給与所得の源泉徴収税額（月額）の計算</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">給与所得の源泉徴収税額（月額）の計算</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            マイクロ法人（一人社長など）が唯一の役員である自分自身に毎月の役員報酬を支払う場合、
            会社側には所得税の源泉徴収・納付義務が生じます。このツールは、月額の役員報酬・給与、
            扶養親族等の数、その月の社会保険料（健康保険・厚生年金等）を入力すると、国税庁公表の
            「給与所得の源泉徴収税額表（月額表）」甲欄をブラケット近似式で再現した源泉徴収税額の
            目安と、差引支給額の概算を表示します。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            対象は「扶養控除等申告書を提出している（甲欄）」場合の月々の給与・賞与ではない通常の
            役員報酬・給与のみです。年末調整（各種所得控除の反映・年間の過不足精算）、賞与に対する
            源泉徴収、住民税の特別徴収、法定調書（源泉徴収票等）の作成には対応していません。
            これらを含む本格的な給与計算・年末調整の自動化は、本サービスのロードマップ上の
            将来フェーズで検討する範囲であり、本ツールはそのごく一部（月次の源泉徴収額の参考計算）
            のみを扱う単機能のプロトタイプです。
          </p>
          <p className="mt-2 text-xs text-amber-700 max-w-2xl leading-relaxed">
            このツールが表示する金額は、国税庁公表の「給与所得の源泉徴収税額表（月額表）」を
            1,000円刻みの実表ではなく区分ごとの速算式で近似した概算値であり、正式な源泉徴収額を
            保証するものではありません。実際の源泉徴収・納付・年末調整にあたっては、必ず国税庁
            公表の最新の税額表をご確認ください。本ツールは税務代理・税務書類の作成・個別具体的な
            税務相談には該当せず、機械的な計算結果を示すのみです。最終的な判断・実際の納付額は
            必ずご自身または税理士等の専門家にご確認ください。
          </p>
        </section>

        <WithholdingCalculator />
      </main>
    </div>
  );
}
