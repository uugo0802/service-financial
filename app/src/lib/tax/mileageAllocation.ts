import { clampBusinessUsePercent, allocateAmount, type AllocationAmounts } from "./expenseAllocation";

// ------------------------------------------------------------------
// 走行距離（マイレージ）ベースの車両費按分（個人事業主向け）
//
// 車両費（ガソリン代・車検代・自動車保険料・減価償却費など）について、
// 「事業按分率を数値で直接入力する」代わりに、ユーザー自身が記録した
// 走行距離ログ（日付・目的・事業利用km・当該期間の総走行km）から
// 事業按分率を逆算し、車両費の金額に適用するための補助計算モジュール。
//
// expenseAllocation.ts の按分率直接入力フロー（家事按分）を置き換えるものではなく、
// 「按分率をどう求めるか」の入力手段を増やす補完的な計算機である。
// 求めた按分率は、そのまま expenseAllocation.ts の按分ロジック（allocateAmount）に
// 引き渡して金額計算する。
//
// 免責: expenseAllocation.ts と同様、本モジュールは記録された走行距離から
// 事業按分率を「計算」するのみであり、按分率（走行距離ログの内容・目的按分の是非等）
// そのものが税務上妥当かどうかの判断は一切行いません（税理士法第2条）。
// 走行距離ログの記録方法・保管、按分率の最終判断はユーザー自身の責任で行い、
// 必要に応じて税理士にご相談ください。
// ------------------------------------------------------------------

export const MILEAGE_GENERAL_NOTE =
  "走行距離ベースの事業按分率は、入力された事業利用km・総走行kmの合計から機械的に算出した概算です。走行距離ログの正確性や記録方法、算出された按分率が税務上妥当かどうかについては判断していません。ログ（日付・目的・距離など）の記録・保管とあわせて、最終的な判断はご自身（または税理士）で行ってください。";

/**
 * 走行距離ログの1エントリ（1回の走行、または一定期間の集計行）。
 *
 * - date: 走行日（表示・ソート用途。任意のフォーマットの文字列でよい）
 * - purpose: 目的・摘要（例: 「取引先訪問」「資材の買い出し」など。任意入力）
 * - businessKm: このエントリのうち事業利用とみなす走行距離（km）
 * - totalKm: このエントリの総走行距離（km）。businessKm はこの範囲に収まっている前提。
 *
 * 1トリップ単位で記録してもよいし、「今月の事業利用km / 今月の総走行km」のように
 * 期間を集約した1行として入力してもよい（aggregateMileageLog はどちらでも対応する）。
 */
export interface MileageLogEntry {
  date: string;
  purpose?: string;
  businessKm: number;
  totalKm: number;
}

export interface MileageAggregate {
  /** 全エントリの事業利用km合計 */
  totalBusinessKm: number;
  /** 全エントリの総走行km合計 */
  totalKm: number;
  /** 集計対象になったログ件数 */
  entryCount: number;
  /** totalBusinessKm / totalKm から算出した事業按分率（0〜100、totalKmが0の場合は0） */
  businessUsePercent: number;
}

export interface MileageAllocationResult extends AllocationAmounts {
  aggregate: MileageAggregate;
  /** 按分対象にした車両費の金額（絶対値） */
  totalAmount: number;
  generalNote: string;
}

/** 走行距離を0以上の有限値に正規化する（不正値は0扱い） */
function normalizeKm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * 走行距離ログを集計し、事業按分率（0〜100%）を算出する。
 * 総走行km（totalKm合計）が0の場合はゼロ除算を避け、按分率は0%として扱う。
 * businessKm が totalKm を超えるエントリがあっても、集計上は入力値をそのまま合算する
 * （個別エントリの妥当性チェックは行わない。異常値の判断はユーザー・税理士の領域）。
 */
export function aggregateMileageLog(entries: MileageLogEntry[]): MileageAggregate {
  let totalBusinessKm = 0;
  let totalKm = 0;

  for (const entry of entries) {
    totalBusinessKm += normalizeKm(entry.businessKm);
    totalKm += normalizeKm(entry.totalKm);
  }

  const businessUsePercent =
    totalKm === 0 ? 0 : clampBusinessUsePercent((totalBusinessKm / totalKm) * 100);

  return {
    totalBusinessKm,
    totalKm,
    entryCount: entries.length,
    businessUsePercent,
  };
}

/**
 * 走行距離ログから求めた事業按分率を、車両費の金額（絶対値・税込想定）に適用し、
 * 事業経費分・家事関連費（対象外）分に分解する。
 * 金額按分のロジック自体は expenseAllocation.ts の allocateAmount と共通（端数は
 * 家事関連費側に寄せる四捨五入）。
 */
export function allocateVehicleExpenseByMileage(
  entries: MileageLogEntry[],
  vehicleExpenseAmountAbs: number
): MileageAllocationResult {
  const aggregate = aggregateMileageLog(entries);
  const safeAmount = Number.isFinite(vehicleExpenseAmountAbs) ? Math.max(0, vehicleExpenseAmountAbs) : 0;
  const { businessAmount, personalAmount } = allocateAmount(safeAmount, aggregate.businessUsePercent);

  return {
    aggregate,
    totalAmount: safeAmount,
    businessAmount,
    personalAmount,
    generalNote: MILEAGE_GENERAL_NOTE,
  };
}
