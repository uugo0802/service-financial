import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { HousingLoanDeductionForm } from "@/components/HousingLoanDeductionForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "住宅ローン控除シミュレーター｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "年末時点の住宅ローン残高から、住宅借入金等特別控除（住宅ローン控除）による税額控除額を概算するシミュレーション（開発中プロトタイプ）。",
};

export default function HousingLoanDeductionPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">住宅ローン控除（住宅借入金等特別控除）シミュレーター</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            住宅ローン控除は、年末時点の住宅ローン残高に控除率（現行0.7%）を乗じた金額が、その年分の所得税額から
            直接差し引かれる「税額控除」です（所得から差し引く所得控除とは異なります）。年末残高を入力すると、
            その年分の控除額の見込みを概算で試算できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この試算は一般的な制度に基づく簡易シミュレーションであり、個別具体的な税務相談・助言には
            該当しません（税理士法第2条）。借入限度額は住宅の種類（認定住宅・ZEH水準省エネ住宅・既存住宅等）に
            よって異なり、本ツールの既定値は簡易な仮定にすぎません。また、適用を受ける最初の年分は年末調整では
            処理できず、必ず確定申告が必要です。実際の適用可否・控除額の確認は、必ずご自身で行うか、税理士等の
            専門家にご相談ください。
          </p>
        </section>

        <HousingLoanDeductionForm />
      </PageContainer>
    </div>
  );
}
