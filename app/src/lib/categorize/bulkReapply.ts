// カテゴライズルールの一括再適用（バックフィル）
//
// ユーザーがユーザー辞書ルール（userRules.ts）を追加・編集しても、それは「今後の」自動分類にしか
// 反映されず、すでに分類済みの過去の取引は自動では更新されない。本モジュールは、
// 「もし “現在の” ルール（ユーザー辞書 + 共通辞書）でもう一度分類し直したら、
// 各取引の勘定科目・税区分はどう変わるか」を差分として計算し、選択した取引だけを
// 実際に反映する、という一括再適用（バックフィル）機能を提供する。
//
// engine.ts / dictionary.ts / userRules.ts はいずれもこの機能の対象外（変更禁止）のため、
// それらが公開している実装済みの関数をそのまま呼び出す（分類ロジック自体は再実装しない）。
//
// 優先順位（mergeCategoryRules と同じ考え方）:
//   1. まずユーザー辞書ルール（現在登録されているもの）に一致するか確認する。
//      一致すれば、共通辞書より優先してそちらを採用する。
//   2. ユーザー辞書のどのルールにも一致しなければ、engine.ts の ruleBasedCategorize()
//      （共通辞書ベースの本物の分類エンジン）をそのまま呼び出し、その結果を採用する。
//
// 注意: これはMVP用の簡易ルールであり、正式な税務判断ではありません。
// 最終的な勘定科目・税区分の確定は必ず利用者本人が確認してください。

import { CategorizedTransaction, Transaction, ruleBasedCategorize } from "./engine";
import {
  UserCategoryRule,
  findMatchingRule,
  userCategoryRuleToCategoryRule,
} from "./userRules";

/**
 * 指定した取引を、現在のユーザー辞書ルール + 共通辞書で分類し直した結果を返す。
 *
 * ユーザー辞書ルールに一致した場合の「一致はしたが税区分が“要確認”のため未確定として扱う」
 * という判定は、engine.ts の ruleBasedCategorize() 内部にある isConfirmed の考え方
 * （このモジュールからは import できない private ロジック）と同じ考え方を、
 * userRules.ts 自身が findMatchingRule を複製しているのと同じ理由（engine.ts が対象外のため）で
 * ここでも小さく複製している。ユーザー辞書のどのルールにも一致しない場合は、この複製ロジックは
 * 一切使わず、engine.ts の ruleBasedCategorize() をそのまま呼び出す。
 */
export function recategorizeWithCurrentRules(
  tx: Transaction,
  currentUserRules: UserCategoryRule[]
): CategorizedTransaction {
  const userCategoryRules = currentUserRules.map(userCategoryRuleToCategoryRule);
  const matchedUserRule = findMatchingRule(tx.description, userCategoryRules);

  if (!matchedUserRule) {
    return ruleBasedCategorize(tx);
  }

  // engine.ts の ruleBasedCategorize と同じ考え方: ルールには一致しても税区分自体が
  // 「要確認」の場合は、勘定科目は特定できていても税区分は未確定とみなし、
  // 未分類の取引と同様に confidence=0・source="uncategorized" として扱う。
  const isConfirmed = matchedUserRule.taxCategory !== "要確認";

  return {
    ...tx,
    account: matchedUserRule.account,
    taxCategory: matchedUserRule.taxCategory,
    confidence: isConfirmed ? 1 : 0,
    source: isConfirmed ? "rule" : "uncategorized",
    note: matchedUserRule.note,
    personalDeductionOnly: matchedUserRule.personalDeductionOnly,
    excludeFromIncome: matchedUserRule.excludeFromIncome,
  };
}

/** 差分判定に使う3項目を、undefined/false を同一視して正規化した形で取り出す */
function normalizedCategorization(tx: CategorizedTransaction) {
  return {
    account: tx.account,
    taxCategory: tx.taxCategory,
    personalDeductionOnly: tx.personalDeductionOnly ?? false,
    excludeFromIncome: tx.excludeFromIncome ?? false,
  };
}

