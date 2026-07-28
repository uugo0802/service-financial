"use client";

import { useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildCategorizationRationale, RATIONALE_DISCLAIMER, RationaleTone } from "@/lib/categorize/rationale";

const TONE_STYLES: Record<RationaleTone, { trigger: string; label: string; panel: string; showWarningIcon: boolean }> = {
  confirmed: {
    trigger: "border-stone-300 text-stone-600 hover:border-stone-500",
    label: "根拠を見る",
    panel: "border-stone-300 bg-stone-50",
    showWarningIcon: false,
  },
  caution: {
    trigger: "border-amber-300 text-amber-700 hover:border-amber-500",
    label: "根拠を見る",
    panel: "border-amber-300 bg-amber-50",
    showWarningIcon: true,
  },
  needsReview: {
    trigger: "border-amber-400 text-amber-800 hover:border-amber-600 font-medium",
    label: "根拠を見る",
    panel: "border-amber-400 bg-amber-50",
    showWarningIcon: true,
  },
};

/**
 * 「なぜこの仕訳？」の根拠を見せるための小さな開閉式コンポーネント。
 * 一覧の1行の横に置く想定（例: app/journal/page.tsx の仕訳テーブル）。
 * ルールベース照合の note、またはAI判定の confidence/reasoning を
 * rationale.ts で人間可読な文章に整形して表示する。
 *
 * 重要: これは「本アプリがどう判定したか」の解説であり、個別の税務相談ではない。
 * その旨を必ず末尾に明記する（RATIONALE_DISCLAIMER）。
 */
export function CategorizationRationale({ transaction }: { transaction: CategorizedTransaction }) {
  const [open, setOpen] = useState(false);
  const rationale = buildCategorizationRationale(transaction);
  const style = TONE_STYLES[rationale.tone];

  return (
    <div className="inline-block text-left print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 text-xs px-2 py-1 border rounded-sm transition-colors whitespace-nowrap ${style.trigger}`}
      >
        {style.showWarningIcon && (
          <span aria-hidden className="text-amber-600">
            ⚠
          </span>
        )}
        {open ? "根拠を閉じる" : style.label}
      </button>

      {open && (
        <div className={`mt-2 w-72 max-w-[85vw] border p-3 text-xs leading-relaxed ${style.panel}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-stone-800">{rationale.headline}</span>
            {rationale.confidencePercent !== null && (
              <span className="text-stone-500 tabular-nums shrink-0">確信度 {rationale.confidencePercent}%</span>
            )}
          </div>
          <p className="text-stone-700">{rationale.explanation}</p>
          {rationale.reviewMessage && <p className="mt-2 text-amber-800 font-medium">{rationale.reviewMessage}</p>}
          <p className="mt-3 text-stone-400 border-t border-stone-200 pt-2">{RATIONALE_DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
