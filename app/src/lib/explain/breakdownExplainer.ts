import { CategorizedTransaction } from "../categorize/engine";
import { IndividualEstimate } from "../tax/estimate";

// ------------------------------------------------------------------
// 表示専用（プレゼンテーション層）のヘルパー。
// categorize/engine・categorize/aiEscalate・tax/estimate が既に計算・保持している
// confidence / source / note / assumptions 等のデータを、UIでそのまま描画できる
// 「なぜこの数字・分類になったか」の説明ステップ配列に整形するだけで、
// 分類・税額計算のロジックそのものには一切関与しない。
// ------------------------------------------------------------------

/** ルールベース分類の確信度しきい値。categorize/engine.ts の CONFIDENCE_THRESHOLD と同じ値（表示用に複製、計算には使わない） */
const CONFIDENCE_THRESHOLD = 0.75;

export interface ExplanationStep {
  label: string;
  detail: string;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * 1件の仕訳（CategorizedTransaction）が、なぜその勘定科目・税区分になったのかを
 * 説明ステップの配列に変換する。source（rule / ai / uncategorized）ごとに文言を出し分ける。
 */
export function explainCategorization(tx: CategorizedTransaction): ExplanationStep[] {
  const steps: ExplanationStep[] = [];

  if (tx.source === "rule") {
    steps.push({
      label: "ルールベースで自動確定",
      detail: `摘要「${tx.description}」が登録済みの勘定科目ルールに一致したため、「${tx.account}」（${tx.taxCategory}）と判定しました（確信度 ${formatConfidence(
        tx.confidence
      )}）。`,
    });
  } else if (tx.source === "ai") {
    steps.push({
      label: "AIによる判定",
      detail: `登録済みのルールに一致しなかったため、AIが摘要「${tx.description}」の内容から「${tx.account}」（${tx.taxCategory}）と判定しました（確信度 ${formatConfidence(
        tx.confidence
      )}）。`,
    });
    if (tx.confidence < CONFIDENCE_THRESHOLD) {
      steps.push({
        label: "確信度が低いため要確認",
        detail: `AIの確信度（${formatConfidence(tx.confidence)}）が確認の目安（${formatConfidence(
          CONFIDENCE_THRESHOLD
        )}）を下回っています。内容をご自身でご確認のうえ、必要であれば勘定科目を修正してください。`,
      });
    }
  } else {
    steps.push({
      label: "未分類（要確認）",
      detail: `摘要「${tx.description}」に一致するルールがなく、AIによる自動判定も行われなかった（またはAI連携が未設定の）ため、暫定の勘定科目・税区分を表示しています。内容をご自身でご確認・修正してください。`,
    });
  }

  if (tx.note) {
    steps.push({
      label: tx.source === "ai" ? "AIの判定根拠" : "補足",
      detail: tx.note,
    });
  }

  if (tx.personalDeductionOnly) {
    steps.push({
      label: "事業の必要経費には含まれません",
      detail: "この項目は事業の必要経費ではなく、個人の所得控除・参考情報として扱われるため、事業所得（売上－経費）の計算からは除外されています。",
    });
  }

  return steps;
}

/**
 * 税額試算結果（IndividualEstimate）が保持している assumptions（前提条件の説明文）を
 * 説明ステップの配列に変換する。試算ロジック自体はここでは再計算しない。
 */
export function explainEstimateAssumptions(estimate: Pick<IndividualEstimate, "assumptions">): ExplanationStep[] {
  return estimate.assumptions.map((assumption, index) => ({
    label: `試算の前提 ${index + 1}`,
    detail: assumption,
  }));
}

/**
 * 仕訳の分類理由・税額試算の前提のどちらか（または両方）から、まとめて説明ステップを組み立てる。
 * UI側（ExplanationPanel）が入力の種類を意識せず同じ形で描画できるようにするための統一入口。
 */
export function explainBreakdown(input: {
  transaction?: CategorizedTransaction;
  estimate?: Pick<IndividualEstimate, "assumptions">;
}): ExplanationStep[] {
  return [
    ...(input.transaction ? explainCategorization(input.transaction) : []),
    ...(input.estimate ? explainEstimateAssumptions(input.estimate) : []),
  ];
}
