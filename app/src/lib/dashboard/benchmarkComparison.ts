import { CategorizedTransaction } from "../categorize/engine";
import { buildExpenseBreakdown, DEFAULT_TOP_N, OTHER_ACCOUNT_LABEL } from "../tax/expenseBreakdown";

// ------------------------------------------------------------------
// 業種・事業形態別の「参考ベンチマーク」との比較（ダッシュボード用）。
//
// 重要（税理士法第2条対応）: この機能は、ユーザー自身の経費構成（売上比）を、
// 静的に同梱した一般的な参考値と並べて表示するだけの「一般的な情報提供」です。
// - 他ユーザーの実データを集計・突合するものでは一切ありません（プライバシー上も
//   実装していません）。参考値は本ファイルに定数として同梱した静的データのみです。
// - 個々の利用者の状況を踏まえた個別最適化の助言（節税アドバイス等）は行いません。
// - 表示する際は必ず disclaimer（BENCHMARK_DISCLAIMER）をUIに明示してください。
//   文言は taxSavingChecklist.ts の TAX_SAVING_DISCLAIMER と同じトーンに揃えています。
// ------------------------------------------------------------------

export type BenchmarkSegmentId = "freelancer" | "microCorp";

export interface BenchmarkSegmentInfo {
  id: BenchmarkSegmentId;
  label: string;
}

/** UIの選択肢用。表示順もこの並びに揃える */
export const BENCHMARK_SEGMENTS: BenchmarkSegmentInfo[] = [
  { id: "freelancer", label: "フリーランス・個人事業主" },
  { id: "microCorp", label: "マイクロ法人" },
];

export const BENCHMARK_DISCLAIMER =
  "これは一般的な参考情報であり、個別具体の税務相談・経営アドバイスではありません。他のご利用者様の実データを集計したものではなく、業種・事業規模ごとの一般的な傾向をもとに当社が用意した静的な参考値（目安）です。実際の経費配分の適否は事業内容により大きく異なるため、判断にあたっては税理士等の専門家にご相談ください。";

/**
 * 業種・事業形態別の「売上に対する経費科目別の目安割合(%)」の静的参考データ。
 *
 * - 実在の他ユーザーのデータや、特定の統計調査の数値そのものではなく、一般的な
 *   傾向を踏まえてサービス側で用意した目安値（%）。年によって変動しうるため、
 *   あくまで「大まかな比較の参考」として扱うこと。
 * - キーは仕訳の勘定科目名（categorize/dictionary.ts の科目名）に合わせている。
 *   ここに無い科目は「参考値なし」として扱う（missingBenchmarkData）。
 */
const BENCHMARK_DISTRIBUTIONS: Record<BenchmarkSegmentId, Record<string, number>> = {
  freelancer: {
    外注費: 12,
    地代家賃: 8,
    旅費交通費: 4,
    通信費: 3,
    消耗品費: 3,
    接待交際費: 2,
    水道光熱費: 1.5,
    新聞図書費: 1,
    広告宣伝費: 3,
    支払手数料: 1.5,
    研修費: 1.5,
    諸会費: 0.5,
    荷造運賃: 1,
    損害保険料: 0.5,
  },
  microCorp: {
    役員報酬: 35,
    外注費: 8,
    地代家賃: 6,
    旅費交通費: 3,
    通信費: 2,
    接待交際費: 3,
    広告宣伝費: 4,
    支払手数料: 2,
    法定福利費: 4,
    福利厚生費: 1.5,
    租税公課: 1.5,
    研修費: 1,
    消耗品費: 1.5,
    水道光熱費: 1,
  },
};

/** 比較対象として表示する上位科目数の既定値（ExpenseBreakdown側と揃える） */
export const DEFAULT_BENCHMARK_TOP_N = DEFAULT_TOP_N;

export interface BenchmarkCategoryComparison {
  account: string;
  /** その科目の経費合計（円、正の値） */
  userAmount: number;
  /** 売上に対する割合(%)。売上が0以下の場合は算出不可のためnull */
  userPercentOfRevenue: number | null;
  /** 参考値（売上比%）。該当する参考データが無い科目（「その他」等）はnull */
  benchmarkPercentOfRevenue: number | null;
  /** userPercentOfRevenue - benchmarkPercentOfRevenue（ポイント差）。
   *  どちらかがnullの場合はnull */
  differencePoints: number | null;
}

export interface BenchmarkComparison {
  segment: BenchmarkSegmentId;
  segmentLabel: string;
  /** 比較の分母とした売上（円）。取引が無い場合は0 */
  revenue: number;
  categories: BenchmarkCategoryComparison[];
  disclaimer: string;
}

function computeRevenue(rows: readonly Pick<CategorizedTransaction, "amount" | "excludeFromIncome">[]): number {
  return rows.reduce((sum, r) => (r.amount > 0 && !r.excludeFromIncome ? sum + r.amount : sum), 0);
}

/**
 * 取引データから、経費科目トップN（+「その他」）を売上比(%)で算出し、
 * 指定した事業形態セグメントの静的参考値と並べて比較する。
 *
 * - 売上は amount > 0 かつ excludeFromIncome でない行の合計（salesTrend.ts と同じ定義）。
 * - 科目の抽出・上位N件+その他への集約は buildExpenseBreakdown をそのまま利用する
 *   （ダッシュボードの経費内訳チャートと同じロジック・同じ上位科目集合になる）。
 * - 売上が0以下の場合、userPercentOfRevenue は算出せずnullを返す（ゼロ除算回避）。
 *   取引が無い場合は categories が空配列になる（呼び出し側で空状態を表示する）。
 * - 参考データに存在しない科目（例:「その他」バケット、参考値の無い勘定科目）は
 *   benchmarkPercentOfRevenue が null になる（クラッシュせず「参考値なし」として扱う）。
 */
export function buildBenchmarkComparison(
  rows: readonly Pick<CategorizedTransaction, "account" | "amount" | "excludeFromIncome">[],
  segment: BenchmarkSegmentId,
  topN: number = DEFAULT_BENCHMARK_TOP_N
): BenchmarkComparison {
  const segmentInfo = BENCHMARK_SEGMENTS.find((s) => s.id === segment);
  const revenue = computeRevenue(rows);
  const { slices } = buildExpenseBreakdown([...rows], topN);
  const distribution = BENCHMARK_DISTRIBUTIONS[segment] ?? {};

  const categories: BenchmarkCategoryComparison[] = slices.map((slice) => {
    const userPercentOfRevenue = revenue > 0 ? (slice.amount / revenue) * 100 : null;
    const benchmarkPercentOfRevenue =
      slice.account === OTHER_ACCOUNT_LABEL ? null : (distribution[slice.account] ?? null);
    const differencePoints =
      userPercentOfRevenue !== null && benchmarkPercentOfRevenue !== null
        ? userPercentOfRevenue - benchmarkPercentOfRevenue
        : null;

    return {
      account: slice.account,
      userAmount: slice.amount,
      userPercentOfRevenue,
      benchmarkPercentOfRevenue,
      differencePoints,
    };
  });

  return {
    segment,
    segmentLabel: segmentInfo?.label ?? segment,
    revenue,
    categories,
    disclaimer: BENCHMARK_DISCLAIMER,
  };
}
