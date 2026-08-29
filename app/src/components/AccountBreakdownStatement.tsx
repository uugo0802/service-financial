import { AccountBreakdown } from "@/lib/tax/accountBreakdownForm";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

// ------------------------------------------------------------------
// 勘定科目内訳明細書（簡易版）の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// 見せ方は components/DocumentPreview.tsx の accountBreakdown タブ（マーケティングデモ用、
// こちらは変更しない）を参考にしつつ、決算書類ページの他セクション
// （NotesToFinancialStatements.tsx等）と同じTableScrollArea/罫線スタイルに合わせている。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function AccountBreakdownStatement({ breakdowns }: { breakdowns: AccountBreakdown[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">勘定科目内訳明細書（簡易版）</h2>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-4 leading-relaxed max-w-2xl">
        このアプリは取引明細（フロー情報）のみを保持しているため、正式様式にある現金預金・売掛金・買掛金・借入金等
        （期末残高が前提の科目）の内訳書は作成できません。明細から機械的に内訳を算出できる主要な損益科目のみを、
        摘要文字列ベースの取引先別に表示しています。取引先名の表記ゆれ（同一取引先の統合）は行っていません。
      </p>
      {breakdowns.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          内訳の対象となる科目（地代家賃・外注費・広告宣伝費等）の取引がありませんでした。
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {breakdowns.map((breakdown) => (
            <div key={breakdown.account}>
              <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2">
                {breakdown.account}の内訳書
              </h3>
              <TableScrollArea innerClassName="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
                <table className="w-full text-sm">
                  <tbody>
                    {breakdown.lines.map((line) => (
                      <tr
                        key={line.counterparty}
                        className="border-b border-stone-100 dark:border-stone-800 last:border-0 print:break-inside-avoid"
                      >
                        <td className="px-3 py-2">
                          {line.counterparty}
                          {line.transactionCount > 1 && (
                            <span className="text-xs text-stone-400 dark:text-stone-500 ml-1">
                              （{line.transactionCount}件）
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{yen.format(line.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold print:break-inside-avoid">
                      <td className="px-3 py-2">計</td>
                      <td className="px-3 py-2 text-right tabular-nums">{yen.format(breakdown.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </TableScrollArea>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
