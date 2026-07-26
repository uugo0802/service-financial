import { TaxSavingChecklist, TaxSavingChecklistItem } from "@/lib/tax/taxSavingChecklist";

// 一般的な制度解説＋試算結果からみて当てはまりそうな項目のハイライトに留めた
// セルフチェック用の表示コンポーネント。個別最適化された税務助言は行わない。

function ChecklistItemCard({ item }: { item: TaxSavingChecklistItem }) {
  return (
    <div className={`border bg-white p-4 ${item.highlight ? "border-red-700" : "border-stone-300"}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {item.highlight && (
          <span className="text-[10px] px-2 py-0.5 border border-red-700 text-red-700 tracking-wide whitespace-nowrap">
            当てはまる可能性
          </span>
        )}
        <h3 className="text-sm font-semibold">{item.title}</h3>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed">{item.summary}</p>
      <p className="text-xs text-stone-500 mt-2 leading-relaxed">{item.note}</p>
    </div>
  );
}

export function TaxSavingChecklistSection({ title, checklist }: { title: string; checklist: TaxSavingChecklist }) {
  // ハイライト項目を先頭に表示し、当てはまりそうなものが目に入りやすいようにする
  const orderedItems = [...checklist.items].sort((a, b) => Number(b.highlight) - Number(a.highlight));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-xs text-amber-700 mb-4 max-w-2xl leading-relaxed">{checklist.disclaimer}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {orderedItems.map((item) => (
          <ChecklistItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
