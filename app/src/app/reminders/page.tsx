"use client";
import { PageContainer } from "@/components/ui/PageContainer";

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
import { PageTitle } from "@/components/ui/PageTitle";

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
    "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
  const labelClass = "flex flex-col gap-1 text-xs text-muted-foreground";

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">申告期限・タスクリマインダー</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            個人事業主・マイクロ法人それぞれの申告期限をもとに、次にやるべきタスクと期限までの日数を表示します。
          </p>
        </section>

        <section className="border border-border bg-surface rounded-md p-5 flex flex-col gap-4">
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
                    ? "bg-accent border-accent text-white"
                    : "bg-surface border-border text-muted-foreground hover:border-foreground/40"
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
              <label className="flex items-end gap-2 text-sm text-muted-foreground pb-2">
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
      </PageContainer>
    </div>
  );
}
