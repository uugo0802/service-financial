import { CategorizedTransaction } from "../categorize/engine";

/**
 * 再アップロード時の重複取引検出。
 *
 * このプロトタイプは今のところアップロード内容をDBに永続化していないため、
 * 「セッション内で直前までに読み込んでいた行（existingRows）」と
 * 「新しくパースされた行（newRows）」を突き合わせるだけの、セッション内限定の検出。
 *
 * マッチ判定ルール（意図的にシンプルにしている。詳細は各ヘルパー関数のコメント参照）:
 *   1. 日付が一致する（数字以外を除去して比較するため "2026-01-05" と "2026/01/05" のような
 *      区切り文字違いは同一日付として扱う）
 *   2. 金額が一致する（同じCSV正規化ロジックを通っているため誤差はほぼ出ないが、念のため微小な
 *      浮動小数点誤差だけは許容する）
 *   3. 摘要が「よく似ている」（完全一致は求めない。全角/半角スペースの有無・大文字小文字・
 *      末尾の店舗コードや取引番号の付与など、銀行・カード会社が同じ取引を再エクスポートした際に
 *      起こりがちな軽微な表記ゆれを吸収するため、正規化した文字列同士のレーベンシュタイン距離から
 *      類似度スコア（0〜1）を計算し、閾値以上であれば一致とみなす）
 *
 * 日付・金額が一致しても摘要が大きく異なる場合（＝たまたま同じ日に同額の別取引があるケース）は
 * 重複とはみなさない。
 */

export interface DuplicateMatch {
  /** newRows 側で「重複の可能性がある」と判定された行の id */
  newRowId: string;
  /** 一致したとみなした existingRows 側の行の id（警告表示で参照する） */
  matchedExistingId: string;
  /** 摘要同士の類似度（0〜1、1が完全一致） */
  descriptionSimilarity: number;
}

/** 既定の摘要類似度の閾値。これ未満は「別の取引」とみなす */
export const DEFAULT_DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;

/** 金額比較の許容誤差（円未満の浮動小数点誤差の吸収用） */
const AMOUNT_EPSILON = 0.01;

/** 日付文字列を数字だけに正規化する（区切り文字の違いを吸収する） */
export function normalizeDate(date: string): string {
  return date.replace(/[^0-9]/g, "");
}

/** 摘要文字列を正規化する（大文字小文字・全角/半角スペースの違いを吸収する） */
export function normalizeDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, ""); // 半角・全角スペース類を除去
}

/** 2文字列間のレーベンシュタイン距離（編集距離） */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost));
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

/**
 * 摘要同士の類似度を 0〜1 で返す（1が完全一致、0が全く異なる）。
 * 正規化後の文字列に対して編集距離を取り、長い方の文字列長で割って類似度に変換する。
 */
export function descriptionSimilarity(a: string, b: string): number {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(na, nb);
  return 1 - distance / maxLen;
}

/**
 * newRows の中から existingRows と重複している可能性が高い行を検出する。
 * 各 newRow につき、日付・金額が一致する existingRows の候補の中で最も摘要類似度が高いものを採用し、
 * 類似度が閾値以上であればマッチとして返す（該当がなければその行は結果に含まれない）。
 */
export function detectDuplicates(
  existingRows: CategorizedTransaction[],
  newRows: CategorizedTransaction[],
  descriptionSimilarityThreshold: number = DEFAULT_DESCRIPTION_SIMILARITY_THRESHOLD
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const newRow of newRows) {
    let best: { id: string; score: number } | null = null;

    for (const existing of existingRows) {
      if (normalizeDate(existing.date) !== normalizeDate(newRow.date)) continue;
      if (Math.abs(existing.amount - newRow.amount) > AMOUNT_EPSILON) continue;

      const score = descriptionSimilarity(existing.description, newRow.description);
      if (score >= descriptionSimilarityThreshold && (!best || score > best.score)) {
        best = { id: existing.id, score };
      }
    }

    if (best) {
      matches.push({ newRowId: newRow.id, matchedExistingId: best.id, descriptionSimilarity: best.score });
    }
  }

  return matches;
}
