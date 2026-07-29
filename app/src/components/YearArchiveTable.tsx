import { YearArchiveViewModel } from "@/lib/tax/yearArchive";

// ------------------------------------------------------------------
// 過去の記帳・申告実績を年度別に一覧表示するテーブル。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-stone-400">—</span>;
  }
  const isUp = pct > 0;
  const isFlat = pct === 0;
  const color = isFlat ? "text-stone-500" : isUp ? "text-emerald-700" : "text-red-700";
  const sign = isUp ? "+" : "";
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {sign}
      {pct}%
    </span>
  );
}

export function YearArchiveTable({ archive }: { archive: YearArchiveViewModel }) {
  if (archive.entries.length === 0) {
    return (
      <div className="border border-stone-300 bg-white rounded-lg p-8 text-center text-sm text-stone-500">
        まだ記録された年度データがありません。年度ごとの記帳・申告データが蓄積されると、ここに一覧で表示されます。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile label="記録年数" value={`${archive.yearsRecorded}年分`} />
        <SummaryTile label="継続記録" value={`${archive.continuousYearsStreak}年連続`} />
        <SummaryTile
          label="最も古い年度"
          value={archive.earliestFiscalYear !== null ? `${archive.earliestFiscalYear}年` : "—"}
        />
        <SummaryTile
          label="最新年度"
          value={archive.latestFiscalYear !== null ? `${archive.latestFiscalYear}年` : "—"}
        />
      </div>

      {archive.hasGaps && (
        <p className="text-xs text-amber-700">
          一部の年度で記録が見つかりませんでした（表中「ギャップ」欄参照）。データを追加すると継続年数の表示が更新されます。
        </p>
      )}

      <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
              <th className="py-2 px-3 font-semibold">年度</th>
              <th className="py-2 px-3 font-semibold text-right">売上高</th>
              <th className="py-2 px-3 font-semibold text-right">経費</th>
              <th className="py-2 px-3 font-semibold text-right">利益</th>
              <th className="py-2 px-3 font-semibold text-right">前年比（売上/利益）</th>
              <th className="py-2 px-3 font-semibold text-right">概算納税額</th>
              <th className="py-2 px-3 font-semibold">申告日</th>
            </tr>
          </thead>
          <tbody>
            {archive.entries.map((e) => (
              <tr key={e.fiscalYear} className="border-b border-stone-200 last:border-b-0">
                <td className="py-2.5 px-3 align-top">
                  <div className="font-medium">{e.fiscalYear}年</div>
                  {e.isGapYear && (
                    <div className="text-[0.68rem] text-amber-700 mt-0.5">前年度の記録なし（ギャップ）</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right align-top">
                  <Yen v={e.revenue} />
                  <span className="text-xs text-stone-400"> 円</span>
                </td>
                <td className="py-2.5 px-3 text-right align-top">
                  <Yen v={e.expenses} />
                  <span className="text-xs text-stone-400"> 円</span>
                </td>
                <td className={`py-2.5 px-3 text-right align-top ${e.profit < 0 ? "text-red-700" : ""}`}>
                  <Yen v={e.profit} />
                  <span className="text-xs text-stone-400"> 円</span>
                </td>
                <td className="py-2.5 px-3 text-right align-top">
                  <div className="flex flex-col items-end gap-0.5">
                    <ChangeBadge pct={e.revenueChangePct} />
                    <ChangeBadge pct={e.profitChangePct} />
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right align-top">
                  <Yen v={e.estimatedTax} />
                  <span className="text-xs text-stone-400"> 円</span>
                </td>
                <td className="py-2.5 px-3 align-top text-stone-500 text-xs">{e.filedAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        表示内容は過去に記録された記帳・概算データを並び替えたものであり、正式な税務代理・個別税務相談ではありません。数値は概算シミュレーションとしてご確認ください。
      </p>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-300 bg-white rounded-lg px-4 py-3">
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className="text-lg font-serif tabular-nums">{value}</div>
    </div>
  );
}
