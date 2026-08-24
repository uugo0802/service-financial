// 週次アクティビティダイジェストの生成ロジック。
//
// 目的（docs/business-plan.md「切り替えコストとなる要素」/「低摩擦でユーザーが使い続ける」）:
// 記帳・申告シーズン以外もユーザーがサービスを開き続ける動機として、「今週対応が必要なこと」を
// 1つのオブジェクトにまとめて提示する。実際のメール送信（配信基盤）はスコープ外で、ここでは
// 送信内容となる構造化データを作るだけの純粋関数を提供する。
//
// このモジュールは既存の3つのデータソースを「合成」するだけで、各ドメインの計算ロジックは
// 一切再実装しない（それぞれの正典は下記のとおり）。
//   - AIカテゴライズのレビューキュー（低信頼エスカレーション）: lib/categorize/engine.ts の
//     needsEscalation() / CONFIDENCE_THRESHOLD をそのまま利用する。
//   - 申告期限: lib/filing/deadlines.ts の getUpcomingFilingDeadlines() をそのまま利用する。
//   - 銀行残高突合: lib/reconcile/bankReconciliation.ts の ReconciliationResult 型をそのまま
//     利用する（突合の計算自体は reconcileBankBalance() 側の責務であり、呼び出し側が計算済みの
//     結果をこのモジュールに渡す想定）。
//
// 日付は他のfiling系モジュールと同様 "YYYY-MM-DD" 形式のISO日付文字列（IsoDate）で表し、
// 「今日」に相当する基準日（asOf）は必ず呼び出し側が明示的な引数として渡す（このモジュールの
// 中でDate.now()やnew Date()（引数なし）は呼ばない）。これによりテストで基準日を固定できる。

import { CategorizedTransaction, needsEscalation } from "../categorize/engine";
import {
  EntityType,
  FilingDeadline,
  getUpcomingFilingDeadlines,
} from "../filing/deadlines";
import { ReconciliationResult } from "../reconcile/bankReconciliation";

export type IsoDate = string;

/** ダイジェスト対象週の日数（asOfを含む7日間）。 */
export const WEEKLY_DIGEST_PERIOD_DAYS = 7;

/** 「まもなく」とみなす申告期限までの日数の既定の窓（当日を含めて30日以内）。 */
export const DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS = 30;

export interface WeeklyDigestFilingInput {
  entityType: EntityType;
  /** 法人のみ。決算月（1〜12）。省略時は deadlines.ts 側の既定値（3月）を使用する。 */
  fiscalYearEndMonth?: number;
}

export interface WeeklyDigestInput {
  /** ダイジェストの集計基準日（今日）。この日を起点に7日間を対象週として扱う。 */
  asOf: IsoDate;
  /**
   * AIカテゴライズ済みの取引一覧（例: /api/categorize のレスポンスに含まれる transactions）。
   * このうち低信頼（confidence < CONFIDENCE_THRESHOLD）のものを「レビュー待ち」として数える。
   * 省略時は空配列として扱う。
   */
  categorizedTransactions?: readonly CategorizedTransaction[];
  /** 申告期限を算出するためのテナント設定（事業形態・決算月）。 */
  filing: WeeklyDigestFilingInput;
  /**
   * 銀行残高突合の結果（口座・期間ごと）。銀行明細連携が未接続のテナントでは
   * データそのものが存在しないため省略可能（省略時は unreconciledCount = 0）。
   */
  reconciliations?: readonly Pick<ReconciliationResult, "isReconciled" | "transactionCount">[];
  /** 申告期限を「今週の注目事項」に含める窓（日数）。省略時 DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS(=30)。 */
  upcomingDeadlineWindowDays?: number;
}

export interface WeeklyDigest {
  /** 対象週の開始日（= asOf） */
  periodStart: IsoDate;
  /** 対象週の終了日（= asOf + WEEKLY_DIGEST_PERIOD_DAYS - 1 日） */
  periodEnd: IsoDate;
  /** AIカテゴライズのレビュー待ち件数（低信頼エスカレーション） */
  pendingReviewCount: number;
  /** 今後 upcomingDeadlineWindowDays 日以内の申告期限（期限が近い順） */
  upcomingDeadlines: FilingDeadline[];
  /** 未突合とみなされる銀行取引の件数（データ未提供の場合は0） */
  unreconciledCount: number;
  /** ダイジェスト全体を要約する一文 */
  headline: string;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertIsoDate(label: string, date: IsoDate): void {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`invalid ISO date (expected YYYY-MM-DD): ${label}=${date}`);
  }
}

