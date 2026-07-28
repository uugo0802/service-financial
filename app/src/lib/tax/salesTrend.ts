import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 複数年度の仕訳データを、ダッシュボードのグラフで扱いやすい時系列の
// データポイント（月次 / 年次）に変換する。
// buildMonthlySalesTrend（businessOverviewForm.ts）は収入のみ・単一期間の
// 申告書用集計だが、こちらは収入・支出・損益をまとめて複数年度分扱う。
// ------------------------------------------------------------------

export interface TrendPoint {
  /** 月次は "YYYY-MM"、年次は "YYYY" */
  key: string;
  income: number;
  expense: number;
  profit: number;
}

function extractYearMonth(date: string): { year: string; yearMonth: string } | null {
  const m = date.match(/^(\d{4})[-/](\d{1,2})/);
  if (!m) return null;
  return { year: m[1], yearMonth: `${m[1]}-${m[2].padStart(2, "0")}` };
}

function aggregate(
  rows: CategorizedTransaction[],
  keyOf: (r: CategorizedTransaction) => string | null
): TrendPoint[] {
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    if (key === null) continue; // 日付が解釈できない行はグラフの時間軸を汚すため除外する
    const cur = buckets.get(key) ?? { income: 0, expense: 0 };
    // 借入金の実行・出資の払込等（nonRevenue）は入金でも売上ではないため、
    // 収入・支出どちらの集計にも含めない（資金移動であって損益ではないため）。
    if (r.amount > 0 && !r.nonRevenue) cur.income += r.amount;
    else if (r.amount < 0) cur.expense += Math.abs(r.amount);
    buckets.set(key, cur);
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, income: v.income, expense: v.expense, profit: v.income - v.expense }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** 複数年度分の仕訳データを月次(YYYY-MM)の収入・支出・損益の時系列に変換する */
export function buildMonthlyTrend(rows: CategorizedTransaction[]): TrendPoint[] {
  return aggregate(rows, (r) => extractYearMonth(r.date)?.yearMonth ?? null);
}

/** 複数年度分の仕訳データを年次(YYYY)の収入・支出・損益の時系列に変換する */
export function buildYearlyTrend(rows: CategorizedTransaction[]): TrendPoint[] {
  return aggregate(rows, (r) => extractYearMonth(r.date)?.year ?? null);
}
