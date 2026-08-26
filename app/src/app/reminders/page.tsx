"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DeadlineTask,
  getDeadlineReminders,
  getIndividualDeadlineTasks,
  getMicroCorporationDeadlineTasks,
  IsoDate,
} from "@/lib/filing/deadlineReminders";
import { DeadlineReminderCard } from "@/components/DeadlineReminderCard";

type Mode = "individual" | "corporation";

// ブラウザのローカル日時から "YYYY-MM-DD" 形式の基準日を作る。
// deadlineReminders.ts 側のロジックはDate.now()に依存しない設計になっており、
// ここ（実際のアプリ実行時にのみ「今日」を決める場所）でだけ現在日時を参照する。
function todayIsoDate(): IsoDate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function RemindersPage() {
  const asOf = useMemo(() => todayIsoDate(), []);
  const currentYear = Number(asOf.slice(0, 4));

  const [mode, setMode] = useState<Mode>("individual");

  const [taxYear, setTaxYear] = useState(currentYear - 1);
  const [isInvoiceRegistered, setIsInvoiceRegistered] = useState(false);

  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState(3);
  const [fiscalYearEndCalendarYear, setFiscalYearEndCalendarYear] = useState(currentYear);

  const tasks: DeadlineTask[] = useMemo(() => {
    if (mode === "individual") {
      return getIndividualDeadlineTasks({ taxYear, isInvoiceRegistered });
    }
    return getMicroCorporationDeadlineTasks({ fiscalYearEndMonth, fiscalYearEndCalendarYear });
  }, [mode, taxYear, isInvoiceRegistered, fiscalYearEndMonth, fiscalYearEndCalendarYear]);

  const reminders = useMemo(() => getDeadlineReminders(tasks, asOf), [tasks, asOf]);

  const inputClass =
    "w-full border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-stone-600 dark:focus:border-stone-400";
  const labelClass = "flex flex-col gap-1 text-xs text-stone-500 dark:text-stone-400";

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">申告期限・タスクリマインダー</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">申告期限・タスクリマインダー</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            個人事業主・マイクロ法人それぞれの申告期限をもとに、次にやるべきタスクと期限までの日数を表示します。
          </p>
        </section>

        <section className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-5 flex flex-col gap-4">
          <div className="flex gap-2">
            {(
              [
                { key: "individual", label: "個人事業主モード" },
                { key: "corporation", label: "マイクロ法人モード" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                className={`text-sm px-4 py-2 border transition-colors ${
                  mode === opt.key
                    ? "bg-stone-900 border-stone-900 text-white dark:bg-stone-100 dark:border-stone-100 dark:text-stone-900"
                    : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === "individual" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={labelClass}>
                対象年（申告する年分）
                <input
                  type="number"
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  className={inputClass}
                />
              </label>
              <label className="flex items-end gap-2 text-sm text-stone-600 dark:text-stone-300 pb-2">
                <input
                  type="checkbox"
                  checked={isInvoiceRegistered}
                  onChange={(e) => setIsInvoiceRegistered(e.target.checked)}
                />
                インボイス登録事業者である（消費税の申告も対象に含める）
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={labelClass}>
                決算月
                <select
                  value={fiscalYearEndMonth}
                  onChange={(e) => setFiscalYearEndMonth(Number(e.target.value))}
                  className={inputClass}
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}月
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                決算年（西暦）
                <input
                  type="number"
                  value={fiscalYearEndCalendarYear}
                  onChange={(e) => setFiscalYearEndCalendarYear(Number(e.target.value))}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </section>

        <DeadlineReminderCard reminders={reminders} />
      </main>
    </div>
  );
}
