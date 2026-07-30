"use client";

import {
  GetInterimPaymentObligationsInput,
  InterimObligationKind,
  InterimPaymentObligation,
  InterimUrgency,
  getInterimPaymentObligations,
} from "@/lib/tax/interimPayment";

const URGENCY_STYLES: Record<InterimUrgency, { badge: string; card: string; label: string }> = {
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
    card: "border-stone-300 bg-white",
    label: "余裕あり",
  },
};

const REVIEW_STYLE = {
  badge: "bg-stone-500 text-white",
  card: "border-stone-300 bg-stone-50",
  label: "要確認",
};

const KIND_LABELS: Record<InterimObligationKind, string> = {
  corporateTax: "法人税",
  consumptionTax: "消費税",
};

function daysRemainingText(daysRemaining: number): string {
  if (daysRemaining === 0) return "本日が期日";
  if (daysRemaining < 0) return `期限超過 ${Math.abs(daysRemaining)}日`;
  return `あと${daysRemaining}日`;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export interface InterimPaymentReminderProps extends GetInterimPaymentObligationsInput {
  /** 表示する件数の上限。省略時はすべて表示 */
  maxItems?: number;
}

export function InterimPaymentReminder({ maxItems, ...input }: InterimPaymentReminderProps) {
  const result = getInterimPaymentObligations(input);
  const visible = maxItems ? result.obligations.slice(0, maxItems) : result.obligations;

  if (visible.length === 0) {
    return (
      <div className="border border-stone-300 bg-white rounded-lg p-4">
        <p className="text-sm text-stone-600">
          入力されている前期確定税額に基づくと、今期の中間申告・中間納付は不要と見込まれます
          （法人税は前期確定税額20万円超、消費税は48万円超の場合に必要になります）。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((obligation) => (
        <ObligationCard key={obligation.id} obligation={obligation} />
      ))}
      <p className="text-xs text-stone-400 leading-relaxed">
        表示している期日・金額は一般的な制度としきい値に基づく概算です（個別の税務相談ではありません）。
        中間納付額は前期確定税額の1/2として簡易計算しており、仮決算による中間申告には対応していません。
        土日祝日により実際の期限は前後する場合があるため、必ず国税庁・税理士等の専門家でご確認ください。
      </p>
    </div>
  );
}

function ObligationCard({ obligation }: { obligation: InterimPaymentObligation }) {
  const style = obligation.needsManualReview ? REVIEW_STYLE : URGENCY_STYLES[obligation.urgency ?? "normal"];

  return (
    <div className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${style.card}`}>
      <div className="flex flex-col gap-1">
        <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm font-semibold text-stone-900">
          {KIND_LABELS[obligation.kind]}中間申告・中間納付
        </span>
        <span className="text-xs text-stone-600">{obligation.label}</span>
        {obligation.dueDate && <span className="text-xs text-stone-500">期日: {obligation.dueDate}</span>}
        <span className="text-xs text-stone-400 max-w-md leading-relaxed">{obligation.note}</span>
      </div>
      <div className="text-right">
        {obligation.needsManualReview ? (
          <div className="text-sm font-medium tabular-nums text-stone-500">期日・金額は要確認</div>
        ) : (
          <>
            <div className="text-2xl font-semibold tabular-nums text-stone-900">
              {daysRemainingText(obligation.daysRemaining ?? 0)}
            </div>
            <div className="text-sm tabular-nums text-stone-600">
              概算納付額: {formatYen(obligation.estimatedAmount ?? 0)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