/** asOfに日数を加算する。年またぎ・うるう年もDate.UTCベースで正しく処理される。 */
function addDays(date: IsoDate, days: number): IsoDate {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`invalid ISO date (expected YYYY-MM-DD): ${date}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** 低信頼（レビュー待ち）の取引件数を数える。判定はcategorize/engine.tsのneedsEscalation()に委譲する。 */
function countPendingReview(transactions: readonly CategorizedTransaction[]): number {
  return transactions.filter((tx) => needsEscalation(tx)).length;
}

/**
 * 銀行残高突合が未完了（isReconciled=false）だった口座・期間について、その対象取引件数を
 * 合計する。bankReconciliation.tsは口座・期間単位で「一致したかどうか」を判定する設計であり、
 * 取引1件単位の突合ステータスは持たないため、「未突合」とは「突合が取れていない期間に含まれる
 * 取引の件数」として扱う。
 */
function countUnreconciled(reconciliations: readonly Pick<ReconciliationResult, "isReconciled" | "transactionCount">[]): number {
  return reconciliations
    .filter((r) => !r.isReconciled)
    .reduce((sum, r) => sum + r.transactionCount, 0);
}

function buildHeadline(pendingReviewCount: number, upcomingDeadlines: FilingDeadline[], unreconciledCount: number): string {
  const items: string[] = [];

  if (pendingReviewCount > 0) {
    items.push(`AIカテゴライズのレビュー待ちが${pendingReviewCount}件`);
  }
  if (upcomingDeadlines.length > 0) {
    const soonest = upcomingDeadlines[0];
    const dueText = soonest.daysRemaining === 0 ? "本日が期限" : `あと${soonest.daysRemaining}日`;
    items.push(`「${soonest.label}」の申告期限が${dueText}`);
  }
  if (unreconciledCount > 0) {
    items.push(`銀行残高が未突合の取引が${unreconciledCount}件`);
  }

  if (items.length === 0) {
    return "今週は特に対応が必要な項目はありません。";
  }
  return `今週対応が必要な項目: ${items.join(" / ")}`;
}

/**
 * テナントの現在状態のスナップショットから、週次ダイジェストを合成する。
 *
 * このモジュール自体は各ドメインの計算を一切行わず、既存の3つのデータソース
 * （AIカテゴライズのレビューキュー・申告期限・銀行残高突合）が返す結果を集約するだけの
 * 純粋関数である。メール等の実際の配信はスコープ外（呼び出し側の責務）。
 */
export function buildWeeklyDigest(input: WeeklyDigestInput): WeeklyDigest {
  assertIsoDate("asOf", input.asOf);

  const periodStart = input.asOf;
  const periodEnd = addDays(input.asOf, WEEKLY_DIGEST_PERIOD_DAYS - 1);

  const pendingReviewCount = countPendingReview(input.categorizedTransactions ?? []);

  const windowDays = input.upcomingDeadlineWindowDays ?? DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS;
  const allDeadlines = getUpcomingFilingDeadlines({
    entityType: input.filing.entityType,
    referenceDate: input.asOf,
    fiscalYearEndMonth: input.filing.fiscalYearEndMonth,
  });
  // getUpcomingFilingDeadlines() は既に daysRemaining の昇順でソート済みのため、
  // フィルタ後もその順序（期限が近い順）は保たれる。
  const upcomingDeadlines = allDeadlines.filter((d) => d.daysRemaining <= windowDays);

  const unreconciledCount = countUnreconciled(input.reconciliations ?? []);

  const headline = buildHeadline(pendingReviewCount, upcomingDeadlines, unreconciledCount);

  return {
    periodStart,
    periodEnd,
    pendingReviewCount,
    upcomingDeadlines,
    unreconciledCount,
    headline,
  };
}
