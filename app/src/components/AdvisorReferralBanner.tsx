import Link from "next/link";

/**
 * 試算結果・書類プレビューなど「もっと複雑なケースかもしれない」とユーザーが感じやすい画面から、
 * 提携税理士への有償相談導線（追加課金プラン）へ誘導するためのバナー。
 */
export function AdvisorReferralBanner() {
  return (
    <div className="border border-stone-300 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between print:hidden">
      <div>
        <div className="text-sm font-semibold text-stone-900">この試算、もっと複雑なケースかもしれません</div>
        <p className="mt-1 text-xs text-stone-600 leading-relaxed max-w-xl">
          本サービスは自動化されたセルフ申告支援であり、個別具体的な税務相談は行っておりません。
          内容にご不安がある場合や、より複雑な事情（副業・不動産・相続など）がある場合は、
          提携税理士による有償相談をご案内できます。
        </p>
      </div>
      <Link
        href="/advisor-referral"
        className="shrink-0 self-start sm:self-center text-sm px-5 py-3 border border-stone-900 bg-white text-stone-900 hover:bg-stone-900 hover:text-white transition-colors whitespace-nowrap"
      >
        提携税理士に相談する
      </Link>
    </div>
  );
}
