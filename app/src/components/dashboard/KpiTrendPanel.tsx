import { KpiTrendPoint } from "@/lib/tax/kpiTrend";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function formatPercent(value: number | null): string {
  if (value === null) return "―";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "―";
  return `${value.toFixed(1)}%`;
}

/**
 * 複数年度の経営指標（売上・経費・損益・経費率・前年比売上成長率）を
 * まとめて確認できるコンパクトな表。StatTile/TrendBarChart/TrendLineChartと
 * 同じ配色・枠線・「表で見る」系チャートのテーブル表現を踏襲する。
 */
export function KpiTrendPanel({ points, title }: { points: KpiTrendPoint[]; title: string }) {
  if (points.length === 0) {
    return (
      <div className="viz-dashboard">
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>
      </div>
    );
  }

  return (
    <div className="viz-dashboard">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <TableScrollArea innerClassName="border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground text-xs">
              <th className="px-3 py-2 font-normal">年度</th>
              <th className="px-3 py-2 font-normal text-right">売上</th>
              <th className="px-3 py-2 font-normal text-right">経費</th>
              <th className="px-3 py-2 font-normal text-right">損益</th>
              <th className="px-3 py-2 font-normal text-right">経費率</th>
              <th className="px-3 py-2 font-normal text-right">前年比（売上）</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{p.key}年</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.revenue)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{yen.format(p.expense)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${p.netIncome < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                  {yen.format(p.netIncome)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatRatio(p.expenseRatio)}</td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    p.revenueGrowth === null
                      ? "text-muted-foreground"
                      : p.revenueGrowth >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {formatPercent(p.revenueGrowth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollArea>
    </div>
  );
}
