"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import {
  BudgetTrackingStatus,
  DEFAULT_CATEGORY_BUDGETS,
  compareBudgetToActual,
  formatPeriod,
} from "@/lib/budget/budgetTracking";

// /budget（BudgetPage）の計算ロジック・既定予算をそのまま再利用した「概要」ウィジェット。
// 予算設定の編集はここでは行わず、詳細な科目別編集・全カテゴリの確認は/budgetへ誘導する
// （予算設定自体が現状永続化されていない点はBudgetPage側と同じ暫定挙動。budgetTracking.ts
// のDEFAULT_CATEGORY_BUDGETSコメント参照）。

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const STATUS_LABEL: Record<BudgetTrackingStatus, string> = {
  under_budget: "予算内",
  at_budget: "予算どおり",
  over_budget: "予算超過",
  over_budget_no_cap: "予算超過（上限0円）",
  no_budget_set: "予算未設定",
};

const BAR_FILL_CLASS: Record<BudgetTrackingStatus, string> = {
  under_budget: "bg-emerald-600",
  at_budget: "bg-border",
  over_budget: "bg-red-600",
  over_budget_no_cap: "bg-red-600",
  no_budget_set: "bg-border",
};

const STATUS_BADGE_CLASS: Record<BudgetTrackingStatus, string> = {
  under_budget: "text-emerald-700 dark:text-emerald-400",
  at_budget: "text-muted-foreground",
  over_budget: "text-red-700 dark:text-red-400",
  over_budget_no_cap: "text-red-700 dark:text-red-400",
  no_budget_set: "text-warning-foreground",
};

/** ダッシュボードでは画面を占有しすぎないよう、表示するカテゴリ数を絞る */
const MAX_VISIBLE_CATEGORIES = 4;

export interface BudgetSummaryWidgetProps {
  transactions: CategorizedTransaction[];
}

export function BudgetSummaryWidget({ transactions }: BudgetSummaryWidgetProps) {
  const period = useMemo(() => formatPeriod(new Date()), []);
  const result = useMemo(
    () => compareBudgetToActual(DEFAULT_CATEGORY_BUDGETS, transactions, period),
    [transactions, period]
  );

  // 超過中のカテゴリを優先し、同条件なら実績額が大きい順に並べる
  // （超過の把握を優先しつつ、大きな支出も見落とさないようにするため）。
  const topCategories = useMemo(
    () =>
      [...result.comparisons]
        .sort((a, b) => Number(b.isOverBudget) - Number(a.isOverBudget) || b.actualYen - a.actualYen)
        .slice(0, MAX_VISIBLE_CATEGORIES),
    [result.comparisons]
  );

  const totalRemainingYen = result.totalBudgetYen - result.totalActualYen;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground">予算実績（{period}・概要）</h2>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="予算合計" value={yen.format(result.totalBudgetYen)} />
        <MiniStat label="実績合計" value={yen.format(result.totalActualYen)} />
        <MiniStat
          label={totalRemainingYen >= 0 ? "予算残り" : "予算超過額"}
          value={yen.format(Math.abs(totalRemainingYen))}
          tone={totalRemainingYen >= 0 ? "positive" : "negative"}
        />
      </div>

      {topCategories.length === 0 ? (
        <p className="text-sm text-muted-foreground">この期間には予算設定・実績のいずれもありません。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {topCategories.map((c) => {
            const ratio = c.budgetYen && c.budgetYen > 0 ? Math.min(c.actualYen / c.budgetYen, 1) : c.actualYen > 0 ? 1 : 0;
            return (
              <div key={c.account} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium truncate">{c.account}</span>
                  <span className={`text-xs shrink-0 ${STATUS_BADGE_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </div>
                <div className="h-2 w-full bg-surface rounded-sm overflow-hidden">
                  <div className={`h-full ${BAR_FILL_CLASS[c.status]}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.overBudgetCount > 0 && (
        <p className="text-xs text-red-700 dark:text-red-400">予算超過カテゴリ: {result.overBudgetCount}件</p>
      )}

      <Link href="/budget" className="text-xs text-accent underline underline-offset-2 hover:opacity-80 self-start">
        すべての科目・予算設定を見る →
      </Link>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-700 dark:text-red-400"
        : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
