import { MonthlySales } from "@/lib/tax/businessOverviewForm";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

// ------------------------------------------------------------------
// 法人事業概況説明書（簡易版・売上高の月別推移）の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// 正式様式にある「業種」「事業内容の概要」「従業者数」「主要な取引先」「経理の方法」
// 「海外取引状況」等、取引明細からは読み取れない項目は対象外（buildMonthlySalesTrend
// 自身のファイル冒頭コメント・components/DocumentPreview.tsxのbusinessOverviewタブ
// 参照）。取引明細から機械的に算出できる「売上高の月別推移」のみをこのアプリでは扱う。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function BusinessOverviewStatement({ monthlySales }: { monthlySales: MonthlySales[] }) {
  const total = monthlySales.reduce((sum, line) => sum + line.amount, 0);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">法人事業概況説明書（簡易版・売上高の月別推移）</h2>
      <p className="text-xs text-stone-500 mb-4 leading-relaxed max-w-2xl">
        正式様式にある「業種」「事業内容の概要」「従業者数」「主要な取引先」「経理の方法」「海外取引状況」等の項目は
        記帳データからは機械的に算出できないため、このアプリでは対応していません。以下は取引明細から算出できる
        「売上高の月別推移」のみの簡易版です。
      </p>
      {monthlySales.length === 0 ? (
        <p className="text-sm text-stone-500">売上（収入）データがありませんでした。</p>
      ) : (
        <TableScrollArea innerClassName="border border-stone-300 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                <th className="px-3 py-2 font-normal">月</th>
                <th className="px-3 py-2 font-normal text-right">売上高</th>
              </tr>
            </thead>
            <tbody>
              {monthlySales.map((line) => (
                <tr
                  key={line.month}
                  className="border-b border-stone-100 last:border-0 print:break-inside-avoid"
                >
                  <td className="px-3 py-2">
                    {line.month}
                    <span className="text-xs text-stone-500 ml-1">（{line.transactionCount}件）</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(line.amount)}</td>
                </tr>
              ))}
              <tr className="font-semibold print:break-inside-avoid">
                <td className="px-3 py-2">合計</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(total)}</td>
              </tr>
            </tbody>
          </table>
        </TableScrollArea>
      )}
    </section>
  );
}
