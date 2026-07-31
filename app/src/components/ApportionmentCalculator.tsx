"use client";

import { useMemo, useState } from "react";
import {
  ApportionmentBasis,
  DEFAULT_TOTAL_HOURS_PER_WEEK,
  calculateApportionment,
} from "@/lib/tax/apportionment";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

/**
 * 家事按分（家事関連費按分）計算フォーム。
 *
 * 家賃・水道光熱費・通信費などの総額と、按分基準（床面積 or 使用時間）に基づく
 * 事業使用割合を入力すると、必要経費となる金額（円未満切り捨て）を表示する。
 * 計算自体はcalculateApportionment（純粋関数）に委譲し、このコンポーネントは
 * フォーム状態の管理と結果表示のみを担う。
 *
 * どの按分基準・比率が「合理的」かはこのツールでは判定しない
 * （常にAPPORTIONMENT_DISCLAIMERを併記し、判断は利用者・税理士に委ねる）。
 */
export function ApportionmentCalculator() {
  const [basis, setBasis] = useState<ApportionmentBasis>("floorArea");
  const [totalAmount, setTotalAmount] = useState("");

  const [businessAreaSqm, setBusinessAreaSqm] = useState("");
  const [totalAreaSqm, setTotalAreaSqm] = useState("");

  const [businessHoursPerWeek, setBusinessHoursPerWeek] = useState("");
  const [totalHoursPerWeek, setTotalHoursPerWeek] = useState("");

  const { result, error } = useMemo(() => {
    const amount = Number(totalAmount);
    if (totalAmount.trim() === "" || !Number.isFinite(amount)) {
      return { result: null, error: null };
    }

    try {
      if (basis === "floorArea") {
        if (businessAreaSqm.trim() === "" || totalAreaSqm.trim() === "") {
          return { result: null, error: null };
        }
        return {
          result: calculateApportionment({
            totalAmount: amount,
            basisInput: {
              basis: "floorArea",
              businessAreaSqm: Number(businessAreaSqm),
              totalAreaSqm: Number(totalAreaSqm),
            },
          }),
          error: null,
        };
      }

      if (businessHoursPerWeek.trim() === "") {
        return { result: null, error: null };
      }
      return {
        result: calculateApportionment({
          totalAmount: amount,
          basisInput: {
            basis: "time",
            businessHoursPerWeek: Number(businessHoursPerWeek),
            totalHoursPerWeek: totalHoursPerWeek.trim() === "" ? undefined : Number(totalHoursPerWeek),
          },
        }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [basis, totalAmount, businessAreaSqm, totalAreaSqm, businessHoursPerWeek, totalHoursPerWeek]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-lg font-semibold mb-3">按分の基準</h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="apportionment-basis"
              checked={basis === "floorArea"}
              onChange={() => setBasis("floorArea")}
            />
            床面積按分
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="apportionment-basis"
              checked={basis === "time"}
              onChange={() => setBasis("time")}
            />
            使用時間按分
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="apportionment-total-amount">家事関連費の総額（円）</label>
          <input
            id="apportionment-total-amount"
            type="number"
            min="0"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="例：120000（家賃・水道光熱費・通信費 等）"
            className={inputClass}
          />
        </div>

        {basis === "floorArea" ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="apportionment-business-area-sqm">事業使用部分の床面積（m²）</label>
              <input
                id="apportionment-business-area-sqm"
                type="number"
                min="0"
                step="any"
                value={businessAreaSqm}
                onChange={(e) => setBusinessAreaSqm(e.target.value)}
                placeholder="例：15"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="apportionment-total-area-sqm">住居全体の床面積（m²）</label>
              <input
                id="apportionment-total-area-sqm"
                type="number"
                min="0"
                step="any"
                value={totalAreaSqm}
                onChange={(e) => setTotalAreaSqm(e.target.value)}
                placeholder="例：50"
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="apportionment-business-hours-per-week">1週間あたりの事業使用時間（時間）</label>
              <input
                id="apportionment-business-hours-per-week"
                type="number"
                min="0"
                step="any"
                value={businessHoursPerWeek}
                onChange={(e) => setBusinessHoursPerWeek(e.target.value)}
                placeholder="例：40"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="apportionment-total-hours-per-week">
                1週間の総時間（未入力の場合は{DEFAULT_TOTAL_HOURS_PER_WEEK}時間＝24時間×7日）
              </label>
              <input
                id="apportionment-total-hours-per-week"
                type="number"
                min="0"
                step="any"
                value={totalHoursPerWeek}
                onChange={(e) => setTotalHoursPerWeek(e.target.value)}
                placeholder={`例：${DEFAULT_TOTAL_HOURS_PER_WEEK}`}
                className={inputClass}
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">計算結果</h2>
        {result ? (
          <div className="border border-stone-300 bg-white p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm text-stone-600">
              <span>事業使用割合</span>
              <span className="tabular-nums">{percent.format(result.businessUseRatioPercent)}%</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>必要経費となる金額</span>
              <span className="tabular-nums">{yen.format(result.deductibleAmount)}円</span>
            </div>
            <p className="text-xs text-stone-400">{result.basisDescription}</p>
          </div>
        ) : (
          <p className="text-sm text-stone-500">総額と按分基準の値を入力すると、必要経費となる金額を計算します。</p>
        )}
        <p className="mt-3 text-xs text-amber-700 leading-relaxed">
          {result ? result.disclaimer : "床面積・使用時間などの按分基準が事業の実態に照らして合理的かどうかは、納税者ご自身（または税理士等の専門家）の判断事項です。このツールは入力された基準・比率に基づく機械的な計算結果を示すのみであり、税務代理・個別具体的な税務相談には該当しません。"}
        </p>
      </section>
    </div>
  );
}
