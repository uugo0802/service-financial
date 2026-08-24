"use client";

import {
  EstimatedTaxInstallment,
  EstimatedTaxUrgency,
  GetIndividualEstimatedTaxInput,
  getIndividualEstimatedTaxObligations,
} from "@/lib/tax/individualEstimatedTax";

const URGENCY_STYLES: Record<EstimatedTaxUrgency, { badge: string; card: string; label: string }> = {
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

function daysRemainingText(daysRemaining: number): string {
  if (daysRemaining === 0) return "本日が期日";
  if (daysRemaining < 0) return `期限超過 ${Math.abs(daysRemaining)}日`;
  return `あと${daysRemaining}日`;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export interface EstimatedTaxReminderProps extends GetIndividualEstimatedTaxInput {
  /** 表示する件数の上限。省略時はすべて表示 */
  maxItems?: number;
}

export function EstimatedTaxReminder({ maxItems, ...input }: EstimatedTaxReminderProps) {
  const result = getIndividualEstimatedTaxObligations(input);
  const visible = maxItems ? result.installments.slice(0, maxItems) : result.installments;

  if (visible.length === 0) {
    return (
      <div className="border border-stone-300 bg-white rounded-lg p-4">
        <p className="text-sm text-stone-600">
          入力されている前年の確定申告に基づく所得税額・源泉徴収税額に基づくと、
          {result.taxYear}年分の予定納税は不要と見込まれます
          （予定納税基準額が15万円を超える場合に必要になります）。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((installment) => (
        <InstallmentCard key={installment.id} installment={installment} />
      ))}
      <p className="text-xs text-stone-400 leading-relaxed">
        表示している期日・金額は一般的な制度としきい値に基づく概算です（個別の税務相談ではありません）。
        各期の金額は予定納税基準額の3分の1として簡易計算しており、実際の金額は税務署から送付される
        「予定納税額の通知書」が優先されます。所得が前年より大きく減った場合などは「予定納税額の
        減額申請」で納付額を減らせる場合があります。土日祝日により実際の期限は前後する場合があるため、
        必ず国税庁・税務署・税理士等の専門家でご確認ください。
      </p>
    </div>
  );
}

function InstallmentCard({ installment }: { installment: EstimatedTaxInstallment }) {
  const style = URGENCY_STYLES[installment.urgency];

  return (
    <div className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${style.card}`}>
      <div className="flex flex-col gap-1">
        <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm font-semibold text-stone-900">{installment.label}</span>
        <span className="text-xs text-stone-600">
          納付期間: {installment.periodStart} 〜 {installment.periodEnd}
        </span>
        <span className="text-xs text-stone-500">期日: {installment.periodEnd}</span>
      </div>
      <div className="text-right">
        <div className="text-2xl font-semibold tabular-nums text-stone-900">
          {daysRemainingText(installment.daysRemaining)}
        </div>
        <div className="text-sm tabular-nums text-stone-600">概算納付額: {formatYen(installment.amount)}</div>
      </div>
    </div>
  );
}
