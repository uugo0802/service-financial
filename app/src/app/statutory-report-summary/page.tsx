import type { Metadata } from "next";
import Link from "next/link";
import { DocumentPreviewFrame } from "@/components/ui/DocumentPreviewFrame";
import { StatutoryReportSummaryClient } from "./StatutoryReportSummaryClient";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "法定調書合計表（下書き）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "支払調書・源泉徴収票の下書きデータを区分ごとに集計し、法定調書合計表（給与所得の源泉徴収票等の法定調書合計表）の下書きを確認・印刷／PDF保存できる画面（開発中プロトタイプ）。",
};

export default function StatutoryReportSummaryPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface print:hidden">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <DocumentPreviewFrame
        as="main"
        maxWidth="4xl"
        className="flex flex-col gap-8 print:max-w-none print:px-0 print:py-0"
      >
        <section className="print:hidden">
          <h1 className="text-2xl font-semibold mb-2">法定調書合計表（下書き）</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            会社（マイクロ法人・個人事業主を問わない）が税務署へ提出する必要がある個々の法定調書
            （
            <Link href="/withholding-slip" className="underline hover:text-stone-900">
              給与所得の源泉徴収票
            </Link>
            、
            <Link href="/payment-report" className="underline hover:text-stone-900">
              報酬・料金等の支払調書
            </Link>
            など）を区分ごとに集計し、その「表紙」にあたる法定調書合計表の
            <b className="font-medium">下書き</b>を作成・印刷／PDF保存できる画面です。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            この画面は、他の下書き作成画面（給与所得の源泉徴収票・支払調書）ですでに作成した内容を人員数・支払金額・
            源泉徴収税額に区分ごとへ集計し直すだけの機能であり、新たに税額や提出要否を計算するものではありません。
            退職所得の源泉徴収票合計表・不動産の使用料等の支払調書合計表は、対応する下書き作成機能が本アプリに
            まだないため、常に0件のまま表示されます。
          </p>
          <p className="text-xs text-warning-foreground max-w-2xl leading-relaxed mt-2">
            <b className="font-medium">
              これは下書きです。提出はご自身の責任で行ってください。
            </b>
            税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。
          </p>
        </section>

        <StatutoryReportSummaryClient />
      </DocumentPreviewFrame>

      <footer className="border-t border-border bg-surface mt-4 print:hidden">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される法定調書合計表の下書きは、入力内容に基づく機械的な集計です。正式な提出前には、必ずご自身または
          税理士等の専門家が内容をご確認ください。
        </div>
      </footer>
    </div>
  );
}
