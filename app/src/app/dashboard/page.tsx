"use client";

import { useMemo } from "react";
import { buildMonthlyTrend, buildYearlyTrend, TrendPoint } from "@/lib/tax/salesTrend";
import { TrendLineChart } from "@/components/dashboard/TrendLineChart";
import { TrendBarChart } from "@/components/dashboard/TrendBarChart";
import { StatTile } from "@/components/dashboard/StatTile";
import { buildSampleTransactions } from "./sampleData";

function sumOf(points: TrendPoint[], field: keyof Omit<TrendPoint, "key">): number {
  return points.reduce((s, p) => s + p[field], 0);
}

function percentDelta(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default function DashboardPage() {
  const transactions = useMemo(() => buildSampleTransactions(), []);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(transactions), [transactions]);
  const yearlyTrend = useMemo(() => buildYearlyTrend(transactions), [transactions]);

  const currentYear = yearlyTrend[yearlyTrend.length - 1];
  const priorFullYear = yearlyTrend.length >= 2 ? yearlyTrend[yearlyTrend.length - 2] : null;
  const twoYearsAgo = yearlyTrend.length >= 3 ? yearlyTrend[yearlyTrend.length - 3] : null;

  // 今期(直近年)はデータが年途中までしかないため、前年の「同じ月数分」だけを切り出して比較する
  const monthsInCurrentYear = monthlyTrend.filter((p) => p.key.startsWith(currentYear.key)).length;
  const samePeriodPriorYear = priorFullYear
    ? monthlyTrend.filter((p) => p.key.startsWith(priorFullYear.key)).slice(0, monthsInCurrentYear)
    : [];
  const samePeriodIncome = sumOf(samePeriodPriorYear, "income");
  const samePeriodProfit = sumOf(samePeriodPriorYear, "profit");

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700 dark:text-red-400">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">売上・損益ダッシュボード</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-semibold mb-2">過去の売上・損益の推移</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl leading-relaxed">
            年度別・月次の売上と損益の推移をグラフで確認できます。
            <b className="font-medium"> 現時点ではサンプルデータを表示しています。</b>
            実際の記帳データとの連携（Supabase）は別途対応予定です。
          </p>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label={`今期の売上（${currentYear.key}年 1〜${monthsInCurrentYear}月）`}
            value={sumOf(monthlyTrend.filter((p) => p.key.startsWith(currentYear.key)), "income")}
            deltaPercent={percentDelta(currentYear.income, samePeriodIncome)}
          />
          <StatTile
            label={`今期の損益（${currentYear.key}年 1〜${monthsInCurrentYear}月）`}
            value={currentYear.profit}
            deltaPercent={percentDelta(currentYear.profit, samePeriodProfit)}
          />
          {priorFullYear && (
            <StatTile
              label={`${priorFullYear.key}年 年間売上`}
              value={priorFullYear.income}
              deltaPercent={twoYearsAgo ? percentDelta(priorFullYear.income, twoYearsAgo.income) : undefined}
            />
          )}
          {priorFullYear && (
            <StatTile
              label={`${priorFullYear.key}年 年間損益`}
              value={priorFullYear.profit}
              deltaPercent={twoYearsAgo ? percentDelta(priorFullYear.profit, twoYearsAgo.profit) : undefined}
            />
          )}
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5">
          <TrendLineChart points={monthlyTrend} title="月次 売上・経費・損益の推移" />
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5">
          <TrendBarChart points={yearlyTrend} title="年度別 売上・経費・損益" />
        </section>

        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          表示している金額はサンプルデータに基づく概算であり、実際の申告内容を示すものではありません。
        </p>
      </main>
    </div>
  );
}
