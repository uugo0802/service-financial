import { TrendPoint } from "./salesTrend";

// ------------------------------------------------------------------
// 複数年度の経営指標（KPI）を、salesTrend.ts の年次時系列（TrendPoint[]、
// buildYearlyTrend の出力）から算出する。オーナー要望の「過去の売り上げの
// 推移の確認」を補強し、ダッシュボードに売上・経費だけでなく損益率・
// 前年比成長率まで含めた多年度の経営指標サマリーを表示するためのもの。
// ------------------------------------------------------------------

export interface KpiTrendPoint {
  /** 年度。salesTrend.ts の TrendPoint.key（年次集計時は "YYYY"）をそのまま使う */
  key: string;
  /** 年間売上（円） */
  revenue: number;
  /** 年間経費（円） */
  expense: number;
  /** 年間損益（円）= revenue - expense */
  netIncome: number;
  /** 経費率(%) = expense / revenue * 100。売上が0以下の年はゼロ除算を避けnullを返す */
  expenseRatio: number | null;
  /** 前年比の売上成長率(%)。系列内で最初の年、または前年の売上が0以下の場合はnull */
  revenueGrowth: number | null;
}

/**
 * 年次の売上・経費の時系列（`buildYearlyTrend` の出力を想定）から、年度別の
 * 経営指標（売上・経費・損益・経費率・前年比売上成長率）を算出する。
 *
 * - 呼び出し側が年度の昇順でない配列を渡してもよいように、内部で必ず key の
 *   昇順にソートしてから集計する（salesTrend.ts の buildYearlyTrend は本来
 *   昇順で返すが、他の集計元から渡された場合の防御でもある）。
 * - 経費率・前年比成長率は、分母が0以下になる場合にゼロ除算・NaN・Infinityを
 *   返さず、代わりにnull（「算出不可」）を返す。
 * - 系列内の最初の年は比較対象となる前年が存在しないため、revenueGrowthは
 *   常にnullになる。
 */
export function buildKpiTrend(points: readonly TrendPoint[]): KpiTrendPoint[] {
  const sorted = [...points].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return sorted.map((point, index) => {
    const revenue = point.income;
    const expense = point.expense;
    const netIncome = revenue - expense;
    const expenseRatio = revenue > 0 ? (expense / revenue) * 100 : null;

    const previous = index > 0 ? sorted[index - 1] : null;
    const revenueGrowth = previous && previous.income > 0 ? ((revenue - previous.income) / previous.income) * 100 : null;

    return { key: point.key, revenue, expense, netIncome, expenseRatio, revenueGrowth };
  });
}
