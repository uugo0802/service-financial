"use client";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import {
  CategoryBudget,
  BudgetTrackingStatus,
  compareBudgetToActual,
  formatPeriod,
  knownExpenseCategories,
  parseBudgetInputYen,
  removeCategoryBudget,
  upsertCategoryBudget,
} from "@/lib/budget/budgetTracking";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const percent = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

// 実際の記帳データ連携（他ルートで対応予定）までのデモ用サンプル。
// 選択した期間（YYYY-MM）にあわせて日付を差し替え、期間を切り替えても実績が表示されるようにする。
const SAMPLE_SPEND: { account: string; day: string; amount: number }[] = [
  { account: "地代家賃", day: "01", amount: -180000 },
  { account: "通信費", day: "03", amount: -18000 },
  { account: "通信費", day: "20", amount: -6000 },
  { account: "旅費交通費", day: "05", amount: -32000 },
  { account: "消耗品費", day: "08", amount: -14000 },
  { account: "支払手数料(ソフトウェア利用料)", day: "10", amount: -9800 },
  { account: "接待交際費", day: "14", amount: -22000 },
  { account: "会議費", day: "16", amount: -3200 },
  { account: "水道光熱費", day: "18", amount: -11000 },
  { account: "新聞図書費", day: "22", amount: -2400 },
  { account: "広告宣伝費", day: "25", amount: -45000 },
];

function buildSampleTransactions(period: string): CategorizedTransaction[] {
  return SAMPLE_SPEND.map((row, i) => ({
    id: `sample-${i}`,
    date: `${period}-${row.day}`,
    description: `サンプル: ${row.account}`,
    amount: row.amount,
    account: row.account,
    taxCategory: "課税仕入10%" as const,
    confidence: 1,
    source: "rule" as const,
  }));
}

const DEFAULT_BUDGETS: CategoryBudget[] = [
  { account: "地代家賃", monthlyBudgetYen: 180000 },
  { account: "通信費", monthlyBudgetYen: 20000 },
  { account: "旅費交通費", monthlyBudgetYen: 25000 },
  { account: "消耗品費", monthlyBudgetYen: 15000 },
  { account: "接待交際費", monthlyBudgetYen: 15000 },
  { account: "広告宣伝費", monthlyBudgetYen: 30000 },
];

const STATUS_LABEL: Record<BudgetTrackingStatus, string> = {
  under_budget: "予算内",
  at_budget: "予算どおり",
  over_budget: "予算超過",
  over_budget_no_cap: "予算超過（上限0円）",
  no_budget_set: "予算未設定",
};

const STATUS_BADGE_CLASS: Record<BudgetTrackingStatus, string> = {
  under_budget: "text-emerald-700 dark:text-emerald-400",
  at_budget: "text-stone-500 dark:text-stone-400",
  over_budget: "text-red-700 dark:text-red-400",
  over_budget_no_cap: "text-red-700 dark:text-red-400",
  no_budget_set: "text-amber-700 dark:text-amber-400",
};

const BAR_FILL_CLASS: Record<BudgetTrackingStatus, string> = {
  under_budget: "bg-emerald-600",
  at_budget: "bg-stone-500",
  over_budget: "bg-red-600",
  over_budget_no_cap: "bg-red-600",
  no_budget_set: "bg-stone-400",
};

