import { TableScrollArea } from "@/components/ui/TableScrollArea";
import { StatutoryReportSummaryForm } from "@/lib/tax/statutoryReportSummaryForm";

// ------------------------------------------------------------------
// 「法定調書合計表」の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント(サーバーコンポーネントとしても利用可能)。
// 4つの個別合計表(給与所得の源泉徴収票合計表/退職所得の源泉徴収票合計表/
// 報酬,料金,契約金及び賞金の支払調書合計表/不動産の使用料等の支払調書合計表)を
// それぞれカード+テーブルとして並べ、末尾に全区分の合計を表示する。
// DepreciationScheduleTable.tsx・PaymentReportTable.tsxと同じ見た目の作法に合わせている。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

export function StatutoryReportSummaryTable({ form }: { form: StatutoryReportSummaryForm }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="border-2 border-stone-800 dark:border-stone-300">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-stone-800 dark:border-stone-300 px-3 py-2">
          <div className="text-sm font-semibold tracking-widest">{form.formTitle}</div>
          <div className="text-xs text-stone-500 dark:text-stone-400 shrink-0">{form.fiscalYearLabel}</div>
        </div>

        <div className="px-3 py-2 text-xs text-stone-600 dark:text-stone-400 space-y-0.5">
          <div>
            提出者: <span className="font-medium text-stone-800 dark:text-stone-200">{form.submitter.name}</span>
          </div>
          {form.submitter.address && <div>所在地: {form.submitter.address}</div>}
          {form.submitter.corporateNumber && <div>法人番号: {form.submitter.corporateNumber}</div>}
          {form.submitter.representativeName && <div>代表者: {form.submitter.representativeName}</div>}
          {form.submitter.taxOfficeName && <div>提出先税務署: {form.submitter.taxOfficeName}</div>}
        </div>

        <div className="grid sm:grid-cols-3 gap-3 px-3 py-3 border-t border-stone-300 dark:border-stone-700">
          <div className="border border-stone-300 dark:border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">提出枚数（人員）合計</p>
            <p className="text-lg font-semibold tabular-nums mt-1">{form.overallTotals.totalDocumentCount}件</p>
          </div>
          <div className="border border-stone-300 dark:border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">支払金額合計</p>
            <p className="text-lg font-semibold tabular-nums mt-1">{yen.format(form.overallTotals.totalPaymentAmount)}円</p>
          </div>
          <div className="border border-stone-300 dark:border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">源泉徴収税額合計</p>
            <p className="text-lg font-semibold tabular-nums mt-1">
              {yen.format(form.overallTotals.totalWithholdingTaxAmount)}円
            </p>
          </div>
        </div>
      </div>

      {form.sections.map((section) => (
        <div key={section.id} className="border border-stone-300 dark:border-stone-700">
          <div className="flex items-baseline justify-between gap-3 border-b border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900 px-3 py-2">
            <div className="text-sm font-semibold">{section.title}</div>
            {!section.supported && (
              <span className="text-xs text-warning-foreground shrink-0">この区分は本アプリ非対応（常に0件）</span>
            )}
          </div>

          {section.rows.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-500 dark:text-stone-400">
              {section.supported ? "該当する集計対象データがありません。" : "本アプリではこの区分の下書きを作成できません。"}
            </p>
          ) : (
            <TableScrollArea>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-stone-400 dark:border-stone-600 text-left text-stone-500 dark:text-stone-400 text-xs">
                    <th className="px-3 py-2 font-normal">区分</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">人員</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">支払金額</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">源泉徴収税額</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.category} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{row.personCount}人</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{yen.format(row.paymentAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {yen.format(row.withholdingTaxAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-800 dark:border-stone-300 font-semibold">
                    <td className="px-3 py-2">{section.subtotal.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {section.subtotal.personCount}人
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {yen.format(section.subtotal.paymentAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {yen.format(section.subtotal.withholdingTaxAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableScrollArea>
          )}

          {section.notes.length > 0 && (
            <ul className="px-3 py-2 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400 leading-relaxed list-disc list-inside space-y-1">
              {section.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <ul className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed list-disc list-inside space-y-1">
        {form.assumptions.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
