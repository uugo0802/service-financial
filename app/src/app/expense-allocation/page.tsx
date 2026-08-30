import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseAllocationCalculator } from "@/components/ExpenseAllocationCalculator";
import { MileageAllocationCalculator } from "@/components/MileageAllocationCalculator";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "按分計算（家事按分）｜決算書作成から税務申告までワンクリック スグル",
  description:
    "自宅家賃・水道光熱費・通信費など事業用と私用が混在する経費について、入力した按分率をもとに事業経費として計上できる金額を計算します。按分率自体の妥当性についての個別税務相談は行いません。",
};

export default function ExpenseAllocationPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">按分計算（家事按分）</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            自宅の家賃・水道光熱費・通信費など、事業用と私用が混在する経費（家事関連費）については、
            床面積や使用時間などをもとにした一定の割合（按分率）でのみ必要経費に算入できます。
            このページでは、勘定科目ごとに<b>あなたが決めた按分率</b>を入力すると、
            事業経費として計上できる金額と、家事関連費（経費対象外）の金額を計算します。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            なお、按分率そのものが税務上妥当かどうかの判断（「何%が正しいか」）は、
            税理士法上、個別具体の税務相談にあたるため本サービスでは行いません。
            一般的な考え方（床面積比・使用時間比など）の解説にとどめ、必要に応じて税理士へご相談ください。
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            床面積・使用時間の実測値から按分率そのものを計算したい場合は、
            <Link href="/apportionment" className="underline hover:text-red-700">床面積・時間按分の計算ページ</Link>
            もあわせてご利用ください（算出した按分率を下のフォームに入力してご利用いただけます）。
          </p>
        </section>

        <section className="border border-border bg-surface p-6">
          <ExpenseAllocationCalculator />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">車両費：走行距離（マイレージ）からの按分計算</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            車両費（ガソリン代・車検代・自動車保険料など）については、按分率を直接入力する代わりに、
            走行距離ログ（日付・目的・事業利用km・総走行km）から事業按分率を算出することもできます。
            上記の按分率入力フォームを置き換えるものではなく、<b>車両費に限った代替の入力方法</b>です。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            こちらも、走行距離ログの記録内容や、算出された按分率が税務上妥当かどうかの判断は行いません。
            記録・保管はご自身の責任で行い、必要に応じて税理士へご相談ください。
          </p>
        </section>

        <section className="border border-border bg-surface p-6">
          <MileageAllocationCalculator />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページの計算結果は、入力された按分率をそのまま金額に適用した概算です。按分率自体の妥当性の判断や、
          個別の事情を踏まえた最終的な必要経費額の決定は、ご自身（または税理士）の確認を経てください。
        </div>
      </footer>
    </div>
  );
}
