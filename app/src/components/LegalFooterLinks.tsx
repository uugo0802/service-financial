import Link from "next/link";
import { legalDocuments } from "@/lib/legal/content";

// 利用規約・プライバシーポリシー・特定商取引法に基づく表記への導線。
// サーバーコンポーネントとして描画に関与するのみで状態を持たないため、
// ServiceWorkerRegister と同様にlayout.tsxへ差し込んでも既存UIへの影響は最小限に抑えられる。
export function LegalFooterLinks() {
  return (
    <footer className="border-t border-stone-300 bg-white print:hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-stone-500">
        {legalDocuments.map((doc) => (
          <Link key={doc.id} href={doc.path} className="hover:text-stone-700 hover:underline underline-offset-2">
            {doc.title}
          </Link>
        ))}
      </div>
    </footer>
  );
}
