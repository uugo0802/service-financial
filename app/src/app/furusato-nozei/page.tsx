import type { Metadata } from "next";
import { FurusatoNozeiSimulatorForm } from "@/components/FurusatoNozeiSimulatorForm";

export const metadata: Metadata = {
  title: "ふるさと納税 上限額シミュレーター｜税務申告AI（ジャービス）",
  description:
    "所得税の課税所得金額・配偶者控除や扶養親族の状況から、ふるさと納税の自己負担が2,000円のままで済む年間寄附上限額を概算するシミュレーション（開発中プロトタイプ）。",
};

export default function FurusatoNozeiPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">MVP — ふるさと納税 上限額シミュレーター</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">ふるさと納税 上限額シミュレーター</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            ふるさと納税は、寄附額のうち2,000円を超える部分が所得税の還付・翌年度住民税の控除として
            戻ってくる制度ですが、住民税所得割額の20%という「特例控除」の上限があるため、これを
            超えて寄附すると自己負担が2,000円を超えてしまいます。所得税の課税所得金額と、配偶者控除・
            扶養親族の状況を入力すると、自己負担が2,000円のままで済む年間寄附額の上限の目安を
            概算で試算できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は総務省が公表している簡易計算式に基づく一般的な制度の試算であり、個別具体的な
            税務相談・助言には該当しません（税理士法第2条）。実際の住民税所得割額は住民税決定通知書に
            記載された金額が正式なものであり、本ツールの概算とは異なる場合があります。ふるさと納税
            の特例控除制度は個人向けの制度であり、マイクロ法人には適用されません。実際の寄附額の
            決定や申告手続きは、必ずご自身の判断で行うか、税理士等の専門家にご相談ください。
          </p>
        </section>

        <FurusatoNozeiSimulatorForm />
      </main>
    </div>
  );
}
