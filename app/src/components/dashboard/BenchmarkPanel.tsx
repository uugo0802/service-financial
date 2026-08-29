"use client";

import { useMemo, useState } from "react";
import {
  BENCHMARK_SEGMENTS,
  BenchmarkCategoryComparison,
  BenchmarkSegmentId,
  buildBenchmarkComparison,
} from "@/lib/dashboard/benchmarkComparison";
import { OTHER_ACCOUNT_LABEL } from "@/lib/tax/expenseBreakdown";
import { CategorizedTransaction } from "@/lib/categorize/engine";

function formatPercent(value: number | null): string {
  if (value === null) return "―";
  return `${value.toFixed(1)}%`;
}

function formatDifference(value: number | null): string {
  if (value === null) return "―";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}pt`;
}

/**
 * 「ユーザーの割合」「参考値」を並べた小さな水平バー。両方nullの場合や
 * scaleMaxが0以下の場合はバーを描かず、テキストのみ表示する。
 */
function ComparisonBar({ value, scaleMax, colorClass }: { value: number | null; scaleMax: number; colorClass: string }) {
  if (value === null) {
    return <div className="h-1.5 rounded-full bg-surface" />;
  }
  const widthPercent = scaleMax > 0 ? Math.min(100, Math.max(0, (Math.abs(value) / scaleMax) * 100)) : 0;
  return (
    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${widthPercent}%` }} />
    </div>
  );
}

function CategoryRow({ category, scaleMax }: { category: BenchmarkCategoryComparison; scaleMax: number }) {
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-3 py-2 whitespace-nowrap">
        {category.account}
        {category.account === OTHER_ACCOUNT_LABEL && (
          <div className="text-xs text-muted-foreground">上位科目以外の合計</div>
        )}
      </td>
      <td className="px-3 py-2 min-w-[120px]">
        <div className="flex items-center justify-between gap-2 text-right tabular-nums mb-1">
          <span className="text-muted-foreground text-xs">あなた</span>
          <span>{formatPercent(category.userPercentOfRevenue)}</span>
        </div>
        <ComparisonBar value={category.userPercentOfRevenue} scaleMax={scaleMax} colorClass="bg-[var(--viz-series-expense)]" />
      </td>
      <td className="px-3 py-2 min-w-[120px]">
        <div className="flex items-center justify-between gap-2 text-right tabular-nums mb-1">
          <span className="text-muted-foreground text-xs">参考値</span>
          <span>{category.benchmarkPercentOfRevenue === null ? "参考値なし" : formatPercent(category.benchmarkPercentOfRevenue)}</span>
        </div>
        <ComparisonBar value={category.benchmarkPercentOfRevenue} scaleMax={scaleMax} colorClass="bg-stone-400 dark:bg-stone-500" />
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
          category.differencePoints === null
            ? "text-muted-foreground"
            : category.differencePoints > 0
              ? "text-danger"
              : "text-accent"
        }`}
      >
        {formatDifference(category.differencePoints)}
      </td>
    </tr>
  );
}

/**
 * ダッシュボード用: 経費科目トップNの「売上比(%)」を、フリーランス／マイクロ法人
 * それぞれの静的な参考ベンチマークと並べて表示するパネル。
 *
 * 税理士法上の位置づけ（重要）: これは一般的な参考情報の提示に留まり、個別具体の
 * 税務相談・経営アドバイスではない。参考値は他ユーザーの実データを集計したもの
 * ではなく、benchmarkComparison.ts に静的に同梱した目安値のみを使用する。
 */
export function BenchmarkPanel({ rows, title }: { rows: CategorizedTransaction[]; title: string }) {
  const [segment, setSegment] = useState<BenchmarkSegmentId>("freelancer");
  const comparison = useMemo(() => buildBenchmarkComparison(rows, segment), [rows, segment]);

  const scaleMax = useMemo(() => {
    const values = comparison.categories.flatMap((c) => [c.userPercentOfRevenue, c.benchmarkPercentOfRevenue]).filter((v): v is number => v !== null);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }, [comparison]);

  return (
    <div className="viz-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-1 text-xs">
          {BENCHMARK_SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={`rounded-full px-3 py-1 border transition-colors ${
                segment === s.id
                  ? "bg-foreground border-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3 border-b border-border pb-3">
        {comparison.disclaimer}
      </p>

      {comparison.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {comparison.revenue <= 0
            ? "表示できるデータがありません。売上・経費の記帳データが増えると、ここに経費構成の参考比較が表示されます。"
            : "経費の記帳データがまだありません。経費が記帳されると、科目別の売上比を参考値と比較して表示します。"}
        </p>
      ) : (
        <>
          {comparison.revenue <= 0 && (
            <p className="text-xs text-danger mb-2">
              売上データがまだ無いため、割合（％）は算出できません。金額のみ表示しています。
            </p>
          )}
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">勘定科目</th>
                  <th className="px-3 py-2 font-normal">あなたの割合（対売上）</th>
                  <th className="px-3 py-2 font-normal">参考値（対売上）</th>
                  <th className="px-3 py-2 font-normal text-right">差</th>
                </tr>
              </thead>
              <tbody>
                {comparison.categories.map((c) => (
                  <CategoryRow key={c.account} category={c} scaleMax={scaleMax} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
