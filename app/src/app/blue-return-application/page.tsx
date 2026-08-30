import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { BlueReturnApplicationForm } from "./BlueReturnApplicationForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "所得税の青色申告承認申請書（下書き作成）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "これから青色申告の承認を受けようとする個人事業主向けに、所得税の青色申告承認申請書の下書きデータを作成する画面（開発中プロトタイプ）。",
};

export default function BlueReturnApplicationPage() {
  return (
    <div className="bg-background text-foreground min-h-screen print:bg-white">
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8 print:max-w-none print:px-0 print:py-0">
        <section className="print:hidden">
          <h1 className="text-2xl font-semibold mb-2">所得税の青色申告承認申請書（下書き作成）</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            これから青色申告の承認を受けようとする個人事業主（フリーランス）の方が、納税地・氏名等の基本情報、
            青色申告の承認を受けようとする年分、事業所又は所得の種類、過去の取消し・取りやめ歴、開業・事業承継の
            状況、簿記方式・備付帳簿名を入力すると、申請書の下書きデータのプレビューを表示し、印刷／PDF保存できます。
            すでに青色申告での記帳を行っている方の青色申告特別控除額（65万円/55万円/10万円）の判定は、
            別の確定申告下書き機能をご利用ください。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この画面で作成できるのは下書きデータのみです。実際の提出（e-Tax又は書面）は、内容をご自身で確認のうえ
            利用者ご自身の責任で行ってください。当社が代理で提出することはありません。個別具体的な税務相談には
            該当しませんので、最終的な判断は必要に応じて税理士等の専門家にご相談ください。
          </p>
        </section>

        <BlueReturnApplicationForm />
      </PageContainer>
    </div>
  );
}
