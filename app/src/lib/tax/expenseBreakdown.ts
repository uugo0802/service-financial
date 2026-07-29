import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 指定期間の仕訳データを、勘定科目（カテゴリ）別の経費内訳に集計する。
// salesTrend.ts が時系列（縦軸=期間）でグラフ化するのに対し、こちらは
// ある期間内の経費を科目別に横断集計し、内訳（ダッシュボードの
// 「経費内訳（カテゴリ別）」チャート）として使うためのもの。
// ------------------------------------------------------------------

/** 内訳の1行分。account は勘定科目名（"その他"バケットも同じ形で表現する） */
export interface ExpenseBreakdownSlice {
  account: string;
  /** その科目の経費合計（円、正の値） */
  amount: number;
  /** 全体に占める割合(%)。0〜100の整数で、全スライスの合計が必ず100になるよう
   *  最大剰余方式（largest remainder method）で丸めている（経費が存在する場合）。 */
  percent: number;
}

export interface ExpenseBreakdown {
  slices: ExpenseBreakdownSlice[];
  /** 経費合計（円）。内訳が空の場合は0 */
  total: number;
}

/** 上位科目に含めず「その他」へ集約する際のラベル */
export const OTHER_ACCOUNT_LABEL = "その他";

/** 上位いくつの科目までを個別表示するかの既定値。それ以降は"その他"へ集約する */
export const DEFAULT_TOP_N = 6;

/**
 * 仕訳データを勘定科目別に集計し、金額の降順・上位N件+その他バケットに整形する。
 *
 * - 集計対象は経費（amount < 0）のみ。収入行（amount >= 0）は無視する。
 * - 同じ科目は合算し、金額（絶対値）の降順でソートする（同額の場合は科目名の
 *   五十音順で安定ソートする）。
 * - 科目数が topN を超える場合、上位 (topN) 件はそのまま、残りは合算して
 *   "その他" として1件にまとめる（合計が0円になる場合は追加しない）。
 * - percent は合計に対する割合(%)を整数で算出し、最大剰余方式で丸め誤差を配分する
 *   ため、経費が1件でもあればスライスの percent 合計は必ず100になる。
 */
export function buildExpenseBreakdown(
  rows: Pick<CategorizedTransaction, "account" | "amount">[],
  topN: number = DEFAULT_TOP_N
): ExpenseBreakdown {
  const totalsByAccount = new Map<string, number>();
  for (const row of rows) {
    if (row.amount >= 0) continue; // 収入・0円の行は経費内訳の対象外
    const account = row.account || "未分類";
    totalsByAccount.set(account, (totalsByAccount.get(account) ?? 0) + Math.abs(row.amount));
  }

  const sorted = Array.from(totalsByAccount.entries())
    .map(([account, amount]) => ({ account, amount }))
    .sort((a, b) => b.amount - a.amount || a.account.localeCompare(b.account, "ja"));

  let entries: { account: string; amount: number }[];
  if (sorted.length > topN) {
    const top = sorted.slice(0, topN);
    const otherTotal = sorted.slice(topN).reduce((sum, e) => sum + e.amount, 0);
    entries = otherTotal > 0 ? [...top, { account: OTHER_ACCOUNT_LABEL, amount: otherTotal }] : top;
  } else {
    entries = sorted;
  }

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const slices = attachPercentages(entries, total);

  return { slices, total };
}

/**
 * 各エントリの割合(%)を整数で算出する。単純な四捨五入だと合計が100から
 * ずれることがあるため、まず切り捨てた値を使い、余った分（100との差）を
 * 端数（小数部分）が大きい順に1ずつ配分する（最大剰余方式）。
 */
function attachPercentages(
  entries: { account: string; amount: number }[],
  total: number
): ExpenseBreakdownSlice[] {
  if (total <= 0 || entries.length === 0) {
    return entries.map((e) => ({ ...e, percent: 0 }));
  }

  const rawPercents = entries.map((e) => (e.amount / total) * 100);
  const floored = rawPercents.map((v) => Math.floor(v));
  const flooredSum = floored.reduce((sum, v) => sum + v, 0);
  let remainder = 100 - flooredSum;

  const byRemainderDesc = rawPercents
    .map((v, index) => ({ index, fraction: v - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  const percents = [...floored];
  for (let i = 0; i < byRemainderDesc.length && remainder > 0; i++, remainder--) {
    percents[byRemainderDesc[i].index] += 1;
  }

  return entries.map((e, index) => ({ ...e, percent: percents[index] }));
}
