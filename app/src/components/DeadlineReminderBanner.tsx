import {
  DeadlineUrgency,
  EntityType,
  FilingDeadline,
  getUpcomingFilingDeadlines,
} from "@/lib/filing/deadlines";

const URGENCY_STYLES: Record<DeadlineUrgency, { badge: string; card: string; label: string }> = {
  urgent: {
    badge: "bg-red-700 text-white",
    card: "border-red-300 bg-red-50",
    label: "まもなく期限",
  },
  warning: {
    badge: "bg-amber-500 text-white",
    card: "border-amber-300 bg-amber-50",
    label: "準備を始める時期",
  },
  normal: {
    badge: "bg-emerald-700 text-white",
    card: "border-border bg-surface",
    label: "余裕あり",
  },
};

function daysRemainingText(daysRemaining: number): string {
  if (daysRemaining === 0) return "本日が期日";
  if (daysRemaining < 0) return `期限超過 ${Math.abs(daysRemaining)}日`;
  return `あと${daysRemaining}日`;
}

export interface DeadlineReminderBannerProps {
  entityType: EntityType;
  referenceDate?: Date | string;
  fiscalYearEndMonth?: number;
  /** 表示する件数の上限。省略時は最も近い1件のみ表示 */
  maxItems?: number;
}

export function DeadlineReminderBanner({
  entityType,
  referenceDate = new Date(),
  fiscalYearEndMonth,
  maxItems = 1,
}: DeadlineReminderBannerProps) {
  const deadlines = getUpcomingFilingDeadlines({ entityType, referenceDate, fiscalYearEndMonth });
  const visible = deadlines.slice(0, maxItems);

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {visible.map((deadline) => (
        <DeadlineCard key={deadline.id} deadline={deadline} />
      ))}
      <p className="text-xs text-muted-foreground leading-relaxed">
        表示している期日は一般的な法定期限に基づく参考情報です（個別の税務相談ではありません）。
        土日祝日により実際の期限は前後する場合があるため、必ず国税庁・お住まいの自治体の公式情報でご確認ください。
      </p>
    </div>
  );
}

function DeadlineCard({ deadline }: { deadline: FilingDeadline }) {
  const style = URGENCY_STYLES[deadline.urgency];
  return (
    <div className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${style.card}`}>
      <div className="flex flex-col gap-1">
        <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm font-semibold text-foreground">{deadline.label}</span>
        <span className="text-xs text-muted-foreground">期日: {deadline.dueDate}</span>
      </div>
      <div className="text-right">
        <div className="text-2xl font-semibold tabular-nums text-foreground">
          {daysRemainingText(deadline.daysRemaining)}
        </div>
      </div>
    </div>
  );
}
