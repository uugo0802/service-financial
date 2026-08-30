import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { PartnerReferralForm } from "@/components/PartnerReferralForm";
import { PARTNER_CATEGORIES } from "@/lib/partnerReferral/partnerReferral";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "提携パートナーのご紹介（投資・保険・ローン・不動産）｜決算書作成から税務申告までワンクリック スグル",
  description:
    "本サービスは投資助言・保険募集・貸金業・宅建業のいずれも行いません。投資・保険・ローン・不動産分野の提携パートナーへの情報提供・送客のみを行う紹介窓口です。",
};

export default function PartnerReferralPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">提携パートナー連携（情報提供・送客のみ）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">提携パートナーのご紹介</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            本サービスは、記帳の自動化と申告書下書きの自動生成を行う<b>セルフ申告支援ツール</b>です。
            投資助言業・保険募集人・貸金業・宅地建物取引業のいずれの登録・免許も保有しておらず、
            金融商品・保険商品・融資・不動産取引について、当社が個別の推奨や助言を行うことはありません。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            一方で、記帳データから見える事業の状況（黒字の継続状況や利益水準など）に応じて、
            関連しそうな分野の提携パートナーをご案内できる場合があります。以下はあくまで<b>提携先のご紹介</b>であり、
            契約・相談内容の詳細は各提携パートナーに直接ご確認ください。
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            {PARTNER_CATEGORIES.map((category) => (
              <li key={category.id}>
                <b>{category.label}</b>: {category.shortDescription}
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-surface p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">紹介の流れ</h2>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>下記フォームからお申し込み（この時点では契約・課金は発生しません）</li>
              <li>提携パートナーの担当者より、メールまたはお電話でご連絡</li>
              <li>個別のご説明・見積もりのうえ、ご納得いただければ提携パートナーと直接契約</li>
            </ol>
          </div>
          <PartnerReferralForm />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは投資・保険・ローン・不動産分野の提携パートナーへの紹介窓口であり、当社が投資助言・保険募集・金銭の貸付・
          不動産の媒介等を行うものではありません。表示されるカテゴリは記帳データの傾向に基づく機械的な絞り込みであり、
          特定の商品・取引を推奨するものではありません。紹介後の契約・料金は各提携パートナーの定めによります。
          お申し込み内容は紹介目的に限り提携パートナーと共有されます。
        </div>
      </footer>
    </div>
  );
}
