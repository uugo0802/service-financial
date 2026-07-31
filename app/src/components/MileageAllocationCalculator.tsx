"use client";

import { useId, useState } from "react";
import {
  MileageAllocationResult,
  MileageLogEntry,
  allocateVehicleExpenseByMileage,
} from "@/lib/tax/mileageAllocation";

// 走行距離（マイレージ）ベースの車両費按分 計算UI。
// 免責: 走行距離ログの記録内容や、そこから算出した按分率が妥当かどうかの
// 個別税務相談は行わない（税理士法対応）。ここでは「入力された走行距離ログから
// 事業按分率を計算し、車両費の金額に適用する」計算のみを提供する。
// ExpenseAllocationCalculator（按分率を直接入力するフロー）を置き換えるものではなく、
// 車両費に特化した「按分率の求め方」の代替入力手段。

interface LogRow {
  id: string;
  date: string;
  purpose: string;
  businessKmInput: string;
  totalKmInput: string;
}

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `mileage-row-${rowSeq}`;
}

function makeEmptyRow(): LogRow {
  return { id: nextRowId(), date: "", purpose: "", businessKmInput: "", totalKmInput: "" };
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatPercent(percent: number): string {
  // 表示は小数第1位までに丸める（内部計算自体は丸めない）
  return `${Math.round(percent * 10) / 10}%`;
}

export function MileageAllocationCalculator() {
  const [rows, setRows] = useState<LogRow[]>(() => [makeEmptyRow(), makeEmptyRow()]);
  const [amountInput, setAmountInput] = useState("");
  const [result, setResult] = useState<MileageAllocationResult | null>(null);
  const formId = useId();

  function updateRow(id: string, patch: Partial<LogRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setResult(null); // 入力を変更したら再計算するまで結果は非表示にする
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow()]);
    setResult(null);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setResult(null);
  }

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();

    const entries: MileageLogEntry[] = rows
      .filter((row) => row.businessKmInput.trim() !== "" || row.totalKmInput.trim() !== "")
      .map((row) => ({
        date: row.date,
        purpose: row.purpose,
        businessKm: Math.max(0, Number(row.businessKmInput) || 0),
        totalKm: Math.max(0, Number(row.totalKmInput) || 0),
      }));

    const amount = Math.max(0, Number(amountInput) || 0);
    setResult(allocateVehicleExpenseByMileage(entries, amount));
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleCalculate} className="flex flex-col gap-4">
        <div className="overflow-x-auto border border-stone-300">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-stone-100 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-normal">日付</th>
                <th className="px-3 py-2 font-normal">目的・摘要</th>
                <th className="px-3 py-2 font-normal">事業利用km</th>
                <th className="px-3 py-2 font-normal">総走行km</th>
                <th className="px-3 py-2 font-normal sr-only">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-stone-200">
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.id, { date: e.target.value })}
                      aria-label="走行日"
                      className="w-full border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.purpose}
                      onChange={(e) => updateRow(row.id, { purpose: e.target.value })}
                      placeholder="例: 取引先訪問"
                      aria-label="目的・摘要"
                      className="w-full border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={row.businessKmInput}
                      onChange={(e) => updateRow(row.id, { businessKmInput: e.target.value })}
                      placeholder="0"
                      aria-label="事業利用km"
                      className="w-28 border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={row.totalKmInput}
                      onChange={(e) => updateRow(row.id, { totalKmInput: e.target.value })}
                      placeholder="0"
                      aria-label="総走行km"
                      className="w-28 border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
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
            行を追加
          </button>
        </div>

        <label className="flex flex-col gap-1 max-w-xs text-sm">
          <span className="text-xs text-stone-500">車両費の年間支払額（税込・円）</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value);
              setResult(null);
            }}
            placeholder="0"
            aria-label="車両費の年間支払額"
            className="border border-stone-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-600"
          />
        </label>

        <div>
          <button
            type="submit"
            className="text-sm px-6 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700"
          >
            計算する
          </button>
        </div>
      </form>

      {result && (
        <section aria-labelledby={`${formId}-mileage-result-heading`} className="flex flex-col gap-4">
          <h3 id={`${formId}-mileage-result-heading`} className="text-sm font-semibold">
            計算結果
          </h3>

          {result.aggregate.totalKm === 0 ? (
            <p className="text-sm text-stone-500">
              総走行kmの合計が0のため、事業按分率を計算できません（0%として扱われます）。走行距離ログを入力してください。
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm max-w-md">
              <dt className="text-stone-500">事業利用km合計</dt>
              <dd>{result.aggregate.totalBusinessKm.toLocaleString("ja-JP")} km</dd>
              <dt className="text-stone-500">総走行km合計</dt>
              <dd>{result.aggregate.totalKm.toLocaleString("ja-JP")} km</dd>
              <dt className="text-stone-500">算出された事業按分率</dt>
              <dd>{formatPercent(result.aggregate.businessUsePercent)}</dd>
            </dl>
          )}

          <div className="overflow-x-auto border border-stone-300">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-stone-100 text-left text-xs text-stone-500">
                  <th className="px-3 py-2 font-normal">車両費（支払額）</th>
                  <th className="px-3 py-2 font-normal">事業経費</th>
                  <th className="px-3 py-2 font-normal">家事関連費（対象外）</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-stone-200">
                  <td className="px-3 py-2">{formatYen(result.totalAmount)}</td>
                  <td className="px-3 py-2 font-medium">{formatYen(result.businessAmount)}</td>
                  <td className="px-3 py-2 text-stone-500">{formatYen(result.personalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-stone-500 leading-relaxed">{result.generalNote}</p>
        </section>
      )}
    </div>
  );
}
