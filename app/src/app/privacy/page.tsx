import type { Metadata } from "next";
import Link from "next/link";
import { getLegalDocument, splitParagraphs } from "@/lib/legal/content";

const doc = getLegalDocument("privacy");

export const metadata: Metadata = {
  title: `${doc.title} — 決算書作成から税務申告までワンクリック（スグル）`,
  description: doc.summary,
};

export default function PrivacyPage() {
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

        <div className="flex flex-col gap-6">
          {doc.sections.map((section) => (
            <section key={section.heading} className="border border-border bg-surface p-5">
              <h2 className="text-base font-semibold mb-2">{section.heading}</h2>
              <div className="text-sm text-foreground leading-relaxed flex flex-col gap-3">
                {splitParagraphs(section.body).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          関連する文書として、
          <Link href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">利用規約</Link>
          および
          <Link href="/tokushoho" className="underline underline-offset-2 hover:text-muted-foreground">特定商取引法に基づく表記</Link>
          もあわせてご確認ください。
        </p>
      </main>
    </div>
  );
}
