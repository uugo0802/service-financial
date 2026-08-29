// 固定資産台帳のライフサイクルアラート（償却完了間近・償却完了済み・少額減価償却資産の
// 年間上限接近/到達）を表示するバナー。判定ロジックは lib/tax/assetLifecycleAlerts.ts の
// 純粋関数にすべて委譲し、このコンポーネントは結果の表示のみを担当する。
//
// フックや状態を持たない純粋な表示コンポーネントのため "use client" は付けていない
// （DeadlineReminderBanner.tsx と同じ方針。クライアントコンポーネントから読み込まれても問題ない）。

import { Asset, FiscalPeriod } from "@/lib/tax/depreciation";
import {
  AssetLifecycleAlertsOptions,
  DeMinimisCapAlertLevel,
  computeAssetLifecycleAlerts,
} from "@/lib/tax/assetLifecycleAlerts";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const CAP_ALERT_STYLE: Record<Exclude<DeMinimisCapAlertLevel, "ok">, { card: string; badge: string; label: string }> = {
  approaching: {
    card: "border-amber-300 bg-amber-50 text-amber-900",
    badge: "bg-amber-500 text-white",
    label: "上限に接近",
  },
  exceeded: {
    card: "border-red-300 bg-red-50 text-red-900",
    badge: "bg-red-700 text-white",
    label: "上限を超過",
  },
};

export interface AssetLifecycleAlertBannerProps {
  /** 固定資産台帳に登録されている資産の一覧 */
  assets: Asset[];
  /** 少額減価償却資産の年間上限チェック（(c)）の対象期間。通常は当期の事業年度 */
  period: FiscalPeriod;
  /** (a)(b) の基準日。省略時は本日の日付を使用する */
  referenceDate?: Date | string;
  /** アラート判定のしきい値。省略時は既定値（12ヶ月・80%）を使用する */
  options?: AssetLifecycleAlertsOptions;
}

export function AssetLifecycleAlertBanner({ assets, period, referenceDate, options }: AssetLifecycleAlertBannerProps) {
  const referenceDateIso =
    referenceDate === undefined
      ? toIsoDate(new Date())
      : typeof referenceDate === "string"
      ? referenceDate
      : toIsoDate(referenceDate);

  const alerts = computeAssetLifecycleAlerts(assets, period, referenceDateIso, options);

  const hasNearing = alerts.nearingFullDepreciation.length > 0;
  const hasFullyDepreciated = alerts.fullyDepreciated.length > 0;
  const hasCapAlert = alerts.deMinimisCap.level !== "ok";

  if (!hasNearing && !hasFullyDepreciated && !hasCapAlert) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {hasCapAlert && alerts.deMinimisCap.level !== "ok" && (
        <div className={`border rounded-lg p-4 text-sm ${CAP_ALERT_STYLE[alerts.deMinimisCap.level].card}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${CAP_ALERT_STYLE[alerts.deMinimisCap.level].badge}`}
            >
              {CAP_ALERT_STYLE[alerts.deMinimisCap.level].label}
            </span>
            <span className="font-semibold">少額減価償却資産の特例（年間合計{yen.format(alerts.deMinimisCap.capCheck.annualCap)}円上限）</span>
          </div>
          <p className="mt-1">
            当期の即時償却額の合計は{yen.format(alerts.deMinimisCap.capCheck.totalExpensedAmount)}円
            （上限に対して{Math.round(alerts.deMinimisCap.usedRatio * 100)}%）です。
            {alerts.deMinimisCap.level === "exceeded"
              ? `上限を${yen.format(alerts.deMinimisCap.capCheck.excessAmount)}円超えています。`
              : `上限まで残り${yen.format(alerts.deMinimisCap.remainingAmount)}円です。`}
          </p>
        </div>
      )}

      {hasNearing && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 text-sm text-amber-900">
          <p className="font-semibold">償却完了間近の資産があります</p>
          <ul className="mt-2 space-y-1">
            {alerts.nearingFullDepreciation.map((a) => (
              <li key={a.asset.id}>
                {a.asset.name} — {a.estimatedCompletionMonth}頃に償却完了見込み
                （残り約{a.monthsRemaining}ヶ月、現在の帳簿価額 {yen.format(a.currentBookValue)}円）
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasFullyDepreciated && (
        <div className="border border-stone-300 bg-stone-50 rounded-lg p-4 text-sm text-foreground">
          <p className="font-semibold">償却完了済みの資産があります</p>
          <ul className="mt-2 space-y-1">
            {alerts.fullyDepreciated.map((a) => (
              <li key={a.asset.id}>
                {a.asset.name}
                {a.immediateExpensingApplied ? "（少額減価償却資産の特例により即時償却済み）" : "（備忘価額まで償却完了）"}
                — 帳簿価額 {yen.format(a.bookValue)}円
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        表示している内容は、登録済みの資産・耐用年数に基づく一般的なルールの機械的な計算による概算・リマインダーであり、
        個別の税務相談ではありません。少額減価償却資産の年間上限判定は depreciation.ts の判定ロジックをそのまま用いています。
        正式な内容は必ずご自身（または税理士等の専門家）でご確認ください。
      </p>
    </div>
  );
}
