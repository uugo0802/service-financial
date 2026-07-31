"use client";

import { useMemo, useState } from "react";
import {
  SimplifiedBusinessCategory,
  SIMPLIFIED_BUSINESS_CATEGORY_LABELS,
} from "@/lib/tax/consumptionTaxForm";
import {
  BusinessCategorySalesBreakdown,
  simulateSimplifiedVsGeneralTaxation,
} from "@/lib/tax/simplifiedTaxationSimulator";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const CHEAPER_METHOD_LABELS = {
  simplified: "簡易課税",
  general: "原則課税",
  tie: "どちらも同額",
} as const;

const BUSINESS_CATEGORIES = Object.keys(SIMPLIFIED_BUSINESS_CATEGORY_LABELS).map(
  (key) => Number(key) as SimplifiedBusinessCategory
);

interface CategoryRow {
  key: string;
  category: SimplifiedBusinessCategory;
  taxableSales: string;
}

let rowKeySeq = 0;
function newRowKey(): string {
  rowKeySeq += 1;
  return `row-${rowKeySeq}`;
}

/**
 * 簡易課税 vs 原則課税 選択シミュレーター。
 *
 * 基準期間の課税売上高、当期の課税売上高（事業区分別内訳）、原則課税を選択した場合の
 * 実額の課税仕入高を入力すると、両方式の概算納税額を比較し、どちらが有利かの目安と
 * 2年縛りの注意喚起を表示する。計算自体は simulateSimplifiedVsGeneralTaxation
 * （純粋関数）に委譲し、このコンポーネントはフォーム状態の管理と結果表示のみを担う。
 */
