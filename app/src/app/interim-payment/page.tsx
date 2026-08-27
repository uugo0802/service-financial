"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import { InterimPaymentReminder } from "@/components/InterimPaymentReminder";
import { getInterimPaymentObligations } from "@/lib/tax/interimPayment";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function toDateInputValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export default function InterimPaymentPage() {
  const currentYear = new Date().getFullYear();
  const [priorYearCorporateTaxInput, setPriorYearCorporateTaxInput] = useState("300000");
  const [priorYearConsumptionTaxInput, setPriorYearConsumptionTaxInput] = useState("600000");
  const [fiscalYearStartDate, setFiscalYearStartDate] = useState(toDateInputValue(currentYear, 4));

  const priorYearCorporateTax = Number(priorYearCorporateTaxInput) || 0;
  const priorYearConsumptionTax = Number(priorYearConsumptionTaxInput) || 0;

  const result = useMemo(
    () =>
      getInterimPaymentObligations({
        priorYearCorporateTax,
        priorYearConsumptionTax,
        fiscalYearStartDate,
      }),
    [priorYearCorporateTax, priorYearConsumptionTax, fiscalYearStartDate],
  );

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">中間申告・中間納付リマインダー</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">中間申告・中間納付リマインダー</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            前期（直前の事業年度）の確定法人税額・確定消費税額が一定額を超えるマイクロ法人は、
            決算だけでなく事業年度の途中でも「中間申告・中間納付」が必要になります。
            前期確定税額と当期の事業年度開始日を入力すると、今期の中間申告・中間納付の要否・期日・概算額を表示します。
          </p>
        </section>

        <section className="border border-stone-300 bg-white rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-3 text-stone-700">なぜ中間申告・中間納付が重要か</h2>
          <ul className="text-sm text-stone-600 leading-relaxed list-disc list-inside space-y-1">
            <li>
              対象になっているのに申告・納付を忘れると、延滞税がかかったり、決算時に一括で大きな金額を
              納める資金繰りの負担が発生したりします。
            </li>
            <li>
              法人税は前期確定法人税額が20万円を超える場合、消費税は前期確定消費税額（国税部分）が
              48万円を超える場合に、事業年度開始から6か月を経過した日から2か月以内が期日になります。
            </li>
            <li>
              前期の実績に基づく「予定申告」（本ツールの計算方式）のほか、中間期の仮決算を組んで申告する
              「仮決算による中間申告」を選ぶこともできます（本ツールは仮決算方式には対応していません）。
            </li>
          </ul>
        </section>

        <section>
          <div className="text-xs text-stone-500 mb-4">前期の確定税額・当期の事業年度開始日を入力してください</div>
          <div className="flex flex-col gap-4 max-w-md">
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前期確定法人税額（国税、地方法人税を含まない）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorYearCorporateTaxInput}
                onChange={(e) => setPriorYearCorporateTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 300000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前期確定消費税額（国税部分、地方消費税を除く）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorYearConsumptionTaxInput}
                onChange={(e) => setPriorYearConsumptionTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 600000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              当期の事業年度開始日
              <input
                type="date"
                value={fiscalYearStartDate}
                onChange={(e) => setFiscalYearStartDate(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {MONTH_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setFiscalYearStartDate(toDateInputValue(currentYear, i + 1))}
                className="text-xs px-2 py-1 border border-stone-300 bg-white text-stone-500 hover:border-stone-500"
              >
                {label}開始
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">今期の中間申告・中間納付</h2>
          <InterimPaymentReminder
            priorYearCorporateTax={priorYearCorporateTax}
            priorYearConsumptionTax={priorYearConsumptionTax}
            fiscalYearStartDate={fiscalYearStartDate}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">判定結果の内訳</h2>
          <TableScrollArea innerClassName="border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">税目</th>
                  <th className="px-3 py-2 font-normal">前期確定税額</th>
                  <th className="px-3 py-2 font-normal">区分・しきい値</th>
                  <th className="px-3 py-2 font-normal text-right">中間申告・中間納付</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="px-3 py-2">法人税</td>
                  <td className="px-3 py-2 tabular-nums">
                    ¥{result.corporateTax.priorYearCorporateTax.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 text-stone-500">
                    20万円超で必要（しきい値 ¥{result.corporateTax.thresholdAmount.toLocaleString("ja-JP")}）
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {result.corporateTax.required ? "必要" : "不要"}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">消費税</td>
                  <td className="px-3 py-2 tabular-nums">
                    ¥{result.consumptionTax.priorYearConsumptionTax.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 text-stone-500">
                    48万円超400万円以下で年1回。400万円超はより頻繁（本ツールは年1回区分のみ計算）
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {result.consumptionTax.tier === "none" && "不要"}
                    {result.consumptionTax.tier === "annual" && "必要（年1回）"}
                    {result.consumptionTax.tier === "moreFrequent" && "必要（要確認・年3回または年11回）"}
                  </td>
                </tr>
              </tbody>
            </table>
          </TableScrollArea>
        </section>

        <section className="border-t border-stone-300 pt-6">
          <p className="text-xs text-stone-400 leading-relaxed max-w-2xl">
            本ページで表示される要否・期日・金額は、前期確定税額と一般的な制度上のしきい値・暦情報に基づく参考値であり、
            個別の税務相談・助言ではありません。中間納付額は前期確定税額の1/2という簡便な計算（予定申告方式、
            前期が12か月の事業年度であることを前提）であり、仮決算による中間申告や、消費税の年3回・年11回区分の
            金額計算には対応していません。実際の要否・金額・期日は、必ず税務署からの通知および国税庁・お住まいの
            自治体・税理士等の専門家にご確認ください。
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
