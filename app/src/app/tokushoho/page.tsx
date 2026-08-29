import type { Metadata } from "next";
import Link from "next/link";
import { getLegalDocument, splitParagraphs } from "@/lib/legal/content";

const doc = getLegalDocument("tokushoho");

export const metadata: Metadata = {
  title: `${doc.title} — 決算書作成から税務申告までワンクリック（スグル）`,
  description: doc.summary,
};

export default function TokushohoPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <Link href="/" className="font-serif text-lg tracking-wide hover:opacity-80">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">開発中プロトタイプ</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">{doc.title}</h1>
          <p className="text-xs text-muted-foreground mb-4">制定日: {doc.effectiveDate}</p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{doc.summary}</p>
        </div>

        <div className="border border-border bg-surface divide-y divide-border">
          {doc.sections.map((section) => (
            <div key={section.heading} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-2 sm:gap-6 p-5">
              <h2 className="text-sm font-semibold text-muted-foreground">{section.heading}</h2>
              <div className="text-sm text-foreground leading-relaxed flex flex-col gap-3">
                {splitParagraphs(section.body).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          関連する文書として、
          <Link href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">利用規約</Link>
          および
          <Link href="/privacy" className="underline underline-offset-2 hover:text-muted-foreground">プライバシーポリシー</Link>
          もあわせてご確認ください。
        </p>
      </main>
    </div>
  );
}
