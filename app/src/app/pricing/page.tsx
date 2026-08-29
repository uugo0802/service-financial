import type { Metadata } from "next";
import Link from "next/link";
import { PRICING_PLANS, TAX_ACCOUNTANT_MONTHLY_FEE_RANGE } from "@/lib/pricing/plans";
import { PricingTable } from "@/components/PricingTable";

export const metadata: Metadata = {
  title: "料金プラン（仮）｜決算書作成から税務申告までワンクリック スグル",
  description:
    "フリーランスは月額980円〜、マイクロ法人は月額2,980円〜。税理士顧問料より大幅に低い月額で、記帳〜申告書下書きまでを自動化するプランです（価格は現時点の試算で、今後変更となる可能性があります）。",
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export default function PricingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">料金プラン</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16 flex flex-col gap-16">
        <section className="flex flex-col gap-4 text-center items-center">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight max-w-2xl">
            税理士顧問料より、圧倒的に低い月額で。
          </h1>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            記帳の自動化から申告書下書きの作成・送信ガイドまでをAIが一気通貫でサポートします。
            人件費を持たない設計だからこそ、一般的な税理士顧問料（月
            {yen.format(TAX_ACCOUNTANT_MONTHLY_FEE_RANGE.minYen)}〜{yen.format(TAX_ACCOUNTANT_MONTHLY_FEE_RANGE.maxYen)}
            程度）よりも大幅に低い価格帯を目指しています。
          </p>
        </section>

        <section>
          <PricingTable plans={PRICING_PLANS} />
        </section>

        <section className="rounded-lg border border-border bg-surface p-6 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">税理士顧問料との比較イメージ</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            税理士に記帳・申告書作成を依頼する場合、一般的に月額
            {yen.format(TAX_ACCOUNTANT_MONTHLY_FEE_RANGE.minYen)}〜{yen.format(TAX_ACCOUNTANT_MONTHLY_FEE_RANGE.maxYen)}
            程度の顧問料がかかると言われています。本サービスはこれと同じ業務範囲を代行するものではなく、
            あくまで記帳の自動化と申告書「下書き」の自動生成、送信操作のガイドに徹することで、この顧問料と比べて
            大幅に低いランニングコストでの運用を狙っています。
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>仕訳の確認・修正はAIが自動確定し、人間のレビューは例外処理のみに絞ります</li>
            <li>申告書の下書き作成・e-Tax/eLTAX送信の手順ガイドまでを一気通貫で提供します</li>
            <li>個別具体の税務相談が必要な場合は、提携税理士への紹介窓口（別料金）をご案内します</li>
          </ul>
        </section>

        <section className="rounded-lg border border-warning-border bg-warning p-6">
          <h2 className="text-sm font-semibold text-warning-foreground mb-2">
            料金についての重要なご注意（価格は仮）
          </h2>
          <p className="text-sm text-warning-foreground leading-relaxed">
            上記の料金は現時点での試算値であり、最終的な提供価格を確定・保証するものではありません。
            競合サービスの料金調査や機能範囲の確定を経て、正式な価格は今後変更となる可能性があります。
            また、本サービスは記帳の自動化と申告書の下書き・シミュレーションの作成を行うものであり、
            税理士法に定める税務代理・税務書類の作成・税務相談を行うものではありません。
            申告書の下書き作成やe-Tax/eLTAXへの送信操作は、常にご自身の権限と判断のもとで行っていただきます。
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページに記載の料金・機能は開発中のプロトタイプに基づく暫定情報です。個別具体的な税務相談が必要な場合は、
          税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
