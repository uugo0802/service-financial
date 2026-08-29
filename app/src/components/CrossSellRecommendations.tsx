"use client";

import { CrossSellCategory, CrossSellRecommendation } from "@/lib/recommendations/crossSell";

const CATEGORY_LABEL: Record<CrossSellCategory, string> = {
  investment: "投資",
  insurance: "保険",
  loan: "融資",
  realEstate: "不動産",
};

const CATEGORY_BADGE_CLASS: Record<CrossSellCategory, string> = {
  investment: "bg-emerald-50 text-emerald-700 border-emerald-200",
  insurance: "bg-sky-50 text-sky-700 border-sky-200",
  loan: "bg-amber-50 text-amber-700 border-amber-200",
  realEstate: "bg-purple-50 text-purple-700 border-purple-200",
};

function RecommendationCard({ item }: { item: CrossSellRecommendation }) {
  return (
    <div className="border border-border bg-surface rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-block text-xs font-semibold border rounded-full px-2.5 py-0.5 ${CATEGORY_BADGE_CLASS[item.category]}`}
        >
          {CATEGORY_LABEL[item.category]}
        </span>
      </div>
      <h3 className="font-serif text-base leading-snug">{item.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
      <p className="text-xs text-amber-700 border-t border-stone-200 pt-3 mt-1 leading-relaxed">{item.disclaimer}</p>
    </div>
  );
}

export function CrossSellRecommendations({ items }: { items: CrossSellRecommendation[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-xl">関連サービスの参考情報</h2>
        <p className="text-sm text-muted-foreground mt-1">
          あなたの事業の集計値（年間利益・資金繰りの傾向）に基づく、単純な目安から表示している一般的な参考情報です。特定の商品・会社のご案内ではありません。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-stone-300 rounded-lg p-6 text-sm text-muted-foreground">
          現時点では表示できる参考情報がありません。記帳データが増え、年間利益などの集計値が確定すると、目安に応じた参考情報が表示されます。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <RecommendationCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t border-border pt-4 mt-2 leading-relaxed">
        本セクションは一般的・教育的な参考情報の提供のみを目的としており、投資助言・保険募集・貸付の勧誘・不動産取引の仲介のいずれにも該当しません。個別の商品の推奨や適合性の判断は行っておらず、実際の意思決定の前には、各分野の有資格専門家にご自身でご相談ください。
      </p>
    </section>
  );
}
