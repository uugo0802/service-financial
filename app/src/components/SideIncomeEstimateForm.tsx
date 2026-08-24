"use client";

import { useId, useMemo, useState } from "react";
import { estimateCombinedSalaryAndBusinessIncomeTax } from "@/lib/tax/sideIncomeEstimate";

// 給与所得（本業の会社員としての給与収入）と事業所得（副業・個人事業の利益）を
// 合算した総合課税の所得税額を概算するフォーム。
// 免責: これは概算シミュレーションであり、個別具体の税務相談・助言ではない（税理士法対応）。

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function SideIncomeEstimateForm() {
  const [salaryRevenueInput, setSalaryRevenueInput] = useState("5000000");
  const [businessProfitInput, setBusinessProfitInput] = useState("1000000");
  const formId = useId();

  const salaryRevenue = Number(salaryRevenueInput) || 0;
  const businessProfit = Number(businessProfitInput) || 0;

  const result = useMemo(
    () => estimateCombinedSalaryAndBusinessIncomeTax({ salaryRevenue, businessProfit }),
    [salaryRevenue, businessProfit]
  );

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 max-w-md">
        <label className="flex flex-col gap-1 text-xs text-stone-500">
          給与収入（年間・税込の額面、源泉徴収前）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={salaryRevenueInput}
            onChange={(e) => setSalaryRevenueInput(e.target.value)}
            placeholder="例: 5000000"
            aria-label="給与収入"
            className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
          />
          <span className="text-stone-400">源泉徴収票の「支払金額」欄の金額を入力してください</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-stone-500">
          事業所得（副業・個人事業の年間利益、必要経費・青色申告特別控除を差し引いた後の金額）
          <input
            type="number"
            inputMode="numeric"
            value={businessProfitInput}
            onChange={(e) => setBusinessProfitInput(e.target.value)}
            placeholder="例: 1000000"
            aria-label="事業所得"
            className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
          />
          <span className="text-stone-400">
            赤字（マイナス）の場合はマイナスの値で入力してください（給与所得と損益通算します）
          </span>
        </label>
      </form>

      <section aria-labelledby={`${formId}-result-heading`} className="flex flex-col gap-4">
        <h3 id={`${formId}-result-heading`} className="text-sm font-semibold">
          計算結果（総合課税の概算）
        </h3>

        <div className="overflow-x-auto border border-stone-300">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-stone-100 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-normal">項目</th>
                <th className="px-3 py-2 font-normal text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">給与収入</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(result.salaryRevenue)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">給与所得控除</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">
                  −{formatYen(result.employmentIncomeDeduction)}
                </td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">給与所得</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatYen(result.salaryIncome)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">事業所得（副業）</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatYen(result.businessProfit)}</td>
              </tr>
              <tr className="border-t border-stone-300 bg-stone-50">
                <td className="px-3 py-2 font-semibold">合計所得金額</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatYen(result.totalIncome)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">基礎控除</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">−{formatYen(480_000)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">課税所得金額</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatYen(result.taxableIncome)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">所得税額（適用税率 {result.incomeTax.marginalRate}%）</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(result.incomeTax.tax)}</td>
              </tr>
              <tr className="border-t border-stone-200">
                <td className="px-3 py-2">復興特別所得税（2.1%）</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(result.reconstructionSurtax)}</td>
              </tr>
              <tr className="border-t border-stone-400 bg-stone-50">
                <td className="px-3 py-2 font-semibold">所得税及び復興特別所得税の合計</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatYen(result.totalIncomeTax)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
          {result.assumptions.map((assumption, index) => (
            <li key={index}>{assumption}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