export function SimplifiedTaxationSimulator() {
  const [baseYearTaxableSales, setBaseYearTaxableSales] = useState("30000000");
  const [actualTaxablePurchases, setActualTaxablePurchases] = useState("3000000");
  const [rows, setRows] = useState<CategoryRow[]>([{ key: newRowKey(), category: 5, taxableSales: "10000000" }]);

  const addRow = () => {
    setRows((prev) => [...prev, { key: newRowKey(), category: 5, taxableSales: "0" }]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  };

  const updateRow = (key: string, patch: Partial<Omit<CategoryRow, "key">>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const { result, error } = useMemo(() => {
    try {
      const businessCategoryBreakdown: BusinessCategorySalesBreakdown[] = rows.map((r) => ({
        category: r.category,
        taxableSales: Number(r.taxableSales),
      }));
      const r = simulateSimplifiedVsGeneralTaxation({
        baseYearTaxableSales: Number(baseYearTaxableSales),
        actualTaxablePurchases: Number(actualTaxablePurchases),
        businessCategoryBreakdown,
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [baseYearTaxableSales, actualTaxablePurchases, rows]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="simplified-base-year-taxable-sales">基準期間（原則2年前）の課税売上高（円）</label>
          <input
            id="simplified-base-year-taxable-sales"
            type="number"
            min="0"
            value={baseYearTaxableSales}
            onChange={(e) => setBaseYearTaxableSales(e.target.value)}
            placeholder="例：30000000"
            className={inputClass}
          />
          <p className="text-xs text-stone-500 mt-1">
            この金額が5,000万円を超えていると、当期は簡易課税を選択できません。
          </p>
        </div>

        <div className="border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>当期の課税売上高（税抜・事業区分別内訳）</label>
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-stone-600 border border-stone-400 rounded px-2 py-1 hover:bg-stone-100"
            >
              + 事業区分を追加
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className={labelClass} htmlFor={`simplified-row-category-${row.key}`}>事業区分</label>
                  <select
                    id={`simplified-row-category-${row.key}`}
                    value={row.category}
                    onChange={(e) => updateRow(row.key, { category: Number(e.target.value) as SimplifiedBusinessCategory })}
                    className={inputClass}
                  >
                    {BUSINESS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {SIMPLIFIED_BUSINESS_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor={`simplified-row-sales-${row.key}`}>課税売上高（円）</label>
                  <input
                    id={`simplified-row-sales-${row.key}`}
                    type="number"
                    min="0"
                    value={row.taxableSales}
                    onChange={(e) => updateRow(row.key, { taxableSales: e.target.value })}
                    placeholder="例：10000000"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length <= 1}
                  className="text-xs text-stone-500 border border-stone-300 rounded px-2 py-2 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-stone-200 pt-4">
          <label className={labelClass} htmlFor="simplified-actual-taxable-purchases">原則課税を選んだ場合の当期の課税仕入高・実額（税抜、円）</label>
          <input
            id="simplified-actual-taxable-purchases"
            type="number"
            min="0"
            value={actualTaxablePurchases}
            onChange={(e) => setActualTaxablePurchases(e.target.value)}
            placeholder="例：3000000"
            className={inputClass}
          />
          <p className="text-xs text-stone-500 mt-1">
            仕入・外注費・経費など、課税仕入れに該当する支出の合計額の見込みを入力してください。
          </p>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">試算結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            {!result.eligible && (
              <div className="border border-red-400 bg-red-50 rounded p-3 text-sm text-red-800">
                <p className="font-semibold mb-1">当期は簡易課税を選択できません</p>
                <p>{result.eligibilityNote}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div
                className={`border rounded-lg p-4 ${
                  result.recommendedMethod === "simplified" ? "border-emerald-400 bg-emerald-50" : "border-stone-300 bg-white"
                }`}
              >
                <div className="text-xs text-stone-500 mb-1">簡易課税（概算）</div>
                <div className="text-2xl font-semibold">{result.simplified.taxDue.toLocaleString("ja-JP")}円</div>
                <div className="text-xs text-stone-500 mt-1">
                  控除対象仕入税額（みなし仕入率適用）: {result.simplified.deductibleInputTax.toLocaleString("ja-JP")}円
                </div>
              </div>
              <div
                className={`border rounded-lg p-4 ${
                  result.recommendedMethod === "general" ? "border-emerald-400 bg-emerald-50" : "border-stone-300 bg-white"
                }`}
              >
                <div className="text-xs text-stone-500 mb-1">原則課税（概算）</div>
                <div className="text-2xl font-semibold">{result.general.taxDue.toLocaleString("ja-JP")}円</div>
                <div className="text-xs text-stone-500 mt-1">
                  控除対象仕入税額（実額）: {result.general.deductibleInputTax.toLocaleString("ja-JP")}円
                </div>
              </div>
            </div>

            <div className="border border-stone-300 bg-white rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <span className="inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium bg-stone-700 text-white">
                  参考：金額だけで見た場合
                </span>
                <div className="text-lg font-semibold mt-1">
                  {CHEAPER_METHOD_LABELS[result.cheaperMethod]}が
                  {result.cheaperMethod === "tie" ? "同額です" : `${result.taxDueDelta.toLocaleString("ja-JP")}円安く見込まれます`}
                </div>
              </div>
              {result.eligible && (
                <div className="text-sm text-stone-600 max-w-xs">
                  当期は選択可能なため、この試算どおり{CHEAPER_METHOD_LABELS[result.recommendedMethod]}が有利な目安になります。
                </div>
              )}
            </div>

            <div className="border border-stone-300 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">事業区分</th>
                    <th className="px-3 py-2 font-normal">課税売上高</th>
                    <th className="px-3 py-2 font-normal">みなし仕入率</th>
                    <th className="px-3 py-2 font-normal">控除対象仕入税額</th>
                  </tr>
                </thead>
                <tbody>
                  {result.simplified.categoryBreakdown.map((c) => (
                    <tr key={c.category} className="border-b border-stone-100 last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap">{c.categoryLabel}</td>
                      <td className="px-3 py-2">{c.taxableSales.toLocaleString("ja-JP")}円</td>
                      <td className="px-3 py-2">{Math.round(c.deemedPurchaseRate * 100)}%</td>
                      <td className="px-3 py-2">{c.deductibleInputTax.toLocaleString("ja-JP")}円</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">2年縛りに関する注意</p>
              <p className="leading-relaxed">{result.twoYearLockInWarning}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-stone-700">前提・注意事項</h3>
              <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
                {result.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
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
