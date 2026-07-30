"use client";

import { useState } from "react";
import { ExplanationStep } from "@/lib/explain/breakdownExplainer";

/**
 * 「なぜこの分類・この数字になったのか」を開閉式で表示する、汎用の説明パネル。
 * データの計算は一切行わず、既に整形済みの ExplanationStep 配列を受け取って表示するだけ。
 * 仕訳の分類理由（breakdownExplainer.explainCategorization）にも、
 * 税額試算の前提（breakdownExplainer.explainEstimateAssumptions）にも同じ形で使える。
 */
export function ExplanationPanel({
  steps,
  title = "なぜこの分類？",
  defaultOpen = false,
}: {
  steps: ExplanationStep[];
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (steps.length === 0) return null;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 transition-colors"
      >
        <span aria-hidden="true" className="inline-block w-3">
          {open ? "▾" : "▸"}
        </span>
        {title}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 border-l-2 border-stone-200 pl-3">
          {steps.map((step, i) => (
            <li key={i}>
              <span className="font-semibold text-stone-600">{step.label}</span>
              <span className="text-stone-500">：{step.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
