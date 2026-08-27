"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import { EstimatedTaxReminder } from "@/components/EstimatedTaxReminder";
import { getIndividualEstimatedTaxObligations } from "@/lib/tax/individualEstimatedTax";

export default function EstimatedTaxPage() {
  const currentYear = new Date().getFullYear();
  const [priorYearConfirmedIncomeTaxInput, setPriorYearConfirmedIncomeTaxInput] = useState("600000");
  const [priorYearWithholdingTaxInput, setPriorYearWithholdingTaxInput] = useState("100000");
  const [taxYearInput, setTaxYearInput] = useState(String(currentYear));

  const priorYearConfirmedIncomeTax = Number(priorYearConfirmedIncomeTaxInput) || 0;
  const priorYearWithholdingTax = Number(priorYearWithholdingTaxInput) || 0;
  const taxYear = Number(taxYearInput) || currentYear;

  const result = useMemo(
    () =>
      getIndividualEstimatedTaxObligations({
        priorYearConfirmedIncomeTax,
        priorYearWithholdingTax,
        taxYear,
      }),
    [priorYearConfirmedIncomeTax, priorYearWithholdingTax, taxYear]
  );

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">予定納税リマインダー（個人事業主向け）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">予定納税リマインダー</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            前年（前年分）の確定申告に基づく所得税額から源泉徴収税額を差し引いた金額（予定納税基準額）が
            15万円を超える個人事業主・フリーランスは、確定申告とは別に、年2回「予定納税」として所得税の
            一部をあらかじめ納付する必要があります。前年の税額を入力すると、今年の予定納税の要否・期日・概算額を表示します。
          </p>
        </section>

        <section className="border border-stone-300 bg-white rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-3 text-stone-700">なぜ予定納税が重要か</h2>
          <ul className="text-sm text-stone-600 leading-relaxed list-disc list-inside space-y-1">
            <li>
              対象になっているのに納付を忘れると延滞税がかかったり、翌年3月の確定申告時に精算額と
              合わせて大きな金額の資金繰りが必要になったりします。
            </li>
            <li>
              予定納税基準額が15万円を超える場合、第1期（7月1日〜7月31日）・第2期（11月1日〜11月30日）に、
              それぞれ予定納税基準額の3分の1相当額を納付するのが原則です。
            </li>
            <li>
              その年の所得が前年より大きく減る見込みなどの場合は、税務署に「予定納税額の減額申請書」を
              提出することで納付額を減らせる場合があります（本ツールは減額申請の判定・計算には対応していません）。
            </li>
          </ul>
        </section>

        <section>
          <div className="text-xs text-stone-500 mb-4">前年の税額・予定納税の対象年を入力してください</div>
          <div className="flex flex-col gap-4 max-w-md">
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前年の確定申告に基づく所得税額
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorYearConfirmedIncomeTaxInput}
                onChange={(e) => setPriorYearConfirmedIncomeTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 600000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前年の源泉徴収税額
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorYearWithholdingTaxInput}
                onChange={(e) => setPriorYearWithholdingTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 100000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              予定納税の対象年
              <input
                type="number"
                inputMode="numeric"
                value={taxYearInput}
                onChange={(e) => setTaxYearInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder={String(currentYear)}
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">{taxYear}年分の予定納税</h2>
          <EstimatedTaxReminder
            priorYearConfirmedIncomeTax={priorYearConfirmedIncomeTax}
            priorYearWithholdingTax={priorYearWithholdingTax}
            taxYear={taxYear}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">判定結果の内訳</h2>
          <TableScrollArea innerClassName="border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">項目</th>
                  <th className="px-3 py-2 font-normal text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="px-3 py-2">前年の確定申告に基づく所得税額</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ¥{result.priorYearConfirmedIncomeTax.toLocaleString("ja-JP")}
                  </td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="px-3 py-2">前年の源泉徴収税額</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ¥{result.priorYearWithholdingTax.toLocaleString("ja-JP")}
                  </td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="px-3 py-2">予定納税基準額（しきい値 ¥{result.thresholdAmount.toLocaleString("ja-JP")}超で必要）</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ¥{result.obligationBaseAmount.toLocaleString("ja-JP")}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">判定</td>
                  <td className="px-3 py-2 text-right font-medium">{result.required ? "必要" : "不要"}</td>
                </tr>
              </tbody>
            </table>
          </TableScrollArea>
        </section>

        <section className="border-t border-stone-300 pt-6">
          <p className="text-xs text-stone-400 leading-relaxed max-w-2xl">
            本ページで表示される要否・期日・金額は、前年の税額と一般的な制度上のしきい値・暦情報に基づく参考値であり、
            個別の税務相談・助言ではありません。各期の納付額は予定納税基準額の3分の1という簡便な計算（1,000円未満切り捨て）であり、
            税務署から送付される「予定納税額の通知書」の金額が優先されます。所得の減少などにより納付額を減らせる
            「予定納税額の減額申請」の判定・計算には対応していません。実際の要否・金額・期日は、必ず通知書および
            国税庁・税務署・税理士等の専門家にご確認ください。
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
