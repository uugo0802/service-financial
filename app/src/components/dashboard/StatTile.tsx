const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function StatTile({
  label,
  value,
  deltaPercent,
  deltaGoodDirection = "up",
}: {
  label: string;
  value: number;
  /** 前年比・前期比。undefinedなら比較対象なし(初年度など) */
  deltaPercent?: number;
  /** 値が増える方向が「良い」かどうか。経費は増加が悪化なので"down"を指定する */
  deltaGoodDirection?: "up" | "down";
}) {
  const isGood = deltaPercent === undefined ? null : deltaGoodDirection === "up" ? deltaPercent >= 0 : deltaPercent <= 0;
  return (
    <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-md p-4">
      <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{yen.format(value)}</div>
      {deltaPercent !== undefined && (
        <div
          className={`mt-1 text-xs ${
            isGood ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          前年比 {deltaPercent >= 0 ? "+" : ""}
          {deltaPercent.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
