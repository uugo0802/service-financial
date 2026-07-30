import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 銀行残高突合（reconciliation）チェック。
//
// bankFormats.ts/parse.ts で取り込んだCSVは、あくまで「アップロードされた
// ファイルの中身」を正しく読めているかを確認するだけで、そのファイル自体が
// 期間全体の取引を漏れなく含んでいるかまでは保証しない（日付範囲の指定ミス、
// 複数ページに分かれたエクスポートの一部だけの取込、銀行側のエクスポート
// 仕様で一部の行が欠落する、等）。
//
// これを検出する標準的な会計コントロールが「残高突合」であり、
//   期首残高 + 取り込んだ全取引の金額合計 = 銀行明細に記載の実際の期末残高
// が一致するかどうかを、ユーザーが自分の目で確認した数値（期首残高・実際の
// 期末残高）を入力してもらうことで検証する。
//
// このチェックはあくまで「取込データが期間全体を過不足なく反映しているか」
// の機械的な検算であり、勘定科目・税区分の判定や税務相談を行うものではない。
// ------------------------------------------------------------------

/** 一致とみなす許容誤差（円）。円未満の丸め等による軽微なズレを吸収するための既定値。 */
export const DEFAULT_TOLERANCE_YEN = 1;

export type ReconciliationDirection = "shortfall" | "surplus";

/** 不一致だった場合に、非専門家のユーザーを原因の当たりづけへ導くためのヒント。 */
export interface ReconciliationHint {
  direction: ReconciliationDirection;
  /** 見出し（例: "取込漏れの可能性" / "重複取込の可能性"） */
  title: string;
  /** 具体的な確認ポイントを添えた説明文 */
  message: string;
}

export interface ReconciliationResult {
  /** 突合対象とした取引件数 */
  transactionCount: number;
  /** 取込済み取引の金額合計（収入は正、支出は負） */
  netTransactionAmount: number;
  /** ユーザーが入力した期首残高 */
  openingBalance: number;
  /** 期首残高 + 取込済み取引の金額合計。取込データのみから算出した「あるべき」期末残高 */
  expectedClosingBalance: number;
  /** ユーザーが銀行明細を見て入力した、実際の期末残高 */
  actualClosingBalance: number;
  /** 実際の期末残高 - 計算上の期末残高。0であれば完全に一致（プラスなら実残高の方が多い） */
  discrepancy: number;
  /** 一致とみなす許容誤差（円） */
  toleranceYen: number;
  /** discrepancy の絶対値が許容誤差以内かどうか */
  isReconciled: boolean;
  /** 不一致の場合のヒント。一致している場合は null */
  hint: ReconciliationHint | null;
}

export interface ReconcileBankBalanceInput {
  /** 突合対象期間の取込済み取引（勘定科目・税区分は不要で amount のみ参照する） */
  transactions: Pick<CategorizedTransaction, "amount">[];
  /** 期首残高（円） */
  openingBalance: number;
  /** 銀行明細に記載された、実際の期末残高（円） */
  actualClosingBalance: number;
  /** 一致とみなす許容誤差（円）。省略時は DEFAULT_TOLERANCE_YEN(=1円) */
  toleranceYen?: number;
}

/**
 * 期首残高・取込済み取引・実際の期末残高から、残高突合の結果を計算する。
 *
 * - expectedClosingBalance = openingBalance + Σ(取引金額)
 * - discrepancy = actualClosingBalance - expectedClosingBalance
 * - |discrepancy| が toleranceYen 以内であれば isReconciled = true
 * - 不一致の場合、discrepancy の符号から「取込漏れ」か「重複取込」かの
 *   当たりをつけたヒントを返す（あくまで一般的な傾向の提示であり、断定はしない）。
 */
export function reconcileBankBalance(input: ReconcileBankBalanceInput): ReconciliationResult {
  const { transactions, openingBalance, actualClosingBalance } = input;
  const toleranceYen = input.toleranceYen ?? DEFAULT_TOLERANCE_YEN;

  const netTransactionAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const expectedClosingBalance = openingBalance + netTransactionAmount;
  const discrepancy = actualClosingBalance - expectedClosingBalance;
  const isReconciled = Math.abs(discrepancy) <= toleranceYen;

  return {
    transactionCount: transactions.length,
    netTransactionAmount,
    openingBalance,
    expectedClosingBalance,
    actualClosingBalance,
    discrepancy,
    toleranceYen,
    isReconciled,
    hint: isReconciled ? null : buildReconciliationHint(discrepancy),
  };
}

/**
 * discrepancy（実際の期末残高 - 計算上の期末残高）の符号から、原因の方向性を推測する。
 *
 * - discrepancy > 0（実際の残高の方が多い＝計算上は「不足」している）:
 *   取り込んだ取引だけでは実際の入金額に届いていないため、入金など一部の取引が
 *   まだ取り込めていない可能性（取込漏れ）を示唆する。
 * - discrepancy < 0（計算上の残高の方が多い＝実際より「過大」になっている）:
 *   取り込んだ取引の合計が実際より多く積み上がっているため、同じ取引を重複して
 *   取り込んでいる可能性（重複取込）を示唆する。
 *
 * どちらも断定はできない（例えば必要経費の記帳漏れなど他の原因もあり得る）ため、
 * message では「可能性がある」旨と具体的な確認ポイントを添えるにとどめる。
 */
function buildReconciliationHint(discrepancy: number): ReconciliationHint {
  if (discrepancy > 0) {
    return {
      direction: "shortfall",
      title: "取込漏れの可能性（不足額が示す方向）",
      message:
        "実際の銀行残高が、取り込んだ取引から計算した残高より多くなっています。入金など一部の取引がまだ取り込めていない可能性があります。" +
        "CSVの取込期間（開始日・終了日）が正しいか、複数ページに分かれたエクスポートの一部を取りこぼしていないかをご確認ください。",
    };
  }
  return {
    direction: "surplus",
    title: "重複取込の可能性",
    message:
      "取り込んだ取引から計算した残高が、実際の銀行残高より多くなっています。同じ取引を重複して取り込んでいる可能性があります。" +
      "同一日付・同一金額・同一摘要の取引が2回登録されていないか、同じCSVファイルを誤って2回アップロードしていないかをご確認ください。",
  };
}
