"use client";

import { useEffect, useState } from "react";
import { ExpenseBreakdown, ExpenseBreakdownSlice, OTHER_ACCOUNT_LABEL } from "@/lib/tax/expenseBreakdown";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

// カテゴリ識別用の配色。既存チャート(--viz-series-*)と同じ配色メソッドの
// 並び（青→橙→アクア→黄→マゼンタ→緑）を踏襲し、上位6科目まで割り当てる。
// 並び順はCVD(色覚特性)の隣接ペア検証を通過済みの固定順で、ランク付けの
// 意味は持たせない（回転させない）。
const CATEGORY_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
];
const CATEGORY_COLORS_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
];
// "その他"は実カテゴリではなく残余バケットのため、彩度のある色ではなく
// 中立なグレー（軸・補助テキストと同系色）で表現し、実科目と区別する。
const OTHER_COLOR = "#898781";

const ROW_HEIGHT = 30;
const BAR_HEIGHT = 16;
const MARGIN = { top: 4, right: 96, bottom: 4, left: 132 };
const CHART_WIDTH = 620;
const CORNER_RADIUS = 4;

function colorFor(index: number, account: string, isDark: boolean): string {
  if (account === OTHER_ACCOUNT_LABEL) return OTHER_COLOR;
  const palette = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS;
  return palette[index] ?? OTHER_COLOR;
}

/** 左端(baseline)は角のまま、右端(データの先端)だけを丸めた横棒のpathを作る */
function barPath(xStart: number, xEnd: number, y: number, height: number): string {
  const width = Math.max(0, xEnd - xStart);
  const r = Math.min(CORNER_RADIUS, width / 2, height / 2);
  if (width <= 0) return `M${xStart},${y} L${xStart},${y + height} Z`;
  return `M${xStart},${y} L${xEnd - r},${y} Q${xEnd},${y} ${xEnd},${y + r} L${xEnd},${y + height - r} Q${xEnd},${y + height} ${xEnd - r},${y + height} L${xStart},${y + height} Z`;
}

export function ExpenseBreakdownChart({ breakdown, title }: { breakdown: ExpenseBreakdown; title: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  // SVGのfillはCSS変数(--viz-series-*相当)を使えないpath要素があるため、
  // 明暗どちらのテーマで表示されているかをJS側でも把握し、色配列を切り替える。
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // このアプリのダークモードは prefers-color-scheme のみで切り替わる
    // （globals.css の .viz-dashboard 配色と同じ判定基準に合わせる）。
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    function update() {
      setIsDark(media?.matches ?? false);
    }
    update();
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);

  const { slices, total } = breakdown;

  if (slices.length === 0) {
    return (
      <div className="viz-dashboard">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">{title}</h3>
        <p className="text-sm text-stone-500">表示できるデータがありません。</p>
      </div>
    );
  }

  const trackWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const maxAmount = Math.max(...slices.map((s) => s.amount), 1);
  const height = MARGIN.top + MARGIN.bottom + slices.length * ROW_HEIGHT;

  function xScale(amount: number): number {
    return MARGIN.left + (amount / maxAmount) * trackWidth;
  }

  return (
    <div className="viz-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
        <div className="flex items-center gap-4">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            経費合計 <span className="tabular-nums">{yen.format(total)}</span>円
          </span>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-stone-500 dark:text-stone-400 underline underline-offset-2 hover:text-stone-700 dark:hover:text-stone-200"
          >
            {showTable ? "グラフ表示に戻す" : "表で見る"}
          </button>
        </div>
      </div>

      {showTable ? (
        <BreakdownTable slices={slices} total={total} />
      ) : (
        <div className="relative overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md bg-[var(--viz-surface)] py-2">
          <svg width="100%" height={height} viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={title} className="block">
            {slices.map((s, i) => {
              const y = MARGIN.top + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              const barEnd = xScale(s.amount);
              const isHovered = hoverIndex === i;
              const color = colorFor(i, s.account, isDark);
              return (
                <g key={s.account}>
                  <text
                    x={MARGIN.left - 8}
                    y={y + BAR_HEIGHT / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-stone-600 dark:fill-stone-300"
                    fontSize={11}
                  >
                    {truncateLabel(s.account)}
                  </text>
                  <path
                    d={barPath(MARGIN.left, barEnd, y, BAR_HEIGHT)}
                    fill={color}
                    opacity={hoverIndex === null || isHovered ? 0.9 : 0.4}
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                  />
                  <text
                    x={barEnd + 8}
                    y={y + BAR_HEIGHT / 2}
                    dominantBaseline="middle"
                    className="fill-stone-500 dark:fill-stone-400"
                    fontSize={11}
                  >
                    {s.percent}%
                  </text>
                </g>
              );
            })}
          </svg>

          {hoverIndex !== null &&
            (() => {
              const s = slices[hoverIndex];
              return (
                <div
                  className="absolute pointer-events-none rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-xs shadow-sm"
                  style={{ top: MARGIN.top + hoverIndex * ROW_HEIGHT, left: MARGIN.left + 12 }}
                >
                  <div className="flex items-center gap-2 text-stone-700 dark:text-stone-200 font-medium mb-0.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(hoverIndex, s.account, isDark) }} />
                    {s.account}
                  </div>
                  <div className="text-stone-600 dark:text-stone-300 tabular-nums">
                    {yen.format(s.amount)}円（{s.percent}%）
                  </div>
                  {s.account === OTHER_ACCOUNT_LABEL && (
                    <div className="text-stone-500 dark:text-stone-400 mt-0.5">上位科目以外の合計です</div>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}

function truncateLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}

function BreakdownTable({ slices, total }: { slices: ExpenseBreakdownSlice[]; total: number }) {
  return (
    <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
            <th className="px-3 py-2 font-normal">勘定科目</th>
            <th className="px-3 py-2 font-normal text-right">金額</th>
            <th className="px-3 py-2 font-normal text-right">割合</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.account} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap">{s.account}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(s.amount)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{s.percent}%</td>
            </tr>
          ))}
          <tr className="font-medium text-stone-700 dark:text-stone-200">
            <td className="px-3 py-1.5">合計</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(total)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
