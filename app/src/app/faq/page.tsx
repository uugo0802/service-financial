import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/FaqAccordion";

export const metadata: Metadata = {
  title: "よくある質問（FAQ）｜税務申告AI ジャービス",
  description:
    "本サービスの使い方や、青色申告・インボイス制度などの一般的な税制について、よくある質問にお答えします。個別具体の税務相談は行っておらず、必要な場合は提携税理士への紹介窓口をご案内します。",
};

export default function FaqPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </Link>
          <div className="text-xs text-stone-500">よくある質問</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold">よくある質問（FAQ）</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            本サービスの使い方や、確定申告・インボイス制度に関する一般的な制度の解説をまとめています。
          </p>
          <p className="text-xs text-stone-500 leading-relaxed">
            税理士法上、個別具体の税務相談・税務代理・税務書類の作成代行は税理士の独占業務のため、本ページの回答は一般的な制度解説にとどめています。
            ご自身の状況に応じた個別のご相談は、
            <Link href="/advisor-referral" className="text-red-700 underline hover:no-underline">
              提携税理士への紹介ページ
            </Link>
            からお申し込みください。
          </p>
        </section>

        <section>
          <FaqAccordion />
        </section>
      </main>

      <footer className="border-t border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページの内容は一般的な情報提供であり、個別の税務相談ではありません。制度の詳細・最新情報は国税庁・地方税共同機構等の公式情報でご確認ください。
        </div>
      </footer>
    </div>
  );
}
