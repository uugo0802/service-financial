// 「なぜこの仕訳？」機能: CategorizedTransaction（ルールベース/AI/手入力の判定結果）を、
// ユーザーが読める説明文に整形するロジック。
// 純粋関数のみを提供し、UIの見た目や副作用は持たない（表示側は components/CategorizationRationale.tsx）。
//
// 重要: これは「本アプリがどのように今回の科目・税区分を判定したか」の解説であり、
// 個別具体の税務相談ではない。文言はこの前提を崩さないように書くこと。

import { CategorizedTransaction } from "./engine";

/** UIでの強調度合い。confirmed=そのままでよい、caution=念のため確認推奨、needsReview=必ず確認してほしい */
export type RationaleTone = "confirmed" | "caution" | "needsReview";

export interface CategorizationRationale {
  /** 短い見出し（例: 「ルール一致」「AI判定（確信度72%）」「未分類（要確認）」「手入力」） */
  headline: string;
  /** 「なぜこの科目・税区分になったか」を説明する本文 */
  explanation: string;
  /** UIでの表示強度を決める3段階の温度感 */
  tone: RationaleTone;
  /** 0〜100（%）。手入力など確信度の概念がない場合は null */
  confidencePercent: number | null;
  /** ユーザーに再確認を促す文言。tone が "confirmed" の場合は null */
  reviewMessage: string | null;
}

/** engine.ts の CONFIDENCE_THRESHOLD と同じ値。AI判定の確信度がこれ未満なら要確認扱いにする */
const LOW_CONFIDENCE_THRESHOLD = 0.75;

/**
 * 「このアプリがどう判定したかの説明であり、個別の税務相談ではない」ことを明示するための定型文。
 * 根拠表示コンポーネントの末尾等で必ず併記する。
 */
export const RATIONALE_DISCLAIMER =
  "これは本アプリが今回の科目・税区分をどう判定したかの説明であり、個別の税務相談ではありません。最終的な内容はご自身でご確認・ご判断ください。";

function toPercent(confidence: number): number {
  const clamped = Math.min(1, Math.max(0, confidence));
  return Math.round(clamped * 100);
}

/** 税区分や科目名に「要確認」が含まれる場合は、判定元に関わらず要確認として扱う */
function isFlaggedAsNeedsConfirmation(tx: CategorizedTransaction): boolean {
  return tx.taxCategory === "要確認" || tx.account.includes("要確認");
}

function buildRuleRationale(tx: CategorizedTransaction): CategorizationRationale {
  const flagged = isFlaggedAsNeedsConfirmation(tx);
  const explanation = tx.note
    ? `ルール一致: ${tx.note}`
    : `ルール一致: 摘要「${tx.description}」の内容から『${tx.account}』（${tx.taxCategory}）と自動判定しました。`;

  return {
    headline: "ルール一致（自動判定）",
    explanation,
    tone: flagged ? "needsReview" : "confirmed",
    confidencePercent: toPercent(tx.confidence),
    reviewMessage: flagged
      ? "このルールは機械的な文字列照合による判定です。税区分・科目が実態に合っているか、ご自身でご確認ください。"
      : null,
  };
}

function buildAiRationale(tx: CategorizedTransaction): CategorizationRationale {
  const percent = toPercent(tx.confidence);
  const lowConfidence = tx.confidence < LOW_CONFIDENCE_THRESHOLD;
  const flagged = isFlaggedAsNeedsConfirmation(tx) || lowConfidence;
  const reasoning = tx.note?.trim();

  const explanation = reasoning
    ? `AI判定（確信度${percent}%）: ${reasoning}`
    : `AI判定（確信度${percent}%）: 取引内容から『${tx.account}』（${tx.taxCategory}）と推定しました。`;

  return {
    headline: `AI判定（確信度${percent}%）`,
    explanation,
    tone: flagged ? (lowConfidence ? "needsReview" : "caution") : "confirmed",
    confidencePercent: percent,
    reviewMessage: flagged
      ? "AIによる推定です。確信度が低い、または家事按分・課税区分の判断が分かれやすい項目の可能性があります。内容をご確認のうえ、必要であれば修正してください。"
      : null,
  };
}

function buildManualRationale(tx: CategorizedTransaction): CategorizationRationale {
  return {
    headline: "手入力",
    explanation: tx.note
      ? `手入力: ${tx.note}`
      : `この仕訳はご自身で『${tx.account}』（${tx.taxCategory}）として入力した内容です。`,
    tone: "confirmed",
    confidencePercent: null,
    reviewMessage: null,
  };
}

function buildUncategorizedRationale(tx: CategorizedTransaction): CategorizationRationale {
  return {
    headline: "未分類（要確認）",
    explanation:
      "ルール・AIのいずれでも十分な確信度で判定できませんでした。摘要の内容を確認し、勘定科目・消費税区分をご自身で選択してください。",
    tone: "needsReview",
    confidencePercent: toPercent(tx.confidence),
    reviewMessage: "この取引はまだ自動判定できていません。内容を確認し、正しい科目・税区分に修正してください。",
  };
}

/**
 * ルールベース/AI/手入力/未分類のいずれの判定結果からも、
 * 人間が読める根拠説明（見出し・本文・温度感・確信度・再確認文言）を組み立てる。
 */
export function buildCategorizationRationale(tx: CategorizedTransaction): CategorizationRationale {
  switch (tx.source) {
    case "rule":
      return buildRuleRationale(tx);
    case "ai":
      return buildAiRationale(tx);
    case "manual":
      return buildManualRationale(tx);
    case "uncategorized":
    default:
      return buildUncategorizedRationale(tx);
  }
}
