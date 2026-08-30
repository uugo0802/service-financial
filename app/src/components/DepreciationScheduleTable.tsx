import { DepreciationScheduleForm } from "@/lib/tax/depreciationScheduleForm";
import { OfficialFormFrame } from "@/components/OfficialForm";

// ------------------------------------------------------------------
// 別表十六（一）減価償却資産の償却額の計算に関する明細書（定額法）の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能。
// OfficialFormFrame自体は"use client"だが、サーバーコンポーネントからクライアント
// コンポーネントを子として描画すること自体は問題ない）。
// 外枠は他の別表（DocumentPreview.tsx内の別表一・別表四・別表五(一)/(二)等）と同じ
// OfficialFormFrame（実際の国税庁様式に寄せた、右端に様式番号を縦書きする額縁）を再利用し、
// 実際の様式の列構成（種類・取得年月・耐用年数・取得価額…）を模した罫線付きの表を中に描画する。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function formatRate(rate: number): string {
  return rate.toFixed(3);
}

export function DepreciationScheduleTable({
  form,
  entityName,
}: {
  form: DepreciationScheduleForm;
  /** 様式ヘッダーに表示する法人名（屋号）。省略時は表示しない。 */
  entityName?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <OfficialFormFrame scheduleLabel={form.formLabel} formTitle={form.formTitle}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-stone-300 pb-2 text-xs text-stone-600">
          <span>事業年度: {form.fiscalPeriod.start} 〜 {form.fiscalPeriod.end}</span>
          {entityName && <span>法人名: {entityName}</span>}
        </div>

        {form.rows.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-stone-500">
            対象期間・登録資産のもとでは、定額法による明細に記載できる資産がありません。
          </p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-2 py-2 font-normal whitespace-nowrap">種類・名称</th>
                  <th className="px-2 py-2 font-normal whitespace-nowrap">取得年月</th>
                  <th className="px-2 py-2 font-normal whitespace-nowrap">事業供用年月</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">耐用年数</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">取得価額</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">差引取得価額</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">償却の基礎になる金額</th>
                  <th className="px-2 py-2 font-normal whitespace-nowrap">償却方法</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">償却率</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">事業供用月数</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">本年分の普通償却限度額</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">本年分の償却費</th>
                  <th className="px-2 py-2 font-normal text-right whitespace-nowrap">差引期末帳簿価額</th>
                  <th className="px-2 py-2 font-normal whitespace-nowrap">摘要</th>
                </tr>
              </thead>
              <tbody>
                {form.rows.map((row) => (
                  <tr
                    key={row.assetId}
                    className="border-b border-stone-100 last:border-0 align-top print:break-inside-avoid"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{row.assetName}</td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">{row.acquisitionDate}</td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">{row.serviceStartDate}</td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{row.usefulLifeYears}年</td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen.format(row.acquisitionCost)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen.format(row.netAcquisitionCost)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen.format(row.depreciationBase)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-stone-500">定額法</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatRate(row.depreciationRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{row.monthsInService}ヶ月</td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen.format(row.ordinaryDepreciationLimit)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">
                      {yen.format(row.currentYearDepreciationExpense)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen.format(row.endingBookValue)}</td>
                    <td className="px-2 py-2 text-xs text-stone-500 max-w-[14rem]">
                      {row.remarks.length > 0 ? row.remarks.join(" ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-800 font-semibold print:break-inside-avoid">
                  <td className="px-2 py-2" colSpan={4}>
                    合計
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen.format(form.totals.acquisitionCostTotal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen.format(form.totals.netAcquisitionCostTotal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen.format(form.totals.depreciationBaseTotal)}</td>
                  <td className="px-2 py-2" colSpan={2} />
                  <td className="px-2 py-2 text-right tabular-nums">
                    {yen.format(form.totals.ordinaryDepreciationLimitTotal)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {yen.format(form.totals.currentYearDepreciationExpenseTotal)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen.format(form.totals.endingBookValueTotal)}</td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </OfficialFormFrame>

      {(form.excludedDecliningBalanceAssets.length > 0 || form.excludedImmediateExpensingAssets.length > 0) && (
        <div className="border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">この明細（別表十六（一））の対象外とした資産があります</p>
          {form.excludedDecliningBalanceAssets.length > 0 && (
            <p className="mt-1 text-xs leading-relaxed">
              定率法の資産（{form.excludedDecliningBalanceAssets.map((a) => a.name).join("、")}）は、
              別表十六（二）に記載すべきものです。本アプリは別表十六（二）の生成に対応していません。
            </p>
          )}
          {form.excludedImmediateExpensingAssets.length > 0 && (
            <p className="mt-1 text-xs leading-relaxed">
              少額減価償却資産の特例が適用された資産（
              {form.excludedImmediateExpensingAssets.map((a) => a.name).join("、")}）は、別表十六（七）に
              記載すべきものです。本アプリは別表十六（七）の生成に対応していません。
            </p>
          )}
        </div>
      )}

      <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
        {form.notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
