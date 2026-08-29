"use client";

import { useMemo, useState } from "react";
import type { CategorizedTransaction } from "@/lib/categorize/engine";
import type { UserCategoryRule } from "@/lib/categorize/userRules";
import {
  applySelectedReapply,
  computeBulkReapplyDiff,
  formatBulkReapplySummary,
} from "@/lib/categorize/bulkReapply";

interface BulkReapplyRulesPanelProps {
  initialTransactions?: CategorizedTransaction[];
  /** 現在有効なユーザー辞書ルール（categorize-rules 画面で編集する内容） */
  userRules?: UserCategoryRule[];
  /** 選択した変更を適用した後の取引一覧が渡される（永続化フックの接続用。省略可） */
  onApply?: (transactions: CategorizedTransaction[]) => void;
}

const tableWrapperClass = "overflow-x-auto border border-border bg-surface";
const thClass = "px-3 py-2 font-normal whitespace-nowrap";
const tdClass = "px-3 py-2 whitespace-nowrap";

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? "＋" : "－";
  return `${sign}${Math.abs(amount).toLocaleString()}円`;
}

export function BulkReapplyRulesPanel({
  initialTransactions = [],
  userRules = [],
  onApply,
}: BulkReapplyRulesPanelProps) {
  const [transactions, setTransactions] = useState<CategorizedTransaction[]>(initialTransactions);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastAppliedCount, setLastAppliedCount] = useState<number | null>(null);

  const diffResult = useMemo(() => computeBulkReapplyDiff(transactions, userRules), [transactions, userRules]);
  const { diffs } = diffResult;

  function toggleSelected(id: string) {
    setLastAppliedCount(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setLastAppliedCount(null);
    setSelectedIds(new Set(diffs.map((d) => d.id)));
  }

  function clearSelection() {
    setLastAppliedCount(null);
    setSelectedIds(new Set());
  }

  function handleApplySelected() {
    if (selectedIds.size === 0) return;
    const updated = applySelectedReapply(transactions, diffs, selectedIds);
    setTransactions(updated);
    setLastAppliedCount(selectedIds.size);
    setSelectedIds(new Set());
    onApply?.(updated);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-surface border border-border rounded p-4">
        <p className="text-sm text-foreground">{formatBulkReapplySummary(diffResult)}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          ユーザー辞書ルールを追加・編集しても、過去にすでに分類済みの取引は自動では更新されません。ここでは「今のルールでもう一度分類し直したら、どの取引がどう変わるか」を一覧表示し、確認のうえ選択した取引だけに反映できます。
        </p>
      </section>

      {diffs.length === 0 ? (
        <p className="text-sm text-muted-foreground">現在のルールで再分類しても、変更される取引はありません。</p>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">
              変更される可能性がある取引（{diffs.length}件中 {selectedIds.size}件選択中）
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                選択を解除
              </button>
            </div>
          </div>

          <div className={tableWrapperClass}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className={`${thClass} print:hidden`} />
                  <th className={thClass}>取引日</th>
                  <th className="px-3 py-2 font-normal">摘要</th>
                  <th className={thClass}>金額</th>
                  <th className={thClass}>現在の科目／税区分</th>
                  <th className={thClass}>再分類後の科目／税区分</th>
                  <th className={thClass}>確信度</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((diff) => (
                  <tr key={diff.id} className="border-b border-border/60 last:border-0 align-top">
                    <td className={`${tdClass} print:hidden`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(diff.id)}
                        onChange={() => toggleSelected(diff.id)}
                        aria-label={`${diff.description} の変更を適用する`}
                      />
                    </td>
                    <td className={`${tdClass} tabular-nums text-muted-foreground`}>{diff.date}</td>
                    <td className="px-3 py-2 max-w-[16rem]">{diff.description}</td>
                    <td className={`${tdClass} tabular-nums text-muted-foreground`}>{formatAmount(diff.amount)}</td>
                    <td className={tdClass}>
                      <div className="text-muted-foreground">{diff.previous.account}</div>
                      <div className="text-xs text-muted-foreground">{diff.previous.taxCategory}</div>
                    </td>
                    <td className={tdClass}>
                      <div className="font-medium">{diff.next.account}</div>
                      <div className="text-xs text-muted-foreground">{diff.next.taxCategory}</div>
                    </td>
                    <td className={`${tdClass} tabular-nums text-muted-foreground`}>
                      {Math.round(diff.next.confidence * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={handleApplySelected}
              disabled={selectedIds.size === 0}
              className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-stone-900"
            >
              選択した変更を適用（{selectedIds.size}件）
            </button>
            {lastAppliedCount !== null && (
              <span className="text-xs text-muted-foreground">{lastAppliedCount}件を適用しました。</span>
            )}
          </div>

          <p className="text-xs text-amber-700 leading-relaxed mt-3">
            適用後の勘定科目・税区分もルールに基づく簡易な自動判定であり、正式な税務判断ではありません。反映後の内容も必ずご自身でご確認ください。
          </p>
        </section>
      )}
    </div>
  );
}
