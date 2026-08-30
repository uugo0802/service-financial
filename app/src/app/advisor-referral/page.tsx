import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { AdvisorReferralForm } from "@/components/AdvisorReferralForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "提携税理士への紹介（有償相談）｜決算書作成から税務申告までワンクリック スグル",
  description:
    "本サービスは自動化されたセルフ申告支援であり、個別の税務相談は行いません。より複雑なケースや安心を求める方向けに、提携税理士への紹介・有償相談をご案内します。",
};

export default function AdvisorReferralPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">提携税理士への紹介・有償相談</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            本サービスは、記帳の自動化と申告書下書きの自動生成を行う<b>セルフ申告支援ツール</b>です。
            税理士法上、個別具体的な税務相談・税務代理・税務書類の作成代行は税理士の独占業務であるため、
            当社が個別のご事情に踏み込んだ税務相談に応じることはできません。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            一方で、次のようなケースでは専門家に直接相談したほうが安心です。
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>副業・不動産所得・相続など、自動試算の前提に当てはまらない複雑な事情がある</li>
            <li>過去の申告内容の修正や、税務調査への対応が必要</li>
            <li>法人設立・組織再編など、税務戦略そのものを相談したい</li>
            <li>自動生成された下書きの内容について、専門家の最終チェックを受けたい</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            そこで、本サービスとは別トラックの<b>追加課金プラン（有償）</b>として、提携税理士事務所へお繋ぎする窓口を用意しています。
            紹介後の顧問契約・相談料金は提携税理士事務所との個別契約となり、本サービスの月額プランとは別料金です。
          </p>
        </section>

        <section className="border border-border bg-surface p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">紹介の流れ</h2>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>下記フォームからお申し込み（この時点では課金・契約は発生しません）</li>
              <li>提携税理士事務所の担当者より、メールまたはお電話でご連絡</li>
              <li>個別相談・見積もりのうえ、ご納得いただければ提携税理士事務所と直接契約</li>
            </ol>
          </div>
          <AdvisorReferralForm />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは提携税理士事務所への紹介窓口であり、当社が税務相談・税務代理を行うものではありません。
          紹介後の契約・料金は各提携税理士事務所の定めによります。お申し込み内容は紹介目的に限り提携税理士事務所と共有されます。
        </div>
      </footer>
    </div>
  );
}
