// ------------------------------------------------------------------
// 月次決算チェックリスト（Monthly Closing Checklist）。
//
// フリーランス・マイクロ法人のオーナーが「今月分の記帳は締めてよい状態か」を
// 一目で確認できるよう、既に他モジュールで計算済みの状態（銀行残高突合の結果、
// 入金消込の結果、要確認の仕訳件数、年度確定ロックの状態）を受け取り、
// チェック項目ごとの状態（done/pending/attention）と全体の完了率にまとめ直す
// 純粋な集計・整形レイヤー。
//
// 本モジュール自身はDB・API・他モジュールの計算ロジックには一切依存しない
// （bankReconciliation.ts / invoicePaymentMatching.ts / categorize/engine.ts /
// yearClose.ts が返す結果オブジェクトの「型」だけを受け取り、それらの計算関数を
// 呼び出すことはしない）。呼び出し側（ページ／APIルート）が、各モジュールを
// 実行して得た結果をこの関数に渡す形を想定している。
//
// あくまで「標準的な月次記帳の締め作業が完了しているか」を機械的に集計する
// チェックリストであり、税理士法に定める税務代理・税務書類の作成・個別の
// 税務相談を行うものではない（docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
// ------------------------------------------------------------------

import type { ReconciliationResult } from "../reconcile/bankReconciliation";
import type { InvoicePaymentMatchResult } from "../reconcile/invoicePaymentMatching";
import type { FiscalYearCloseState } from "./yearClose";

/** チェック項目1件分の状態。
 * - "done"：機械的な確認条件を満たしている（対応不要）
 * - "pending"：まだ確認そのものが行われていない（データ未入力・未実施）
 * - "attention"：確認は行われたが、要対応の差異・未処理が見つかった
 */
export type MonthlyCloseChecklistItemStatus = "done" | "pending" | "attention";

export interface MonthlyCloseChecklistItem {
  /** チェック項目の安定したID（UIのkeyや個別リンクに使う想定） */
  id: string;
  /** チェック項目名（例:「銀行残高が突合済みか」） */
  title: string;
  /** チェック項目の説明文 */
  description: string;
  status: MonthlyCloseChecklistItemStatus;
  /** 件数・差額など、状態の根拠を補足する短い説明文。自明な場合は省略 */
  detail?: string;
}

export interface MonthlyCloseChecklistResult {
  /** 対象年月（"YYYY-MM"） */
  targetMonth: string;
  /** 順序付きのチェック項目一覧 */
  items: MonthlyCloseChecklistItem[];
  doneCount: number;
  pendingCount: number;
  attentionCount: number;
  totalCount: number;
  /** 完了率（0〜100、四捨五入）。項目が0件の場合は0 */
  completionPercent: number;
  /** 全項目が"done"のときのみtrue（項目が1件も無い場合はfalse） */
  isComplete: boolean;
}

export interface BuildMonthlyCloseChecklistInput {
  /** 対象年月（"YYYY-MM"形式。例: "2026-07"） */
  targetMonth: string;
  /**
   * bankReconciliation.ts の reconcileBankBalance() が返した結果。
   * まだ残高突合を実施していない月は null を渡す。
   */
  bankReconciliation: ReconciliationResult | null;
  /**
   * invoicePaymentMatching.ts の matchInvoicePayments() が返した結果。
   * まだ入金消込を実施していない月は null を渡す。
   */
  invoicePaymentMatching: InvoicePaymentMatchResult | null;
  /**
   * categorize/engine.ts の needsEscalation() 等で判定した、未分類・低信頼度で
   * 人間の確認待ちになっている仕訳（取引）の件数。0件なら「未確定の仕訳なし」。
   */
  pendingCategorizationCount: number;
  /**
   * yearClose.ts の FiscalYearCloseState のうち、この項目の判定に必要な部分のみ。
   * 対象月を含む年度の確定（ロック）状態が取得できない/関係ない場合は省略可
   * （省略時はこのチェック項目自体を一覧から除外する）。
   */
  fiscalYearLock?: Pick<FiscalYearCloseState, "closed" | "fiscalYear">;
}

const TARGET_MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 各種モジュールの計算済み結果から、月次決算チェックリストを組み立てる。
 * 例外は投げない（入力値の形式が明らかに不正な場合を除く）。
 */
export function buildMonthlyCloseChecklist(input: BuildMonthlyCloseChecklistInput): MonthlyCloseChecklistResult {
  assertValidTargetMonth(input.targetMonth);
  assertValidPendingCount(input.pendingCategorizationCount);

  const items: MonthlyCloseChecklistItem[] = [
    buildBankReconciliationItem(input.bankReconciliation),
    buildPendingCategorizationItem(input.pendingCategorizationCount),
    buildInvoicePaymentMatchingItem(input.invoicePaymentMatching),
  ];

  if (input.fiscalYearLock) {
    items.push(buildFiscalYearLockItem(input.fiscalYearLock));
  }

  return summarize(input.targetMonth, items);
}

