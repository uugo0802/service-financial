import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

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
    <Card className="p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-foreground">{yen.format(value)}</div>
      {deltaPercent !== undefined && (
        <Badge tone={isGood ? "positive" : "negative"} className="mt-1">
          {isGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          前年比 {deltaPercent >= 0 ? "+" : ""}
          {deltaPercent.toFixed(1)}%
        </Badge>
      )}
    </Card>
  );
}
