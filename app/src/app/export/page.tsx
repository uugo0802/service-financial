import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportClient } from "./ExportClient";

export const metadata: Metadata = {
  title: "記帳データのエクスポート｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "仕訳データと税額概算サマリーをCSVで書き出し、ご自身の保管や税理士への受け渡しに利用できる画面（開発中プロトタイプ）。",
};

export default function ExportPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">記帳データのエクスポート</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">記帳データをCSVで書き出す</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            これまでに記録された仕訳データと税額の概算サマリーを、Excel等で開けるCSVファイルとして書き出せます。
            <b className="font-medium"> ご自身の保管用の記録として、または税理士等の専門家にご確認いただく際の受け渡し資料としてご利用ください。</b>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            本サービスがこのデータをもとに申告を代行・提出することはありません。申告書の作成・提出はご自身、または委任された税理士等の専門家が行ってください。
          </p>
        </section>

        <ExportClient />
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          書き出されるデータは記帳内容に基づく下書き・概算情報であり、正式な申告書ではありません。
          個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
