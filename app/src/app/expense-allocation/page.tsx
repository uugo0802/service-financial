import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseAllocationCalculator } from "@/components/ExpenseAllocationCalculator";

export const metadata: Metadata = {
  title: "家事按分計算（個人事業主向け）｜税務申告AI ジャービス",
  description:
    "自宅家賃・水道光熱費・通信費など事業用と私用が混在する経費について、入力した按分率をもとに事業経費として計上できる金額を計算します。按分率自体の妥当性についての個別税務相談は行いません。",
};

export default function ExpenseAllocationPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500">個人事業主向け・家事按分計算（試験機能）</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">家事按分の計算</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            自宅の家賃・水道光熱費・通信費など、事業用と私用が混在する経費（家事関連費）については、
            床面積や使用時間などをもとにした一定の割合（按分率）でのみ必要経費に算入できます。
            このページでは、勘定科目ごとに<b>あなたが決めた按分率</b>を入力すると、
            事業経費として計上できる金額と、家事関連費（経費対象外）の金額を計算します。
          </p>
          <p className="text-sm text-stone-600 leading-relaxed">
            なお、按分率そのものが税務上妥当かどうかの判断（「何%が正しいか」）は、
            税理士法上、個別具体の税務相談にあたるため本サービスでは行いません。
            一般的な考え方（床面積比・使用時間比など）の解説にとどめ、必要に応じて税理士へご相談ください。
          </p>
        </section>

        <section className="border border-stone-300 bg-white p-6">
          <ExpenseAllocationCalculator />
        </section>
      </main>

      <footer className="border-t border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページの計算結果は、入力された按分率をそのまま金額に適用した概算です。按分率自体の妥当性の判断や、
          個別の事情を踏まえた最終的な必要経費額の決定は、ご自身（または税理士）の確認を経てください。
        </div>
      </footer>
    </div>
  );
}