/**
 * 2つの分類結果が「勘定科目・税区分（および付随する税務上の扱い）」として実質的に異なるかどうかを判定する。
 *
 * 意図的に confidence は比較対象に含めない。confidence はルール一致/AI推定/未分類のいずれで
 * 判定したかによって変わりうる付随情報であり、勘定科目・税区分そのものが同じであれば
 * 「変更が必要な差分」ではない。ここで confidence まで比較してしまうと、AI分類（confidence が
 * 実数で返る）の取引が再分類のたびに数値のわずかな揺れ・丸め等で「変更あり」として大量に
 * 誤検出されてしまう（意図しないノイズによる過検出を避けるための設計）。
 */
export function hasCategorizationChanged(
  previous: CategorizedTransaction,
  next: CategorizedTransaction
): boolean {
  const a = normalizedCategorization(previous);
  const b = normalizedCategorization(next);
  return (
    a.account !== b.account ||
    a.taxCategory !== b.taxCategory ||
    a.personalDeductionOnly !== b.personalDeductionOnly ||
    a.excludeFromIncome !== b.excludeFromIncome
  );
}

/** 一括再適用の差分1件分。UIでの「旧→新」の表示・選択に使う */
export interface CategorizeReapplyDiffEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  /** 変更前（現在保存されている）の勘定科目・税区分 */
  previous: {
    account: string;
    taxCategory: CategorizedTransaction["taxCategory"];
    personalDeductionOnly?: boolean;
    excludeFromIncome?: boolean;
  };
  /** 現在のルールで再分類した結果。そのまま適用可能な完全な CategorizedTransaction */
  next: CategorizedTransaction;
}

export interface BulkReapplyDiffResult {
  diffs: CategorizeReapplyDiffEntry[];
  /** 対象にした取引の総数 */
  totalCount: number;
  /** 現在のルールで分類し直すと変わる取引数（= diffs.length） */
  changedCount: number;
}

/**
 * すでに分類済みの取引一覧を、現在のルール（ユーザー辞書 + 共通辞書）で再分類し、
 * 保存済みの分類結果と異なるものだけを差分として抽出する。
 *
 * 元の配列・要素はいずれも変更しない（純粋関数）。
 */
export function computeBulkReapplyDiff(
  transactions: CategorizedTransaction[],
  currentUserRules: UserCategoryRule[]
): BulkReapplyDiffResult {
  const diffs: CategorizeReapplyDiffEntry[] = [];

  for (const tx of transactions) {
    const next = recategorizeWithCurrentRules(tx, currentUserRules);
    if (hasCategorizationChanged(tx, next)) {
      diffs.push({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        previous: {
          account: tx.account,
          taxCategory: tx.taxCategory,
          personalDeductionOnly: tx.personalDeductionOnly,
          excludeFromIncome: tx.excludeFromIncome,
        },
        next,
      });
    }
  }

  return { diffs, totalCount: transactions.length, changedCount: diffs.length };
}

/** 「n件中m件が変更されます」という表示用サマリー文言を組み立てる */
export function formatBulkReapplySummary(result: BulkReapplyDiffResult): string {
  return `${result.totalCount}件中${result.changedCount}件が、現在のルールで再分類すると変更されます`;
}

/**
 * 差分のうち、選択された取引IDの分だけを実際に適用した、新しい取引一覧を返す。
 *
 * 選択されなかった取引・差分に含まれない取引はそのまま（同一参照）で返す。
 * DBへの永続化はこの関数の責務ではない（呼び出し側/UIが結果を保存する）。
 */
export function applySelectedReapply(
  transactions: CategorizedTransaction[],
  diffs: CategorizeReapplyDiffEntry[],
  selectedIds: Iterable<string>
): CategorizedTransaction[] {
  const idsToApply = new Set(selectedIds);
  const nextById = new Map<string, CategorizedTransaction>();
  for (const diff of diffs) {
    if (idsToApply.has(diff.id)) {
      nextById.set(diff.id, diff.next);
    }
  }

  return transactions.map((tx) => nextById.get(tx.id) ?? tx);
}
