import { descriptionSimilarity, normalizeDate } from "../csv/duplicateDetection";
import { ReceiptJournalCandidate } from "./receiptCandidate";

/**
 * レシート/請求書OCRアップロードの重複検出。
 *
 * `../csv/duplicateDetection.ts` のCSV再アップロード時の重複検出と同じ考え方を、
 * レシート仕訳候補（{@link ReceiptJournalCandidate}）のデータ形状に合わせて適用したもの。
 * 日付正規化・文字列類似度の計算ロジックは同モジュールのものをそのまま再利用する
 * （摘要とレシートの「取引先」は性質が近いため、同じレーベンシュタイン距離ベースの
 * 類似度計算がそのまま使える）。
 *
 * このプロトタイプはレシートをDBに永続化していないため、CSV側と同様に
 * 「セッション内で直前までに確定した候補（existingReceipts）」と
 * 「今回OCRした新しい候補（candidate）」を突き合わせるだけの、セッション内限定の検出。
 *
 * マッチ判定ルール（CSV側と同じ意図でシンプルにしている）:
 *   1. 日付が一致する（区切り文字違いは同一日付として扱う）
 *   2. 金額が一致する（浮動小数点誤差だけは許容する）
 *   3. 取引先名が「よく似ている」（表記ゆれを吸収するため類似度スコアが閾値以上であれば一致とみなす）
 *
 * 日付・金額のどちらか一方でも読み取れていない（null）候補は、確信を持って重複と判定できないため、
 * 常に「重複なし」を返す。
 */

export interface ReceiptDuplicateMatch {
  /** 一致したとみなした既存候補（existingReceipts側）の id */
  matchedExistingId: string;
  /** 取引先名同士の類似度（0〜1、1が完全一致） */
  counterpartySimilarity: number;
}

/** 既定の取引先名類似度の閾値。これ未満は「別の取引」とみなす（CSV側の閾値と揃える） */
export const DEFAULT_COUNTERPARTY_SIMILARITY_THRESHOLD = 0.6;

/** 金額比較の許容誤差（円未満の浮動小数点誤差の吸収用。CSV側と揃える） */
const AMOUNT_EPSILON = 0.01;

/**
 * 新しくOCRした1件のレシート候補が、既に確定済みのレシート候補（existingReceipts）の
 * いずれかと重複している可能性が高いかどうかを判定する。
 *
 * candidateの日付・金額のいずれかが読み取れていない（null）場合や、existingReceipts側の
 * 該当項目がnullの場合は、その組み合わせは比較対象から除外する（確信が持てないため）。
 * 日付・金額が一致する候補が複数ある場合は、取引先名の類似度が最も高いものを採用する。
 */
export function findReceiptDuplicate(
  existingReceipts: ReceiptJournalCandidate[],
  candidate: ReceiptJournalCandidate,
  counterpartySimilarityThreshold: number = DEFAULT_COUNTERPARTY_SIMILARITY_THRESHOLD
): ReceiptDuplicateMatch | null {
  if (candidate.date === null || candidate.amount === null) return null;

  let best: { id: string; score: number } | null = null;

  for (const existing of existingReceipts) {
    if (existing.date === null || existing.amount === null) continue;
    if (normalizeDate(existing.date) !== normalizeDate(candidate.date)) continue;
    if (Math.abs(existing.amount - candidate.amount) > AMOUNT_EPSILON) continue;

    const score = descriptionSimilarity(existing.counterparty ?? "", candidate.counterparty ?? "");
    if (score >= counterpartySimilarityThreshold && (!best || score > best.score)) {
      best = { id: existing.id, score };
    }
  }

  return best ? { matchedExistingId: best.id, counterpartySimilarity: best.score } : null;
}
