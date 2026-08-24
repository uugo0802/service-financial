"use client";

import { useState } from "react";
import Link from "next/link";
import { FAQ_CATEGORY_LABELS, FAQ_CATEGORY_ORDER, FAQ_ENTRIES, FaqEntry } from "@/lib/faq/content";

// 提携税理士への紹介ページへの誘導が特に関係するFAQは、回答本文とは別に
// 明示的なリンクを添えることで、個別相談が必要な利用者を確実に導線に乗せる。
const ADVISOR_REFERRAL_ENTRY_IDS = new Set(["service-is-tax-advice", "advisor-how-to-consult", "advisor-when-recommended"]);

function entriesByCategory(entries: FaqEntry[]) {
  const grouped = new Map<string, FaqEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }
  return grouped;
}

function FaqAccordionItem({ entry, isOpen, onToggle }: { entry: FaqEntry; isOpen: boolean; onToggle: () => void }) {
  const panelId = `faq-panel-${entry.id}`;
  const buttonId = `faq-button-${entry.id}`;

  return (
    <div className="border border-stone-300 bg-white">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 text-left px-4 py-3 text-sm font-medium hover:bg-stone-50 transition-colors"
        >
          <span>{entry.question}</span>
          <span aria-hidden="true" className="shrink-0 text-stone-400">
            {isOpen ? "−" : "＋"}
          </span>
        </button>
      </h3>
      {isOpen && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="border-t border-stone-200 px-4 py-3">
          <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">{entry.answer}</p>
          {ADVISOR_REFERRAL_ENTRY_IDS.has(entry.id) && (
            <p className="mt-3 text-xs">
              <Link href="/advisor-referral" className="text-red-700 underline hover:no-underline">
                提携税理士への紹介ページを見る
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FaqAccordion({ entries = FAQ_ENTRIES }: { entries?: FaqEntry[] }) {
  // 複数の項目を同時に開ける（アコーディオン全体で単一開閉に絞らない）方が、
  // FAQのように「関連する質問をまとめて見比べたい」利用シーンに向いているため採用。
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const grouped = entriesByCategory(entries);
  const categoriesToRender = FAQ_CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0);

  if (categoriesToRender.length === 0) {
    return <p className="text-sm text-stone-500">該当する質問が見つかりませんでした。</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {categoriesToRender.map((category) => (
        <section key={category}>
          <h2 className="text-lg font-semibold mb-3">{FAQ_CATEGORY_LABELS[category]}</h2>
          <div className="flex flex-col gap-2">
            {(grouped.get(category) ?? []).map((entry) => (
              <FaqAccordionItem key={entry.id} entry={entry} isOpen={openIds.has(entry.id)} onToggle={() => toggle(entry.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
