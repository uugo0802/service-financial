// ------------------------------------------------------------------
// 複数年度/月次のトレンドチャート（components/dashboard/TrendBarChart.tsx /
// TrendLineChart.tsx）で共通して使われる、Y軸のスケール（最小値・最大値・目盛り）
// を算出する純粋関数。
//
// 両コンポーネントは元々ほぼ同一のロジックをそれぞれの内部（useMemo）に個別実装
// していたため、ここに1本化する。TrendBarChart は値がすべて0以下でも棒グラフの
// 高さを確保するため rawMax の下限を1にフロアしているが、TrendLineChart は
// フロアを適用しない。この差異は既存の見た目を変えないよう、floorMaxAtOne
// オプションで呼び出し側から明示的に選択させることでそのまま維持している
// （挙動を変更する意図の統一はスコープ外）。
// ------------------------------------------------------------------

export interface TrendAxisRange {
  /** Y軸の下端の値 */
  min: number;
  /** Y軸の上端の値 */
  max: number;
  /** 目盛り線の値（min→maxの均等割り、tickCount+1個） */
  ticks: number[];
}

export interface TrendAxisScaleOptions {
  /** true の場合、値がすべて0以下でも rawMax の下限を1にする（TrendBarChartの挙動） */
  floorMaxAtOne?: boolean;
  /** 目盛りの分割数（目盛りの本数は tickCount + 1）。既定は4 */
  tickCount?: number;
}

/**
 * 複数系列の数値群から、Y軸の表示範囲（min/max）と目盛り位置を算出する。
 * - 0は常に範囲に含める（利益がマイナスの年度でもゼロ基準線を表示できるようにするため）。
 * - 上下に10%のパディングを取る（値がすべて0でパディングが0になる場合は1で代替する）。
 */
export function computeTrendAxisRange(values: number[], options: TrendAxisScaleOptions = {}): TrendAxisRange {
  const tickCount = options.tickCount ?? 4;
  const rawMin = Math.min(0, ...values);
  const rawMax = options.floorMaxAtOne ? Math.max(0, ...values, 1) : Math.max(0, ...values);
  const pad = (rawMax - rawMin) * 0.1 || 1;
  const min = rawMin - (rawMin < 0 ? pad : 0);
  const max = rawMax + pad;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => min + ((max - min) * i) / tickCount);
  return { min, max, ticks };
}
