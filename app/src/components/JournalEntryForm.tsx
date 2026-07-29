"use client";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { explainCategorization } from "@/lib/explain/breakdownExplainer";
import { ExplanationPanel } from "@/components/ExplanationPanel";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/**
 * 1件の仕訳（取引明細）を確認・修正するための編集フォーム。
 * 勘定科目の入力欄の隣に「なぜこの分類？」の説明パネル（ExplanationPanel）を表示し、
 * categorize/engine・categorize/aiEscalate が既に計算している confidence / source / note を
 * そのままユーザーに見える形で説明する（breakdownExplainer で整形するのみ、判定ロジックには関与しない）。
 */
export function JournalEntryForm({
  transaction,
  onChange,
}: {
  transaction: CategorizedTransaction;
  onChange: (patch: Partial<CategorizedTransaction>) => void;
}) {
  const needsReview = transaction.source === "uncategorized" || transaction.confidence < 0.75;
  const explanationSteps = explainCategorization(transaction);

  return (
    <div className={`border border-stone-300 bg-white p-4 flex flex-col gap-2 ${needsReview ? "bg-red-50" : ""}`}>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="tabular-nums text-stone-500">{transaction.date}</span>
        <span className={`tabular-nums ${transaction.amount < 0 ? "text-stone-700" : "text-emerald-700"}`}>
          {yen.format(transaction.amount)}
        </span>
      </div>
      <p className="text-sm text-stone-700 truncate" title={transaction.description}>
        {transaction.description}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1 text-xs text-stone-500 flex-1 min-w-[10rem]">
          勘定科目
          <input
            className="border-b border-stone-300 bg-transparent px-1 py-1 text-sm outline-none focus:border-stone-600"
            value={transaction.account}
            onChange={(e) => onChange({ account: e.target.value })}
          />
        </label>
        <span className="text-xs text-stone-500 whitespace-nowrap">{transaction.taxCategory}</span>
        <span className="text-xs whitespace-nowrap">
          {transaction.source === "rule" && <span className="text-emerald-700">自動確定</span>}
          {transaction.source === "ai" && (
            <span className="text-sky-700">AI判定 ({Math.round(transaction.confidence * 100)}%)</span>
          )}
          {transaction.source === "uncategorized" && <span className="text-red-700">要確認</span>}
        </span>
      </div>

      {/* 追加のみ: なぜこの分類になったのかを、既存の入力欄の隣に開閉式で表示する */}
      <ExplanationPanel steps={explanationSteps} />
    </div>
  );
}
