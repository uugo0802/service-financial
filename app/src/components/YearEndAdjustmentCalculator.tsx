"use client";

import { useMemo, useState } from "react";
import { calculateYearEndAdjustment } from "@/lib/payroll/yearEndAdjustment";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const OUTCOME_LABEL: Record<string, string> = {
  shortfall: "徴収不足（追加で徴収・納付が必要）",
  refund: "過納（本人へ還付すべき金額）",
  exact: "過不足なし",
};

/**
 * 年間の給与等の総支給額・社会保険料・扶養親族等の数・その年にすでに源泉徴収した
 * 税額の合計から、年末調整による過不足額（徴収不足額 または 過納還付額）の概算値を
 * 計算するフォーム。
 *
 * 計算自体はcalculateYearEndAdjustment（純粋関数）に委譲し、このコンポーネントは
 * フォーム状態の管理と結果表示のみを担う。生命保険料控除・住宅ローン控除・
 * ふるさと納税等が対象外であることや、正式な年末調整処理を代行するものではない旨は、
 * 常にassumptionsとして併記する（判定・助言は行わない）。
 */
export function YearEndAdjustmentCalculator() {
  const [annualGrossCompensation, setAnnualGrossCompensation] = useState("");
  const [annualSocialInsurancePremium, setAnnualSocialInsurancePremium] = useState("");
  const [dependentCount, setDependentCount] = useState("0");
  const [monthlyWithholdingTotal, setMonthlyWithholdingTotal] = useState("");

  const { result, error } = useMemo(() => {
    if (annualGrossCompensation.trim() === "") {
      return { result: null, error: null };
    }

    const gross = Number(annualGrossCompensation);
    const insurance = annualSocialInsurancePremium.trim() === "" ? 0 : Number(annualSocialInsurancePremium);
    const dependents = dependentCount.trim() === "" ? 0 : Number(dependentCount);
    const withheld = monthlyWithholdingTotal.trim() === "" ? 0 : Number(monthlyWithholdingTotal);

    try {
      return {
        result: calculateYearEndAdjustment({
          annualGrossCompensation: gross,
          annualSocialInsurancePremium: insurance,
          dependentCount: dependents,
          monthlyWithholdingTotal: withheld,
        }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [annualGrossCompensation, annualSocialInsurancePremium, dependentCount, monthlyWithholdingTotal]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass}>年間の給与等の総支給額（月々の役員報酬・給与＋賞与の合計、円）</label>
          <input
            type="number"
            min="0"
            value={annualGrossCompensation}
            onChange={(e) => setAnnualGrossCompensation(e.target.value)}
            placeholder="例：4000000"
            className={inputClass}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>年間の社会保険料（健康保険・厚生年金等の合計、円）</label>
            <input
              type="number"
              min="0"
              value={annualSocialInsurancePremium}
              onChange={(e) => setAnnualSocialInsurancePremium(e.target.value)}
              placeholder="例：550000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>扶養親族等の数（0〜7人以上）</label>
            <input
              type="number"
              min="0"
              step="1"
              value={dependentCount}
              onChange={(e) => setDependentCount(e.target.value)}
              placeholder="例：0"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            その年にすでに源泉徴収した所得税額の合計（月々の給与・賞与分、円）
          </label>
          <input
            type="number"
            min="0"
            value={monthlyWithholdingTotal}
            onChange={(e) => setMonthlyWithholdingTotal(e.target.value)}
            placeholder="例：132000"
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">計算結果</h2>
        {result ? (
          <div className="border border-stone-300 bg-white p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm text-stone-600">
              <span>給与所得控除</span>
              <span className="tabular-nums">{yen.format(result.salaryIncomeDeduction)}円</span>
            </div>
            <div className="flex justify-between text-sm text-stone-600">
              <span>給与所得</span>
              <span className="tabular-nums">{yen.format(result.salaryIncome)}円</span>
            </div>
            <div className="flex justify-between text-sm text-stone-600">
              <span>基礎控除・扶養控除（概算）</span>
              <span className="tabular-nums">
                {yen.format(result.basicDeduction + result.dependentDeduction)}円
              </span>
            </div>
            <div className="flex justify-between text-sm text-stone-600">
              <span>課税所得（概算）</span>
              <span className="tabular-nums">{yen.format(result.taxableIncome)}円</span>
            </div>
            <div className="flex justify-between text-sm text-stone-600 border-t border-stone-200 pt-2">
              <span>年間の所得税・復興特別所得税額（概算）</span>
              <span className="tabular-nums">{yen.format(result.totalAnnualTaxDue)}円</span>
            </div>
            <div className="flex justify-between text-sm text-stone-600">
              <span>その年にすでに源泉徴収した税額の合計</span>
              <span className="tabular-nums">{yen.format(result.alreadyWithheld)}円</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-stone-200 pt-2">
              <span>年末調整による差額（概算）</span>
              <span className="tabular-nums">
                {yen.format(Math.abs(result.difference))}円（{OUTCOME_LABEL[result.outcome]}）
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            年間の給与等の総支給額を入力すると、年末調整による過不足額（概算）を計算します。
          </p>
        )}

        <ul className="mt-3 text-xs text-amber-700 leading-relaxed list-disc list-inside space-y-1">
          {(
            result?.assumptions ?? [
              "給与所得控除・社会保険料控除・基礎控除・扶養控除（一律近似）のみを反映した概算シミュレーションです。生命保険料控除・住宅ローン控除・ふるさと納税・医療費控除・小規模企業共済等掛金控除は対象外です。",
              "この計算結果は年末調整の概算シミュレーションであり、法定調書（源泉徴収票等）の作成・提出や実際の過不足額の清算処理を代行するものではありません。税務代理・税務書類の作成・個別具体的な税務相談にも該当しません。",
              "正式な年末調整の実施にあたっては、必ず国税庁公表の最新の資料を確認し、必要に応じて税理士等の専門家にご相談ください。",
            ]
          ).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
