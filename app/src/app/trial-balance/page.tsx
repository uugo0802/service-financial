import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { TrialBalanceClient } from "./TrialBalanceClient";

export const metadata: Metadata = {
  title: "合計残高試算表｜決算書作成から税務申告までワンクリック（スグル）",
  description: "記帳データから勘定科目別の前期繰越高・当期発生高・残高をまとめて確認できる合計残高試算表（開発中プロトタイプ）。",
};

export default function TrialBalancePage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">合計残高試算表</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">合計残高試算表</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            記帳された取引明細から、勘定科目ごとの<b className="font-medium">前期繰越高・当期借方合計・当期貸方合計・残高</b>
            をまとめて表示します。表全体の借方合計と貸方合計が一致していることが、複式簿記の基本的な検算になります。
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            本サービスがこの試算表をもって申告・決算の確定を代行することはありません。
            本ページは開発中のプロトタイプであり、簡易試算であり正式な会計帳簿に基づく試算表ではありません。
          </p>
        </section>

        <TrialBalanceClient />
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される合計残高試算表は記帳内容に基づく簡易試算であり、正式な会計帳簿ではありません。
          個別具体的な税務・会計上の相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
