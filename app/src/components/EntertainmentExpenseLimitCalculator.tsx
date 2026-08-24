"use client";

import { useMemo, useState } from "react";
import {
  FIXED_DEDUCTION_LIMIT_ANNUAL,
  calculateEntertainmentExpenseLimit,
  type EntertainmentExpenseLimitInput,
} from "@/lib/tax/entertainmentExpenseLimit";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const defaultInput: EntertainmentExpenseLimitInput = {
  totalEntertainmentExpense: 6_000_000,
  entertainmentMealExpense: 2_000_000,
  fiscalYearMonths: 12,
};

/**
 * 法人の交際費等の損金不算入額計算機（租税特別措置法61条の4）。
 *
 * 交際費等の合計額・接待飲食費の内数・事業年度の月数を入力すると、
 * calculateEntertainmentExpenseLimit（純粋関数）に委譲して、定額控除限度額
 * （月割り後）と接待飲食費50%相当額のうち有利な方を判定し、損金算入額・
 * 損金不算入額（別表四の加算対象額）を表示する。corporateEstimate.tsの
 * 概算試算とは独立した参考計算機であり、結果を自動で反映することはしない。
 */
export function EntertainmentExpenseLimitCalculator() {
  const [input, setInput] = useState<EntertainmentExpenseLimitInput>(defaultInput);

  const updateField = (patch: Partial<EntertainmentExpenseLimitInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
  };

  const { result, error } = useMemo(() => {
    try {
      return { result: calculateEntertainmentExpenseLimit(input), error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [input]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <h2 className="text-sm font-semibold text-stone-700">交際費等の入力</h2>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className={labelClass} htmlFor="total-entertainment-expense">
              交際費等の合計額（円）
            </label>
            <input
              id="total-entertainment-expense"
              type="number"
              min="0"
              value={input.totalEntertainmentExpense}
              onChange={(e) => updateField({ totalEntertainmentExpense: Number(e.target.value) })}
              placeholder="例：6000000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="entertainment-meal-expense">
              うち接待飲食費（円）
            </label>
            <input
              id="entertainment-meal-expense"
              type="number"
              min="0"
              value={input.entertainmentMealExpense}
              onChange={(e) => updateField({ entertainmentMealExpense: Number(e.target.value) })}
              placeholder="例：2000000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="fiscal-year-months">
              事業年度の月数
            </label>
            <input
              id="fiscal-year-months"
              type="number"
              min="0"
              max="12"
              step="0.1"
              value={input.fiscalYearMonths}
              onChange={(e) => updateField({ fiscalYearMonths: Number(e.target.value) })}
              placeholder="例：12"
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-xs text-stone-500 leading-relaxed">
          交際費等の合計額・接待飲食費とも、1人当たり5,000円以下の飲食費（一定の書類の保存等の
          要件を満たし、そもそも交際費等に該当しないもの）は含めずに入力してください。定額控除限度額は
          年{FIXED_DEDUCTION_LIMIT_ANNUAL.toLocaleString("ja-JP")}円で、事業年度が12か月に満たない場合は
          月割り（1か月未満切り上げ）で計算します。
        </p>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">計算結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            <div
              className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${
                result.nonDeductibleAmount > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"
              }`}
            >
              <div>
                <span
                  className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${
                    result.nonDeductibleAmount > 0 ? "bg-amber-700 text-white" : "bg-emerald-700 text-white"
                  }`}
                >
                  有利な選択肢
                </span>
                <div className="text-lg font-semibold mt-1">
                  {result.favorableOption === "half_of_entertainment_meal_expense"
                    ? "接待飲食費の50%相当額"
                    : "定額控除限度額"}
                </div>
              </div>
              <div className="text-sm text-stone-600 text-right">
                <div>
                  損金算入額: <span className="font-semibold text-stone-800">{result.deductibleAmount.toLocaleString("ja-JP")}円</span>
                </div>
                <div>
                  損金不算入額（別表四加算）:{" "}
                  <span className="font-semibold text-stone-800">{result.nonDeductibleAmount.toLocaleString("ja-JP")}円</span>
                </div>
              </div>
            </div>

            <div className="border border-stone-300 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">選択肢</th>
                    <th className="px-3 py-2 font-normal">計算内容</th>
                    <th className="px-3 py-2 font-normal">損金算入額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className={`border-b border-stone-100 last:border-b-0 ${
                      result.favorableOption === "fixed_deduction_limit" ? "bg-emerald-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      (a) 定額控除限度額
                      {result.favorableOption === "fixed_deduction_limit" && (
                        <span className="ml-2 text-xs text-emerald-700 font-normal">採用</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      限度額 {result.fixedDeductionLimit.toLocaleString("ja-JP")}円（事業年度
                      {result.roundedFiscalYearMonths}か月分）と交際費等合計額のいずれか小さい方
                    </td>
                    <td className="px-3 py-2 text-stone-800 whitespace-nowrap">
                      {result.fixedDeductionDeductibleAmount.toLocaleString("ja-JP")}円
                    </td>
                  </tr>
                  <tr
                    className={`border-b border-stone-100 last:border-b-0 ${
                      result.favorableOption === "half_of_entertainment_meal_expense" ? "bg-emerald-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      (b) 接待飲食費の50%
                      {result.favorableOption === "half_of_entertainment_meal_expense" && (
                        <span className="ml-2 text-xs text-emerald-700 font-normal">採用</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-stone-600">接待飲食費 × 50%（上限なし）</td>
                    <td className="px-3 py-2 text-stone-800 whitespace-nowrap">
                      {result.halfOfEntertainmentMealExpenseAmount.toLocaleString("ja-JP")}円
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-stone-700">計算過程</h3>
              <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
                {result.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-amber-700 leading-relaxed">{result.disclaimer}</p>
          </div>
        ) : (
          <p className="text-sm text-stone-500">入力内容をご確認ください。</p>
        )}
      </section>
    </div>
  );
}
