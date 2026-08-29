import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { ReconcileClient } from "./ReconcileClient";

export const metadata: Metadata = {
  title: "銀行残高突合チェック｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "取り込んだ銀行明細が期間全体を過不足なく反映しているかを、期首残高・実際の期末残高との突合で確認するツール（開発中プロトタイプ）。",
};

export default function ReconcilePage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">銀行残高突合チェック</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">銀行残高突合チェック</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            CSVで取り込んだ取引明細は、ファイルの中身自体は正しく読み込めていても、その
            <b className="font-medium">ファイルが期間全体の取引を漏れなく含んでいるか</b>までは保証されません
            （日付範囲の指定ミス、複数ページに分かれたエクスポートの一部だけの取込、銀行側のエクスポート仕様による行の欠落、等）。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            そこで、記帳の基本的なコントロールである「残高突合」を行います。
            <b className="font-medium">
              期首残高＋取り込んだ全取引の金額合計が、銀行明細に記載の実際の期末残高と一致するか
            </b>
            を確認することで、取込漏れ・重複取込を早期に発見できます。
          </p>
        </section>

        <section>
          <ReconcileClient />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される突合結果は、入力された残高と取込済みの取引データに基づく機械的な検算であり、差額の原因の最終的な特定や
          記帳内容の修正が必要かどうかの判断はご自身、または税理士等の専門家が行ってください。
        </div>
      </footer>
    </div>
  );
}
