import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { OpeningBalancesClient } from "./OpeningBalancesClient";

export const metadata: Metadata = {
  title: "期首残高・固定資産・借入金の投入｜決算書作成から税務申告までワンクリック（スグル）",
  description: "前期末時点の現金残高・繰越利益剰余金・固定資産・借入金を投入し、貸借対照表の実残高計算の起点とする画面。",
};

export default function OpeningBalancesPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">期首残高・固定資産・借入金の投入</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">期首残高・固定資産・借入金の投入</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            記帳データ（journal_entries）は投入後の<b className="font-medium">変動のみ</b>を積み上げるため、
            前期末時点の貸借対照表（現金残高・繰越利益剰余金・固定資産・借入金）を最初に一度だけ投入する必要があります。
            ここで投入した内容は、貸借対照表・株主資本等変動計算書などの実残高計算の起点になります。
          </p>
          <p className="text-xs text-warning-foreground max-w-2xl leading-relaxed mt-2">
            ここでの入力は記帳・決算書作成・税額シミュレーションの前提条件として利用されるものです。
            当社が税務代理・税務相談を行うものではありません。内容は必ずご自身（または税理士等の専門家）でご確認ください。
          </p>
        </section>

        <OpeningBalancesClient />

        <Link href="/settings" className="text-xs text-muted-foreground underline underline-offset-2 self-start">
          ← 事業者設定に戻る
        </Link>
      </PageContainer>
    </div>
  );
}