export default function BudgetPage() {
  const [period, setPeriod] = useState(() => formatPeriod(new Date()));
  const [budgets, setBudgets] = useState<CategoryBudget[]>(DEFAULT_BUDGETS);
  const categories = useMemo(() => knownExpenseCategories(), []);
  const transactions = useMemo(() => buildSampleTransactions(period), [period]);

  const result = useMemo(() => compareBudgetToActual(budgets, transactions, period), [budgets, transactions, period]);

  function budgetFor(account: string): number {
    return budgets.find((b) => b.account === account)?.monthlyBudgetYen ?? 0;
  }

  function hasBudget(account: string): boolean {
    return budgets.some((b) => b.account === account);
  }

  function handleBudgetChange(account: string, input: string) {
    setBudgets((prev) => upsertCategoryBudget(prev, account, parseBudgetInputYen(input)));
  }

  function handleClearBudget(account: string) {
    setBudgets((prev) => removeCategoryBudget(prev, account));
  }

  const totalRemainingYen = result.totalBudgetYen - result.totalActualYen;

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">支出予算 vs 実績</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-semibold mb-2">経費科目ごとの月間予算 vs 実績</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl leading-relaxed">
            経費科目ごとに月間の支出予算を設定し、記帳済みの実績と比較できます。
            <b className="font-medium">
            これは記帳データに基づく中立的な比較・警告表示であり、個別の節税・支出削減の助言ではありません。
            </b>
            <b className="font-medium"> 現時点ではサンプルの実績データを表示しています。</b>
            実際の記帳データとの連携は別途対応予定です。
          </p>
        </section>

        <section className="flex items-end gap-4 flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-stone-400">
            対象月
            <input
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className="border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-stone-600 dark:focus:border-stone-400"
            />
          </label>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="予算合計（設定科目のみ）" value={yen.format(result.totalBudgetYen)} />
          <StatTile label="実績合計" value={yen.format(result.totalActualYen)} />
          <StatTile
            label={totalRemainingYen >= 0 ? "予算残り（設定科目合計）" : "予算超過額（設定科目合計）"}
            value={yen.format(Math.abs(totalRemainingYen))}
            tone={totalRemainingYen >= 0 ? "positive" : "negative"}
          />
          <StatTile
            label="予算超過カテゴリ数"
            value={`${result.overBudgetCount}件`}
            tone={result.overBudgetCount > 0 ? "negative" : "positive"}
          />
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5">
          <h2 className="text-lg font-semibold mb-1">予算設定</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            科目は記帳の自動仕訳ルール（categorize辞書）に登録済みのものと同じです。0円のまま・未入力にしておくと「支出しない想定の枠」として扱われ、少額でも実績が発生すると超過フラグが立ちます。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal">経費科目</th>
                  <th className="px-3 py-2 font-normal text-right">月間予算額（円）</th>
                  <th className="px-3 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((account) => (
                  <tr key={account} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-2">{account}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={budgetFor(account)}
                        onChange={(e) => handleBudgetChange(account, e.target.value)}
                        className="w-32 text-right border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-1 text-sm outline-none focus:border-stone-600 dark:focus:border-stone-400 tabular-nums"
                        aria-label={`${account}の月間予算額`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {hasBudget(account) && (
                        <button
                          type="button"
                          onClick={() => handleClearBudget(account)}
                          className="text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 underline underline-offset-2"
                        >
                          未設定に戻す
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5">
          <h2 className="text-lg font-semibold mb-1">{period} 予算 vs 実績</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            実績のあるカテゴリ、または予算が設定されているカテゴリのみ表示します。
          </p>

          {result.comparisons.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              この期間には予算設定・実績のいずれもありません。上の予算設定、または対象月をご確認ください。
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {result.comparisons.map((c) => {
                const ratio = c.budgetYen && c.budgetYen > 0 ? Math.min(c.actualYen / c.budgetYen, 1) : c.actualYen > 0 ? 1 : 0;
                return (
                  <div key={c.account} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-4 flex-wrap text-sm">
                      <span className="font-medium">{c.account}</span>
                      <span className={`text-xs ${STATUS_BADGE_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </div>
                    <div className="h-2.5 w-full bg-stone-100 dark:bg-stone-800 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${BAR_FILL_CLASS[c.status]}`}
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-4 flex-wrap text-xs text-stone-500 dark:text-stone-400">
                      <span className="tabular-nums">
                        実績 {yen.format(c.actualYen)}
                        {" / 予算 "}
                        {c.budgetYen === null ? "未設定" : yen.format(c.budgetYen)}
                      </span>
                      <span className="tabular-nums">
                        {c.overagePercent !== null
                          ? `予算比 ${percent(c.overagePercent)}`
                          : c.status === "over_budget_no_cap"
                            ? "予算0円のため超過率は算出不可（実績すべてが超過）"
                            : c.status === "no_budget_set"
                              ? "予算未設定のため比較不可"
                              : "予算0円・実績0円"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-700 dark:text-red-400"
        : "text-stone-900 dark:text-stone-50";
  return (
    <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-4">
      <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
