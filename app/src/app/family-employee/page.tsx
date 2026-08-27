import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { FamilyEmployeeSalaryForm } from "@/components/FamilyEmployeeSalaryForm";

export const metadata: Metadata = {
  title: "青色事業専従者給与のチェック｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "青色申告の家族従業員（事業専従者）に支払う給与について、届出書の上限額との比較・必要経費算入の目安・専従者要件チェックリストを確認する参考ツール（開発中プロトタイプ）。",
};

export default function FamilyEmployeeSalaryPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500">青色事業専従者給与のチェック</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">青色事業専従者給与のチェック</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            青色申告を行っている個人事業主が、生計を一にする家族従業員（配偶者等の事業専従者）に給与を
            支払う場合、あらかじめ税務署へ提出した「青色事業専従者給与に関する届出書」に記載した上限額の
            範囲内であれば、支払った給与の全額を事業の必要経費に算入できます。このページでは、届出書の
            上限額と実際に支払った給与額を比較し、必要経費に算入できる金額の目安と、専従者としての要件
            （生計を一にする・年齢15歳以上・専ら従事）のチェックリストを表示します。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            このツールは、青色申告の承認状況や「青色事業専従者給与に関する届出書」の提出状況、実際の
            給与額が労務の対価として相当かどうかは確認しません。また、給与の支払を受ける家族従業員は
            事業主の扶養控除・配偶者控除等の対象にはならない点、家族従業員自身の給与所得としての課税は
            別途必要になる点にもご注意ください（詳しくはページ下部の注意事項をご確認ください）。
          </p>
          <p className="mt-2 text-xs text-amber-700 max-w-2xl leading-relaxed">
            このツールが表示する結果は、届出書の上限額との単純な比較に基づく目安であり、青色事業専従者
            給与の適用可否を保証するものではありません。税理士法上の税務代理・税務書類の作成・個別具体的な
            税務相談には該当せず、機械的な確認結果を示すのみです。正式な適用にあたっては、必ず国税庁公表の
            最新の資料を確認し、必要に応じて税理士等の専門家にご相談ください。
          </p>
        </section>

        <FamilyEmployeeSalaryForm />
      </PageContainer>
    </div>
  );
}
