// ------------------------------------------------------------------
// 年度別 申告・記帳アーカイブ（過去実績の一覧化）。
//
// ダッシュボードの推移チャート（app/src/lib/tax/salesTrend.ts）とは別の切り口で、
// ユーザーが積み上げてきた年度ごとの記帳・申告データを「一覧で見返す」ための
// ビューモデルを組み立てる。年数を重ねるほど蓄積が可視化され、乗り換えコストの
// 実感につながることを狙った機能（business-plan.md 12章の「切り替えコスト」対応）。
//
// 免責: ここで扱う金額はあくまでユーザー自身の過去の記帳・概算データの並び替え・
// 比較表示であり、税務代理・個別税務相談を行うものではない。
// ------------------------------------------------------------------

/** 年度ごとの記帳・申告サマリー（入力データ） */
export interface YearlyFilingRecord {
  /** 会計年度（例: 2023 は「2023年分/期」を表す） */
  fiscalYear: number;
  /** 売上高（収入） */
  revenue: number;
  /** 経費 */
  expenses: number;
  /** 概算納税額（所得税・法人税・消費税等の合計見込み） */
  estimatedTax: number;
  /** 申告日（任意・ISO日付文字列。表示用） */
  filedAt?: string;
}

/** アーカイブ表示用に正規化された年度1件分のエントリ */
export interface YearArchiveEntry {
  fiscalYear: number;
  revenue: number;
  expenses: number;
  /** revenue - expenses */
  profit: number;
  estimatedTax: number;
  filedAt?: string;
  /** 直前に記録されている年度からの売上増減率（%、小数第1位に丸め）。比較対象がない場合は null */
  revenueChangePct: number | null;
  /** 直前に記録されている年度からの利益増減率（%、小数第1位に丸め）。比較対象がない場合は null */
  profitChangePct: number | null;
  /**
   * 直前に記録されている年度が fiscalYear - 1 ではない（記録の抜けがある）場合 true。
   * 配列の先頭（最も古い年度）は比較対象がないため常に false。
   */
  isGapYear: boolean;
}

/** アーカイブ画面全体で使うビューモデル */
export interface YearArchiveViewModel {
  /** 会計年度の昇順（古い→新しい）に並んだエントリ一覧 */
  entries: YearArchiveEntry[];
  /** 記録が存在する年度数（重複年度は1件に統合済み） */
  yearsRecorded: number;
  /** 最も新しい年度から遡って、記録が連続している年数（「継続◯年」の表示に使う） */
  continuousYearsStreak: number;
  /** 記録の抜けている箇所が1つでもあれば true */
  hasGaps: boolean;
  earliestFiscalYear: number | null;
  latestFiscalYear: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 前年度比の増減率（%）。比較対象がない、または比較対象が0の場合は null（意味のある割合を算出できないため） */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

/**
 * 年度ごとのサマリー配列から、アーカイブ表示用の正規化済みビューモデルを構築する。
 *
 * - 同一 fiscalYear が複数存在する場合は、配列内で最後に出現したレコードを採用する
 *   （後勝ち。入力側で「最新の確定値を末尾に置く」運用を想定）。
 * - 空配列を渡した場合は全項目0/nullの空ビューモデルを返す。
 */
export function buildYearArchive(records: YearlyFilingRecord[]): YearArchiveViewModel {
  const byYear = new Map<number, YearlyFilingRecord>();
  for (const r of records) {
    byYear.set(r.fiscalYear, r);
  }

  const sorted = Array.from(byYear.values()).sort((a, b) => a.fiscalYear - b.fiscalYear);

  const entries: YearArchiveEntry[] = sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const profit = r.revenue - r.expenses;
    const prevProfit = prev ? prev.revenue - prev.expenses : undefined;

    return {
      fiscalYear: r.fiscalYear,
      revenue: r.revenue,
      expenses: r.expenses,
      profit,
      estimatedTax: r.estimatedTax,
      filedAt: r.filedAt,
      revenueChangePct: prev ? percentChange(r.revenue, prev.revenue) : null,
      profitChangePct: prev && prevProfit !== undefined ? percentChange(profit, prevProfit) : null,
      isGapYear: prev ? r.fiscalYear !== prev.fiscalYear + 1 : false,
    };
  });

  const continuousYearsStreak = computeContinuousStreak(sorted.map((r) => r.fiscalYear));
  const hasGaps = entries.some((e) => e.isGapYear);

  return {
    entries,
    yearsRecorded: entries.length,
    continuousYearsStreak,
    hasGaps,
    earliestFiscalYear: sorted.length > 0 ? sorted[0].fiscalYear : null,
    latestFiscalYear: sorted.length > 0 ? sorted[sorted.length - 1].fiscalYear : null,
  };
}

/**
 * 最新年度から遡って、何年連続で記録が途切れていないかを数える。
 * 例: [2020, 2021, 2023, 2024] → 最新2024から遡ると2023はあるが2022がないので streak = 2。
 */
function computeContinuousStreak(sortedYears: number[]): number {
  if (sortedYears.length === 0) return 0;

  let streak = 1;
  for (let i = sortedYears.length - 1; i > 0; i--) {
    if (sortedYears[i] - sortedYears[i - 1] === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}
