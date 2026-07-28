"use client";

import { useId, useState } from "react";
import {
  ALLOCATABLE_ACCOUNTS,
  DEFAULT_BUSINESS_USE_PERCENT,
  ExpenseAllocationRateMap,
  ExpenseAllocationSummary,
  summarizeExpenseAllocation,
} from "@/lib/tax/expenseAllocation";

// 個人事業主向け家事按分（business/private expense allocation）計算UI。
// 免責: 按分率そのものが妥当かどうかの個別税務相談は行わない（税理士法対応）。
// ここでは「入力された按分率を金額に適用する計算」のみを提供する。

const EXTREME_ALLOCATION_CAUTION_LABEL = "按分率が極端な科目があります:";

interface AllocationRow {
  id: string;
  account: string;
  amountInput: string;
  percentInput: string;
}

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `allocation-row-${rowSeq}`;
}

function makeInitialRows(): AllocationRow[] {
  return ALLOCATABLE_ACCOUNTS.map((account) => ({
    id: nextRowId(),
    account,
    amountInput: "",
    percentInput: String(DEFAULT_BUSINESS_USE_PERCENT),
  }));
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function ExpenseAllocationCalculator() {
  const [rows, setRows] = useState<AllocationRow[]>(makeInitialRows);
  const [result, setResult] = useState<ExpenseAllocationSummary | null>(null);
  const formId = useId();

  function updateRow(id: string, patch: Partial<AllocationRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setResult(null); // 入力を変更したら再計算するまで結果は非表示にする
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: nextRowId(), account: "", amountInput: "", percentInput: String(DEFAULT_BUSINESS_USE_PERCENT) },
    ]);
    setResult(null);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setResult(null);
  }

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();

    const rates: ExpenseAllocationRateMap = {};
    const transactions = rows
      .filter((row) => row.account.trim() !== "" && Number(row.amountInput) > 0)
      .map((row) => {
        const percent = Number(row.percentInput);
        rates[row.account.trim()] = Number.isFinite(percent) ? percent : 0;
        return { account: row.account.trim(), amount: -Math.abs(Number(row.amountInput)) };
      });

    setResult(summarizeExpenseAllocation(transactions, rates));
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleCalculate} className="flex flex-col gap-4">
        <div className="overflow-x-auto border border-stone-300">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-stone-100 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-normal">勘定科目</th>
                <th className="px-3 py-2 font-normal">年間支払額（税込・円）</th>
                <th className="px-3 py-2 font-normal">事業按分率（%）</th>
                <th className="px-3 py-2 font-normal sr-only">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-stone-200">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.account}
                      onChange={(e) => updateRow(row.id, { account: e.target.value })}
                      placeholder="例: 地代家賃"
                      aria-label="勘定科目"
                      className="w-full border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={row.amountInput}
                      onChange={(e) => updateRow(row.id, { amountInput: e.target.value })}
                      placeholder="0"
                      aria-label="年間支払額"
                      className="w-full border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.percentInput}
                      onChange={(e) => updateRow(row.id, { percentInput: e.target.value })}
                      aria-label="事業按分率(%)"
                      className="w-24 border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-xs text-stone-500 hover:text-red-700"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={addRow}
            className="text-sm px-4 py-2 border border-stone-400 text-stone-600 hover:border-stone-600"
          >
            科目を追加
          </button>
          <button
            type="submit"
            className="text-sm px-6 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700"
          >
            計算する
          </button>
        </div>
      </form>

      {result && (
        <section aria-labelledby={`${formId}-result-heading`} className="flex flex-col gap-4">
          <h3 id={`${formId}-result-heading`} className="text-sm font-semibold">
            計算結果
          </h3>

          {result.lines.length === 0 ? (
            <p className="text-sm text-stone-500">
              計算対象の行がありません。勘定科目名と金額（1円以上）を入力してください。
            </p>
          ) : (
            <div className="overflow-x-auto border border-stone-300">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-stone-100 text-left text-xs text-stone-500">
                    <th className="px-3 py-2 font-normal">勘定科目</th>
                    <th className="px-3 py-2 font-normal">支払額合計</th>
                    <th className="px-3 py-2 font-normal">按分率</th>
                    <th className="px-3 py-2 font-normal">事業経費</th>
                    <th className="px-3 py-2 font-normal">家事関連費（対象外）</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line) => (
                    <tr key={line.account} className="border-t border-stone-200 align-top">
                      <td className="px-3 py-2">{line.account}</td>
                      <td className="px-3 py-2">{formatYen(line.totalAmount)}</td>
                      <td className="px-3 py-2">{line.businessUsePercent}%</td>
                      <td className="px-3 py-2 font-medium">{formatYen(line.businessAmount)}</td>
                      <td className="px-3 py-2 text-stone-500">{formatYen(line.personalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-400 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      合計
                    </td>
                    <td className="px-3 py-2">{formatYen(result.totalBusinessAmount)}</td>
                    <td className="px-3 py-2 text-stone-500">{formatYen(result.totalPersonalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {result.lines.some((line) => line.caution) && (
            <div className="border border-amber-600 bg-amber-50 p-4 text-xs text-amber-800 leading-relaxed">
              {EXTREME_ALLOCATION_CAUTION_LABEL}
              <ul className="list-disc list-inside mt-2 space-y-1">
                {result.lines
                  .filter((line) => line.caution)
                  .map((line) => (
                    <li key={line.account}>
                      {line.account}（{line.businessUsePercent}%）
                    </li>
                  ))}
              </ul>
              <p className="mt-2">{result.lines.find((line) => line.caution)?.caution}</p>
            </div>
          )}

          <p className="text-xs text-stone-500 leading-relaxed">{result.generalNote}</p>
        </section>
      )}
    </div>
  );
}
