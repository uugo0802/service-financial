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

const BAR_WIDTH = 20; // マーク仕様: 棒は24px以下
const BAR_GAP = 2; // 隣接する棒同士の間は面(背景色)の2pxで分離する
const GROUP_GAP = 28;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 64 };
const HEIGHT = 260;
const CORNER_RADIUS = 4;

/** データ側の端(baselineと反対側)だけを4px丸め、baseline側は角のまま伸ばす */
function barPath(x: number, w: number, yBaseline: number, yEnd: number): string {
  const top = Math.min(yBaseline, yEnd);
  const bottom = Math.max(yBaseline, yEnd);
  const r = Math.min(CORNER_RADIUS, bottom - top);
  const growsUp = yEnd < yBaseline; // SVG座標系はy軸が下向きに増加する

  if (growsUp) {
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${bottom} Z`;
  }
  return `M${x},${top} L${x + w},${top} L${x + w},${bottom - r} Q${x + w},${bottom} ${x + w - r},${bottom} L${x + r},${bottom} Q${x},${bottom} ${x},${bottom - r} Z`;
}

export function TrendBarChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const [hover, setHover] = useState<{ pointIndex: number; seriesKey: string } | null>(null);
  const [showTable, setShowTable] = useState(false);

  const groupWidth = SERIES.length * BAR_WIDTH + (SERIES.length - 1) * BAR_GAP;
  const width = Math.max(360, MARGIN.left + MARGIN.right + points.length * groupWidth + (points.length - 1) * GROUP_GAP);
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotHeight = plotBottom - plotTop;

  const { min, max, ticks } = useMemo(() => {
    const values = points.flatMap((p) => [p.income, p.expense, p.profit]);
    return computeTrendAxisRange(values, { floorMaxAtOne: true });
  }, [points]);

  function yScale(v: number): number {
    if (max === min) return plotBottom;
    return plotBottom - ((v - min) / (max - min)) * plotHeight;
  }

  const zeroY = yScale(0);

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>;
  }

  return (
    <div className="viz-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-4">
          <Legend />
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showTable ? "グラフ表示に戻す" : "表で見る"}
          </button>
        </div>
      </div>

      {showTable ? (
        <TrendTable points={points} />
      ) : (
        <div className="relative overflow-x-auto border border-border rounded-lg bg-[var(--viz-surface)]">
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={title} className="block">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yScale(t)} y2={yScale(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={MARGIN.left - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="fill-stone-500 dark:fill-stone-400" fontSize={10}>
                  {formatMan(t)}
                </text>
              </g>
            ))}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={zeroY} y2={zeroY} stroke="var(--viz-axis)" strokeWidth={1} />

            {points.map((p, gi) => {
              const groupX = MARGIN.left + gi * (groupWidth + GROUP_GAP);
              return (
                <g key={p.key}>
                  {SERIES.map((s, si) => {
                    const barX = groupX + si * (BAR_WIDTH + BAR_GAP);
                    const value = p[s.key];
                    const isHovered = hover?.pointIndex === gi && hover.seriesKey === s.key;
                    return (
                      <path
                        key={s.key}
                        d={barPath(barX, BAR_WIDTH, zeroY, yScale(value))}
                        fill={`var(${s.varName})`}
                        opacity={isHovered ? 1 : 0.9}
                        onMouseEnter={() => setHover({ pointIndex: gi, seriesKey: s.key })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                  <text x={groupX + groupWidth / 2} y={HEIGHT - 10} textAnchor="middle" className="fill-stone-500 dark:fill-stone-400" fontSize={11}>
                    {p.key}
                  </text>
                </g>
              );
            })}
          </svg>

          {hover &&
            (() => {
              const p = points[hover.pointIndex];
              const s = SERIES.find((x) => x.key === hover.seriesKey)!;
              const groupX = MARGIN.left + hover.pointIndex * (groupWidth + GROUP_GAP);
              return (
                <div
                  className="absolute top-2 pointer-events-none rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                  style={{ left: Math.min(groupX, width - 160) }}
                >
                  <div className="font-medium text-foreground mb-1">{p.key}年</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: `var(${s.varName})` }} />
                    <span>{s.label}</span>
                    <span className="tabular-nums">{yen.format(p[s.key])}円</span>
                  </div>
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
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
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-normal">年度</th>
            <th className="px-3 py-2 font-normal text-right">売上</th>
            <th className="px-3 py-2 font-normal text-right">経費</th>
            <th className="px-3 py-2 font-normal text-right">損益</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{p.key}年</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.income)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.expense)}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${p.profit < 0 ? "text-danger" : ""}`}>
                {yen.format(p.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
