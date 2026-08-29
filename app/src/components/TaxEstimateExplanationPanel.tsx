"use client";

import { useState } from "react";
import { CalculationTrailStep } from "@/lib/explain/taxEstimateExplainer";

const yenFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

/**
 * 税額試算（所得税 / 法人税）が「収入 → 各種控除 → 課税所得 → 税率区分ごとの税額 → 最終的な税額」
 * とどのような順序で計算されたのかを、開閉式のステップリストで見せるための説明パネル。
 *
 * ExplanationPanel.tsx（AI仕訳の分類理由用）と見た目のトーン・開閉の作法は揃えつつ、
 * 各ステップに金額を併記する専用レイアウトにしている（別コンポーネント、ExplanationPanel自体は変更しない）。
 * データの計算は一切行わず、taxEstimateExplainer.ts が整形済みの CalculationTrailStep[] を
 * 受け取って表示するだけ。
 *
 * 重要（税理士法対応）: これは「この数字がどう計算されたか」の計算過程の解説（学習的な機能）であり、
 * 個別の税務相談・節税アドバイスではない。その旨を末尾に明記する。
 */
export function TaxEstimateExplanationPanel({
  steps,
  title = "この金額はどう計算された？",
  defaultOpen = false,
}: {
  steps: CalculationTrailStep[];
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (steps.length === 0) return null;

  return (
    <div className="text-xs print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <span aria-hidden="true" className="inline-block w-3">
          {open ? "▾" : "▸"}
        </span>
        {title}
      </button>
      {open && (
        <div className="mt-2 border border-stone-200 bg-stone-50 rounded p-3">
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    step.isFinal ? "bg-accent text-white" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className={`font-semibold ${step.isFinal ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
                    {step.amount !== null && (
                      <span className={`tabular-nums whitespace-nowrap ${step.isFinal ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {yenFormatter.format(step.amount)}円
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground leading-relaxed mt-0.5">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 pt-2 border-t border-stone-200 text-muted-foreground leading-relaxed">
            これは、入力データから本アプリがこの試算をどのように計算したかの過程を機械的に表示したものであり、個別の税務相談や節税のご提案ではありません。実際の申告にあたっては、必ずご自身（または税理士）でご確認ください。
          </p>
        </div>
      )}
    </div>
  );
}
