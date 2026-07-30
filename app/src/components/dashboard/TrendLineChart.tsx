"use client";

import { useMemo, useState } from "react";
import { TrendPoint } from "@/lib/tax/salesTrend";
import { computeTrendAxisRange } from "@/lib/dashboard/trendAxisScale";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function formatMan(v: number): string {
  return `${Math.round(v / 10_000).toLocaleString()}万円`;
}

const SERIES = [
  { key: "income" as const, label: "売上", varName: "--viz-series-income" },
  { key: "expense" as const, label: "経費", varName: "--viz-series-expense" },
  { key: "profit" as const, label: "損益", varName: "--viz-series-profit" },
];

const MARGIN = { top: 16, right: 16, bottom: 32, left: 64 };
const STEP_X = 48;
const HEIGHT = 260;

export function TrendLineChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const width = Math.max(360, MARGIN.left + MARGIN.right + (points.length - 1) * STEP_X);
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotHeight = plotBottom - plotTop;

  const { min, max, ticks } = useMemo(() => {
    const values = points.flatMap((p) => [p.income, p.expense, p.profit]);
    return computeTrendAxisRange(values);
  }, [points]);

  function yScale(v: number): number {
    if (max === min) return plotBottom;
    return plotBottom - ((v - min) / (max - min)) * plotHeight;
  }
  function xScale(i: number): number {
    return MARGIN.left + i * STEP_X;
  }

  function pathFor(getValue: (p: TrendPoint) => number): string {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(getValue(p))}`).join(" ");
  }

  const zeroY = yScale(0);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width; // svg width属性はCSSでスケールされないため通常1だが、念のため補正する
    const localX = (e.clientX - rect.left) * scaleX;
    const idx = Math.round((localX - MARGIN.left) / STEP_X);
    setHoverIndex(Math.min(points.length - 1, Math.max(0, idx)));
  }

  if (points.length === 0) {
    return <p className="text-sm text-stone-500">表示できるデータがありません。</p>;
  }

  return (
    <div className="viz-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
        <div className="flex items-center gap-4">
          <Legend />
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
        <TrendTable points={points} />
      ) : (
        <div className="relative overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md bg-[var(--viz-surface)]">
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={title}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
            className="block"
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text x={MARGIN.left - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="fill-stone-500 dark:fill-stone-400" fontSize={10}>
                  {formatMan(t)}
                </text>
              </g>
            ))}

            {/* ゼロ基準線（損益がマイナスになる領域を分かりやすくする） */}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={zeroY} y2={zeroY} stroke="var(--viz-axis)" strokeWidth={1} />

            {SERIES.map((s) => (
              <path key={s.key} d={pathFor((p) => p[s.key])} fill="none" stroke={`var(${s.varName})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {SERIES.map((s) => {
              const last = points[points.length - 1];
              const cy = yScale(last[s.key]);
              const cx = xScale(points.length - 1);
              return (
                <circle key={s.key} cx={cx} cy={cy} r={4} fill={`var(${s.varName})`} stroke="var(--viz-surface)" strokeWidth={2} />
              );
            })}

            {hoverIndex !== null && (
              <line
                x1={xScale(hoverIndex)}
                x2={xScale(hoverIndex)}
                y1={plotTop}
                y2={plotBottom}
                stroke="var(--viz-axis)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}

            {points.map((p, i) => {
              // ラベルが密集しすぎないよう、点数が多い場合は間引く
              const step = points.length > 18 ? 3 : points.length > 10 ? 2 : 1;
              if (i % step !== 0 && i !== points.length - 1) return null;
              return (
                <text key={p.key} x={xScale(i)} y={HEIGHT - 12} textAnchor="middle" className="fill-stone-500 dark:fill-stone-400" fontSize={10}>
                  {p.key}
                </text>
              );
            })}
          </svg>

          {hovered && hoverIndex !== null && (
            <div
              className="absolute top-2 pointer-events-none rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-xs shadow-sm"
              style={{ left: Math.min(xScale(hoverIndex) + 12, width - 160) }}
            >
              <div className="font-medium text-stone-700 dark:text-stone-200 mb-1">{hovered.key}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: `var(${s.varName})` }} />
                  <span className="w-8">{s.label}</span>
                  <span className="tabular-nums">{yen.format(hovered[s.key])}円</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: `var(${s.varName})` }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TrendTable({ points }: { points: TrendPoint[] }) {
  return (
    <div className="overflow-x-auto border border-stone-200 dark:border-stone-700 rounded-md">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
            <th className="px-3 py-2 font-normal">期間</th>
            <th className="px-3 py-2 font-normal text-right">売上</th>
            <th className="px-3 py-2 font-normal text-right">経費</th>
            <th className="px-3 py-2 font-normal text-right">損益</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{p.key}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.income)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.expense)}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${p.profit < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                {yen.format(p.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
