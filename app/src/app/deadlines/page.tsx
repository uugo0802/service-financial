"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";
import { PageContainer } from "@/components/ui/PageContainer";

import { useCallback, useMemo, useState } from "react";
import { DeadlineReminderBanner } from "@/components/DeadlineReminderBanner";
import { DeadlineUrgency, EntityType, getUpcomingFilingDeadlines } from "@/lib/filing/deadlines";
import { buildDeadlinesIcs, buildDeadlinesIcsFilename } from "@/lib/filing/icsExport";
import { PageTitle } from "@/components/ui/PageTitle";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

const URGENCY_TEXT_CLASS: Record<DeadlineUrgency, string> = {
  urgent: "text-red-700",
  warning: "text-amber-700",
  normal: "text-emerald-700",
};

export default function DeadlinesPage() {
  // 本サービスはマイクロ法人向けに一本化しているため、事業形態は法人固定とする
  // （docs/superpowers/specs/2026-08-30-nav-slimdown-and-entity-simplify-design.md ⑤参照）。
  const entityType: EntityType = "corporate";
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState(3);

  // ライブのテナント設定（決算月）が未連携のため、このページ単体で選べるデモ設定として保持する。
  const deadlines = useMemo(
    () => getUpcomingFilingDeadlines({ entityType, referenceDate: new Date(), fiscalYearEndMonth }),
    [entityType, fiscalYearEndMonth],
  );

  const handleDownloadIcs = useCallback(() => {
    const ics = buildDeadlinesIcs(deadlines);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildDeadlinesIcsFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [deadlines]);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">申告期限リマインダー</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            マイクロ法人の一般的な申告期限を一覧表示します。
            表示されるのはあくまで法定の原則的な期限（暦情報）であり、あなたの状況に応じた個別の税務相談ではありません。
          </p>
        </section>

        <section>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground w-44">
            決算月
            <select
              value={fiscalYearEndMonth}
              onChange={(e) => setFiscalYearEndMonth(Number(e.target.value))}
              className="border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">直近の期限</h2>
          <DeadlineReminderBanner
            entityType={entityType}
            fiscalYearEndMonth={fiscalYearEndMonth}
            maxItems={1}
          />
        </section>

        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-lg font-semibold">申告期限カレンダー（一覧）</h2>
            <button
              type="button"
              onClick={handleDownloadIcs}
              disabled={deadlines.length === 0}
              className="text-sm px-4 py-2 border border-border bg-surface text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              カレンダーに追加 (.ics)
            </button>
          </div>
          <TableScrollArea innerClassName="border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">項目</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">期日</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">残り日数</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((deadline) => (
                  <tr key={deadline.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">{deadline.label}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{deadline.dueDate}</td>
                    <td
                      className={`px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium ${URGENCY_TEXT_CLASS[deadline.urgency]}`}
                    >
                      {deadline.daysRemaining === 0 ? "本日" : `あと${deadline.daysRemaining}日`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollArea>
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            本ページの期日は、決算月から2ヶ月以内（法人税・地方法人税・消費税、および法人住民税・事業税）という
            一般的な原則に基づく参考値です。土日祝日により実際の期限は前後する場合があります。
            個別の状況に応じた判断は必ず国税庁・お住まいの自治体・税理士等の専門家にご確認ください。
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
