import {
  DEADLINE_GENERAL_INFO_NOTICE,
  DeadlineReminder,
  ReminderStatus,
} from "@/lib/filing/deadlineReminders";

// 申告期限リマインダーの表示専用コンポーネント。期限の計算・ステータス判定は
// すべて src/lib/filing/deadlineReminders.ts 側で行い、ここでは受け取った結果を
// 表示するだけに留める（テストしやすい純粋ロジック層とUIを分離する既存の設計方針に合わせる）。

const STATUS_LABEL: Record<ReminderStatus, string> = {
  overdue: "期限超過",
  "due-soon": "まもなく期限",
  upcoming: "予定",
};

const STATUS_BADGE_CLASS: Record<ReminderStatus, string> = {
  overdue: "border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300",
  "due-soon": "border-amber-600 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300",
  upcoming: "border-stone-400 bg-stone-50 text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

function formatDaysRemaining(daysRemaining: number): string {
  if (daysRemaining === 0) return "本日が期限です";
  if (daysRemaining > 0) return `あと${daysRemaining}日`;
  return `期限を${Math.abs(daysRemaining)}日超過しています`;
}

function sortByDueDate(reminders: DeadlineReminder[]): DeadlineReminder[] {
  return [...reminders].sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function DeadlineReminderCard({ reminders }: { reminders: DeadlineReminder[] }) {
  const sorted = sortByDueDate(reminders);
  const next = sorted[0];
  const rest = sorted.slice(1);

  return (
    <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5">
      <h3 className="text-sm font-semibold mb-4">次の申告期限とタスク</h3>

      {!next ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          現在表示できる申告期限タスクがありません。モードや入力内容をご確認ください。
        </p>
      ) : (
        <>
          <div className="border border-stone-200 dark:border-stone-700 p-4 mb-2">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`text-xs px-2 py-0.5 border rounded-full ${STATUS_BADGE_CLASS[next.status]}`}
              >
                {STATUS_LABEL[next.status]}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                期限: {next.dueDate}
              </span>
            </div>
            <div className="text-base font-semibold">{next.title}</div>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">{next.description}</p>
            <p className="text-sm font-medium mt-2 tabular-nums">{formatDaysRemaining(next.daysRemaining)}</p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">{next.basis}</p>
          </div>

          {rest.length > 0 && (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800 mb-2">
              {rest.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm">{r.title}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-500 ml-2 tabular-nums">
                      {r.dueDate}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 border rounded-full ${STATUS_BADGE_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}（{formatDaysRemaining(r.daysRemaining)}）
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mt-3 border-t border-stone-100 dark:border-stone-800 pt-3">
        {DEADLINE_GENERAL_INFO_NOTICE}
      </p>
    </div>
  );
}
