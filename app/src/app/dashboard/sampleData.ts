import { CategorizedTransaction } from "@/lib/categorize/engine";

// ------------------------------------------------------------------
// ダッシュボード確認用のサンプルデータ。
// Supabase実データ連携は別トラックのため、ここでは複数年度分の売上・経費を
// 疑似的に生成する（Math.randomは使わず、再現性のある式で生成する）。
// ------------------------------------------------------------------

const START_YEAR = 2024;
const START_MONTH = 1;
const END_YEAR = 2026;
const END_MONTH = 7; // 直近期（今期）の途中までのデータを想定

// 1月始まりの季節係数。年末に繁忙期、年始に閑散期がある業務委託業を仮定
const SEASONAL_FACTORS = [0.92, 0.9, 1.02, 1.05, 1.0, 0.97, 0.95, 0.9, 1.03, 1.08, 1.12, 1.2];

function listMonths(): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = START_YEAR;
  let m = START_MONTH;
  while (y < END_YEAR || (y === END_YEAR && m <= END_MONTH)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function roundTo1000(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/**
 * 複数年度分の売上・経費のサンプル取引を生成する。
 * 実際の記帳データではなく、ダッシュボードの見え方を確認するための疑似データ。
 */
export function buildSampleTransactions(): CategorizedTransaction[] {
  const rows: CategorizedTransaction[] = [];

  listMonths().forEach(({ year, month }, monthsElapsed) => {
    const growth = 1 + monthsElapsed * 0.012; // 緩やかな右肩上がりの成長を仮定
    const seasonal = SEASONAL_FACTORS[month - 1];
    const income = roundTo1000(850_000 * growth * seasonal);

    // 開業初期はコスト比率が高く、徐々に改善していく想定
    const expenseRatio = Math.max(0.42, 0.58 - monthsElapsed * 0.004);
    const expense = roundTo1000(income * expenseRatio);

    const date = `${year}-${String(month).padStart(2, "0")}-20`;

    rows.push({
      id: `sample-income-${year}-${month}`,
      date,
      description: "サンプル: 業務委託料入金",
      amount: income,
      account: "売上高",
      taxCategory: "課税売上10%",
      confidence: 1,
      source: "rule",
    });
    rows.push({
      id: `sample-expense-${year}-${month}`,
      date,
      description: "サンプル: 経費一式",
      amount: -expense,
      account: "経費合計",
      taxCategory: "課税仕入10%",
      confidence: 1,
      source: "rule",
    });

    // 単純な成長曲線だけだと不自然なため、機材更新などの一時的な支出を1回混ぜる
    if (year === 2025 && month === 8) {
      rows.push({
        id: `sample-expense-onetime-${year}-${month}`,
        date,
        description: "サンプル: PC・什器買い替え",
        amount: -420_000,
        account: "工具器具備品",
        taxCategory: "課税仕入10%",
        confidence: 1,
        source: "rule",
      });
    }
  });

  return rows;
}
