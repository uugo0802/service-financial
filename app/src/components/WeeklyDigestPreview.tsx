import type { ReactNode } from "react";
import { DeadlineUrgency } from "@/lib/filing/deadlines";
import { WeeklyDigest } from "@/lib/notifications/weeklyDigest";

// 週次ダイジェストの表示専用コンポーネント。ダイジェストの内容（各件数・期限の集計）は
// すべて lib/notifications/weeklyDigest.ts 側の純粋関数で計算済みのものを受け取るだけで、
// ここでは表示に徹する（他ページと同様、テストしやすい純粋ロジック層とUIを分離する設計方針）。

const URGENCY_BADGE_CLASS: Record<DeadlineUrgency, string> = {
  urgent: "border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300",
  warning: "border-amber-600 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300",
  normal: "border-border bg-surface text-muted-foreground",
};

function formatDaysRemaining(daysRemaining: number): string {
  return daysRemaining === 0 ? "本日が期限" : `あと${daysRemaining}日`;
}

export function WeeklyDigestPreview({ digest }: { digest: WeeklyDigest }) {
  const isEmpty =
    digest.pendingReviewCount === 0 && digest.upcomingDeadlines.length === 0 && digest.unreconciledCount === 0;

  return (
    <div className="border border-border bg-surface rounded-md overflow-hidden">
      <div className="border-b border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 px-5 py-4">
        <div className="text-xs text-muted-foreground tabular-nums">
          対象期間: {digest.periodStart} 〜 {digest.periodEnd}
        </div>
        <p className="mt-1 text-sm font-medium leading-relaxed">{digest.headline}</p>
      </div>

      {isEmpty ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          今週は特に対応が必要な項目はありません。引き続き記帳をお願いします。
        </div>
      ) : (
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          <DigestSection title="AIカテゴライズのレビュー待ち">
            {digest.pendingReviewCount === 0 ? (
              <EmptyRow text="レビュー待ちの取引はありません。" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{digest.pendingReviewCount}</span>
                <span className="text-sm text-muted-foreground">件の取引が確認待ちです</span>
              </div>
            )}
          </DigestSection>

          <DigestSection title="今後30日以内の申告期限">
            {digest.upcomingDeadlines.length === 0 ? (
              <EmptyRow text="直近30日以内に迫っている申告期限はありません。" />
            ) : (
              <ul className="flex flex-col gap-2">
                {digest.upcomingDeadlines.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm">{d.label}</span>
                      <span className="text-xs text-muted-foreground ml-2 tabular-nums">{d.dueDate}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 border rounded-full ${URGENCY_BADGE_CLASS[d.urgency]}`}>
                      {formatDaysRemaining(d.daysRemaining)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DigestSection>

          <DigestSection title="銀行残高が未突合の取引">
            {digest.unreconciledCount === 0 ? (
              <EmptyRow text="未突合の取引はありません（または銀行明細が未連携です）。" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{digest.unreconciledCount}</span>
                <span className="text-sm text-muted-foreground">件の取引が未突合です</span>
              </div>
            )}
          </DigestSection>
        </div>
      )}
    </div>
  );
}

function DigestSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <h3 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