function assertValidTargetMonth(targetMonth: string) {
  if (!TARGET_MONTH_FORMAT.test(targetMonth)) {
    throw new Error(`targetMonth must be in "YYYY-MM" format, got: ${targetMonth}`);
  }
}

function assertValidPendingCount(count: number) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`pendingCategorizationCount must be a non-negative integer, got: ${count}`);
  }
}

function buildBankReconciliationItem(result: ReconciliationResult | null): MonthlyCloseChecklistItem {
  const base = {
    id: "bank-reconciliation",
    title: "銀行残高が突合済みか",
    description:
      "期首残高＋取り込んだ全取引の金額合計が、銀行明細に記載の実際の期末残高と一致しているかを確認します。",
  };

  if (!result) {
    return {
      ...base,
      status: "pending",
      detail: "まだ残高突合を実施していません。",
    };
  }

  if (result.isReconciled) {
    return {
      ...base,
      status: "done",
      detail: `一致を確認済み（取引${result.transactionCount}件）。`,
    };
  }

  return {
    ...base,
    status: "attention",
    detail: `差額${result.discrepancy.toLocaleString("ja-JP")}円が未解消です。取込漏れ・重複取込の可能性をご確認ください。`,
  };
}

function buildPendingCategorizationItem(pendingCategorizationCount: number): MonthlyCloseChecklistItem {
  const base = {
    id: "pending-categorization",
    title: "未確定の仕訳が残っていないか",
    description: "勘定科目・税区分が未確定（未分類、または信頼度が低く要確認）の取引が残っていないかを確認します。",
  };

  if (pendingCategorizationCount === 0) {
    return { ...base, status: "done", detail: "未確定の仕訳はありません。" };
  }

  return {
    ...base,
    status: "attention",
    detail: `未確定の仕訳が${pendingCategorizationCount.toLocaleString("ja-JP")}件残っています。`,
  };
}

function buildInvoicePaymentMatchingItem(result: InvoicePaymentMatchResult | null): MonthlyCloseChecklistItem {
  const base = {
    id: "invoice-payment-matching",
    title: "請求書の入金消込が完了しているか",
    description: "発行済み請求書への入金が、銀行取引と過不足なく消込（マッチング）できているかを確認します。",
  };

  if (!result) {
    return {
      ...base,
      status: "pending",
      detail: "まだ入金消込を実施していません。",
    };
  }

  const unresolvedCount =
    result.unmatchedDeposits.length +
    result.unmatchedInvoices.length +
    result.combinedPaymentReviewItems.length +
    result.partialPaymentCandidates.length;

  if (unresolvedCount === 0) {
    return { ...base, status: "done", detail: "未消込の入金・請求書はありません。" };
  }

  return {
    ...base,
    status: "attention",
    detail: `要確認の入金・請求書が${unresolvedCount.toLocaleString("ja-JP")}件あります（未消込の入金・未回収の請求書・まとめ入金/一部入金の候補を含む）。`,
  };
}

function buildFiscalYearLockItem(
  fiscalYearLock: Pick<FiscalYearCloseState, "closed" | "fiscalYear">
): MonthlyCloseChecklistItem {
  const base = {
    id: "fiscal-year-lock",
    title: "当月分の仕訳が年度確定ロックの影響を受けていないか",
    description:
      "当月を含む会計年度が既に確定（ロック）済みの場合、当月分の仕訳は編集・削除できません。修正が必要な場合は理由を添えてロック解除が必要です。",
  };

  if (fiscalYearLock.closed) {
    return {
      ...base,
      status: "attention",
      detail: `${fiscalYearLock.fiscalYear}年度は確定（ロック）済みです。当月分の仕訳を修正するにはロック解除（理由の入力）が必要です。`,
    };
  }

  return {
    ...base,
    status: "done",
    detail: `${fiscalYearLock.fiscalYear}年度は未確定（オープン）のため、当月分の仕訳は通常どおり編集できます。`,
  };
}

function summarize(targetMonth: string, items: MonthlyCloseChecklistItem[]): MonthlyCloseChecklistResult {
  const doneCount = items.filter((item) => item.status === "done").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const attentionCount = items.filter((item) => item.status === "attention").length;
  const totalCount = items.length;
  const completionPercent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const isComplete = totalCount > 0 && doneCount === totalCount;

  return {
    targetMonth,
    items,
    doneCount,
    pendingCount,
    attentionCount,
    totalCount,
    completionPercent,
    isComplete,
  };
}
