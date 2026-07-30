import { TrialBalance, TrialBalanceLine } from "@/lib/tax/trialBalance";

// ------------------------------------------------------------------
// 合計残高試算表の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// 各科目の残高は符号付き（借方残高はプラス、貸方残高はマイナス）で保持されているため、
// 表示時に借方欄・貸方欄のどちらか一方へ振り分ける。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function formatSignedAsColumn(amount: number, side: "debit" | "credit"): string {
  const value = side === "debit" ? Math.max(amount, 0) : Math.max(-amount, 0);
  return value === 0 ? "—" : yen.format(value);
}

function TrialBalanceRow({ line }: { line: TrialBalanceLine }) {
  return (
    <tr className="border-b border-stone-100 dark:border-stone-800 last:border-0 print:break-inside-avoid">
      <td className="px-3 py-2 font-medium whitespace-nowrap">{line.account}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatSignedAsColumn(line.openingBalance, "debit")}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatSignedAsColumn(line.openingBalance, "credit")}</td>
      <td className="px-3 py-2 text-right tabular-nums">{line.periodDebit === 0 ? "—" : yen.format(line.periodDebit)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{line.periodCredit === 0 ? "—" : yen.format(line.periodCredit)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSignedAsColumn(line.closingBalance, "debit")}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSignedAsColumn(line.closingBalance, "credit")}</td>
    </tr>
  );
}

export function TrialBalanceTable({ tb }: { tb: TrialBalance }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">合計残高試算表</h2>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed max-w-2xl">
        対象期間: {tb.periodStart} 〜 {tb.periodEnd}。
        預金口座等の入出金明細を現金主義的に集計した簡易試算であり、正式な総勘定元帳・仕訳帳に基づく試算表ではありません。
      </p>
      <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
              <th className="px-3 py-2 font-normal" rowSpan={2}>勘定科目</th>
              <th className="px-3 py-2 font-normal text-center" colSpan={2}>前期繰越高</th>
              <th className="px-3 py-2 font-normal text-center" colSpan={2}>当期発生高</th>
              <th className="px-3 py-2 font-normal text-center" colSpan={2}>残高</th>
            </tr>
            <tr className="border-b border-stone-300 dark:border-stone-700 text-right text-stone-500 dark:text-stone-400 text-xs">
              <th className="px-3 py-2 font-normal">借方</th>
              <th className="px-3 py-2 font-normal">貸方</th>
              <th className="px-3 py-2 font-normal">借方</th>
              <th className="px-3 py-2 font-normal">貸方</th>
              <th className="px-3 py-2 font-normal">借方</th>
              <th className="px-3 py-2 font-normal">貸方</th>
            </tr>
          </thead>
          <tbody>
            {tb.lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-stone-500 dark:text-stone-400">
                  対象期間の取引がありません。
                </td>
              </tr>
            ) : (
              tb.lines.map((line) => <TrialBalanceRow key={line.account} line={line} />)
            )}
          </tbody>
          {tb.lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-stone-400 dark:border-stone-600 font-semibold">
                <td className="px-3 py-2">合計</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.openingDebitTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.openingCreditTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.periodDebitTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.periodCreditTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.closingDebitTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(tb.closingCreditTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className={`text-xs mt-3 ${tb.balanced ? "text-stone-400" : "text-red-700"}`}>
        {tb.balanced
          ? "検算: 残高の借方合計＝貸方合計（一致）"
          : "検算エラー: 残高の借方合計と貸方合計が一致していません。前期繰越高等の入力値をご確認ください。"}
      </p>
    </section>
  );
}
