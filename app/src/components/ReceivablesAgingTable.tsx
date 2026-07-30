import { ReceivablesSummary } from "@/lib/invoice/receivables";

// ------------------------------------------------------------------
// 未収入金（Accounts Receivable）の年齢別集計（aging）＋期日超過一覧の表示テーブル。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

function bucketAccentClass(key: string): string {
  switch (key) {
    case "0-30":
      return "text-stone-700";
    case "31-60":
      return "text-amber-700";
    case "61-90":
      return "text-orange-700";
    default:
      return "text-red-700";
  }
}

export function ReceivablesAgingTable({ summary }: { summary: ReceivablesSummary }) {
  const hasAnyOutstanding = summary.totalOutstandingCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">未収入金 総額（{summary.asOfDate} 時点）</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <Yen v={summary.totalOutstanding} />
          </p>
          <p className="text-xs text-stone-400 mt-1">未収の請求書 {summary.totalOutstandingCount}件（期日前を含む）</p>
        </div>
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">期日超過（未収のうち支払期日を過ぎたもの）</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            <Yen v={summary.agingBuckets.reduce((sum, b) => sum + b.amount, 0)} />
          </p>
          <p className="text-xs text-stone-400 mt-1">
            期日超過の請求書 {summary.overdueInvoices.length}件
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
              <th className="py-2 px-3 font-semibold">経過区分</th>
              <th className="py-2 px-3 font-semibold text-right">件数</th>
              <th className="py-2 px-3 font-semibold text-right">未収金額</th>
            </tr>
          </thead>
          <tbody>
            {summary.agingBuckets.map((bucket) => (
              <tr key={bucket.key} className="border-b border-stone-200 last:border-b-0">
                <td className={`py-2.5 px-3 font-medium ${bucketAccentClass(bucket.key)}`}>{bucket.label}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{bucket.count}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  <Yen v={bucket.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">期日超過の請求書一覧（超過日数の多い順）</h3>
        {!hasAnyOutstanding || summary.overdueInvoices.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white rounded-lg p-6 text-center text-sm text-stone-500">
            期日を超過している未収の請求書はありません。
          </div>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="py-2 px-3 font-semibold">請求書番号</th>
                  <th className="py-2 px-3 font-semibold">請求先</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">発行日</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">支払期日</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">超過日数</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">未収金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.overdueInvoices.map((invoice) => (
                  <tr key={invoice.invoiceNumber} className="border-b border-stone-200 last:border-b-0">
                    <td className="py-2.5 px-3 tabular-nums">{invoice.invoiceNumber}</td>
                    <td className="py-2.5 px-3">{invoice.clientName || "（請求先未入力）"}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">{invoice.issueDate}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">
                      {invoice.dueDate ?? "（未設定・発行日基準）"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium text-red-700">
                      {invoice.daysOverdue}日
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <Yen v={invoice.outstandingAmount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        この一覧は発行済み請求書の入金状況（未収入金）を記帳・管理するための集計表示であり、
        督促・債権回収の助言や税理士法に定める税務代理・税務相談を提供するものではありません。
        入金確認は必ずご自身の銀行口座等の実際の入金記録に基づいて行ってください。
      </p>
    </div>
  );
}
