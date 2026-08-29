"use client";

import { useEffect, useState } from "react";
import { TagProfitability } from "@/lib/tags/tagging";

// ExpenseBreakdownChart.tsx（app/src/components/dashboard/）と同じ
// 「SVGの横棒グラフ + 表切り替え」の軽量チャート構成を踏襲した、タグ別収益性の
// 可視化コンポーネント。収入(青)・支出(橙)は既存ダッシュボードと同じ .viz-dashboard
// のCSS変数（--viz-series-income / --viz-series-expense）を使い、純額(黒字/赤字)は
// --viz-series-profit / 赤系の色で表現する。

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const ROW_HEIGHT = 32;
const BAR_HEIGHT = 14;
const MARGIN = { top: 4, right: 96, bottom: 4, left: 132 };
const CHART_WIDTH = 620;

// 純額が赤字の場合の色（既存の .viz-dashboard には赤字専用の変数がないため、
// ダッシュボード全体で使われている警告色（red-700系）に近いトーンで固定値を用意する）。
const NET_NEGATIVE_COLOR = "#b3261e";
const NET_NEGATIVE_COLOR_DARK = "#e5605a";

export function TagBreakdownPanel({ rows }: { rows: TagProfitability[] }) {
  const [showTable, setShowTable] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    function update() {
      setIsDark(media?.matches ?? false);
    }
    update();
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="viz-dashboard">
        <p className="text-sm text-muted-foreground">
          まだタグが登録されていません。タグを作成し、取引に紐付けると収益性の内訳がここに表示されます。
        </p>
      </div>
    );
  }

  const netProfitColor = "var(--viz-series-profit)";
  const netLossColor = isDark ? NET_NEGATIVE_COLOR_DARK : NET_NEGATIVE_COLOR;

  const trackWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const maxAbsNet = Math.max(...rows.map((r) => Math.abs(r.net)), 1);
  const height = MARGIN.top + MARGIN.bottom + rows.length * ROW_HEIGHT;
  const zeroX = MARGIN.left + trackWidth / 2;
  const halfTrack = trackWidth / 2;

  function barEndX(net: number): number {
    return zeroX + (net / maxAbsNet) * halfTrack;
  }

  const totals = rows.reduce(
    (acc, r) => ({ income: acc.income + r.income, expense: acc.expense + r.expense, net: acc.net + r.net }),
    { income: 0, expense: 0, net: 0 }
  );

  return (
    <div className="viz-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground">タグ別 収益性サマリー（純額）</h3>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            合計純額 <span className="tabular-nums">{yen.format(totals.net)}</span>円
          </span>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground dark:hover:text-stone-200"
          >
            {showTable ? "グラフ表示に戻す" : "表で見る"}
          </button>
        </div>
      </div>

      {showTable ? (
        <BreakdownTable rows={rows} totals={totals} netLossColor={netLossColor} />
      ) : (
        <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md bg-[var(--viz-surface)] py-2">
          <svg width="100%" height={height} viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label="タグ別収益性" className="block">
            {/* ゼロ基準線 */}
            <line x1={zeroX} y1={MARGIN.top} x2={zeroX} y2={height - MARGIN.bottom} stroke="var(--viz-axis)" strokeWidth={1} />
            {rows.map((r, i) => {
              const y = MARGIN.top + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              const isPositive = r.net >= 0;
              const barStart = isPositive ? zeroX : barEndX(r.net);
              const barEnd = isPositive ? barEndX(r.net) : zeroX;
              const color = isPositive ? netProfitColor : netLossColor;
              return (
                <g key={r.tagId}>
                  <text
                    x={MARGIN.left - 8}
                    y={y + BAR_HEIGHT / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted-foreground"
                    fontSize={11}
                  >
                    {truncateLabel(r.label)}
                  </text>
                  <rect x={barStart} y={y} width={Math.max(0, barEnd - barStart)} height={BAR_HEIGHT} fill={color} opacity={0.9} rx={2} />
                  <text
                    x={barEnd + (isPositive ? 8 : -8)}
                    y={y + BAR_HEIGHT / 2}
                    textAnchor={isPositive ? "start" : "end"}
                    dominantBaseline="middle"
                    className="fill-muted-foreground"
                    fontSize={11}
                  >
                    {yen.format(r.net)}円
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        表示はタグが付いた取引の収入・支出を単純に集計した金額です。税額の算定や申告書への反映を保証するものではなく、
        あくまで案件・クライアント別の収支を把握するための参考表示です。
      </p>
    </div>
  );
}

function truncateLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}

function BreakdownTable({
  rows,
  totals,
  netLossColor,
}: {
  rows: TagProfitability[];
  totals: { income: number; expense: number; net: number };
  netLossColor: string;
}) {
  return (
    <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-normal">タグ</th>
            <th className="px-3 py-2 font-normal text-right">収入</th>
            <th className="px-3 py-2 font-normal text-right">支出</th>
            <th className="px-3 py-2 font-normal text-right">純額</th>
            <th className="px-3 py-2 font-normal text-right">件数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tagId} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap">
                {r.color && <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: r.color }} />}
                {r.label}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-[var(--viz-series-income)]">{yen.format(r.income)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-[var(--viz-series-expense)]">{yen.format(r.expense)}</td>
              <td
                className="px-3 py-1.5 text-right tabular-nums font-medium"
                style={{ color: r.net >= 0 ? "var(--viz-series-profit)" : netLossColor }}
              >
                {yen.format(r.net)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.transactionCount}</td>
            </tr>
          ))}
          <tr className="font-medium text-foreground">
            <td className="px-3 py-1.5">合計</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(totals.income)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(totals.expense)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(totals.net)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
