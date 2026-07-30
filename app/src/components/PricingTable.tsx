import { PricingPlan } from "@/lib/pricing/plans";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

// プランごとのカードを並べる表示専用コンポーネント。金額・機能リストなどのデータは
// すべて lib/pricing/plans.ts 側に持たせ、ここでは受け取った結果を表示するだけに留める
// （既存の DeadlineReminderCard 等と同じ、ロジックとUIを分離する設計方針に合わせる）。
export function PricingTable({ plans }: { plans: PricingPlan[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-6">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="flex flex-col gap-4 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-6"
        >
          <div>
            <h3 className="font-serif text-xl">{plan.name}</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">{plan.targetSegment}</p>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-xs text-stone-500 dark:text-stone-400">月額</span>
            <span className="text-3xl font-semibold tabular-nums">{yen.format(plan.monthlyPriceFrom)}</span>
            <span className="text-sm text-stone-500 dark:text-stone-400">〜（税抜）</span>
          </div>

          <ul className="text-sm text-stone-600 dark:text-stone-300 space-y-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="text-red-700 dark:text-red-400 mt-0.5">・</span>
                <span className="leading-relaxed">{feature}</span>
              </li>
            ))}
          </ul>

          {plan.note && (
            <p className="text-xs text-stone-400 dark:text-stone-500 leading-relaxed border-t border-stone-100 dark:border-stone-800 pt-3 mt-auto">
              {plan.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
