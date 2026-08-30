import type { Metadata } from "next";
import Link from "next/link";
import { DocumentPreviewFrame } from "@/components/ui/DocumentPreviewFrame";
import { DepreciationScheduleClient } from "./DepreciationScheduleClient";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "別表十六（一）減価償却の計算に関する明細書｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "固定資産台帳の登録内容から、法人税申告書に添付する別表十六（一）（定額法による減価償却資産の償却額の計算に関する明細書）の下書きを確認できる画面（開発中プロトタイプ）。",
};

export default function DepreciationSchedulePage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">
            別表十六（一）減価償却の計算に関する明細書
          </div>
        </div>
      </header>

      <DocumentPreviewFrame as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">別表十六（一）減価償却の計算に関する明細書</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            固定資産台帳（
            <Link href="/assets" className="underline hover:no-underline">
              固定資産台帳・減価償却費の計算
            </Link>
            ）に登録した資産のうち、定額法で計算している資産について、法人税申告書に添付する
            別表十六（一）の欄構成に沿った<b className="font-medium">概算の下書き</b>を表示します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            これはあくまで下書き作成を補助する概算シミュレーションであり、正式に検証された別表十六（一）そのものではありません。
            定率法を選択した資産は別表十六（二）、少額減価償却資産の特例を適用した資産は別表十六（七）にそれぞれ記載すべきものですが、
            本アプリはこれらの生成には対応していません（対象外の資産は下記に一覧表示します）。
            最終的な内容は必ずご自身（または税理士等の専門家）でご確認のうえ、申告書の添付書類としてご利用ください。
            税務代理・個別具体的な税務相談は行っておりません。
          </p>
        </section>

        <DepreciationScheduleClient />
      </DocumentPreviewFrame>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される別表十六（一）の下書きは固定資産台帳の登録内容に基づく簡易試算であり、正式な申告書添付書類ではありません。
          個別具体的な税務・会計上の相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
