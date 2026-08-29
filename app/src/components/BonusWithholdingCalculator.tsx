"use client";

import { useMemo, useState } from "react";
import { calculateBonusWithholding } from "@/lib/payroll/bonusWithholding";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";

/**
 * 賞与（ボーナス）の総支給額から、源泉徴収税額（賞与に対する源泉徴収税額表・甲欄の
 * 近似）と差引支給額を計算するフォーム。
 *
 * 計算自体はcalculateBonusWithholding（純粋関数）に委譲し、このコンポーネントは
 * フォーム状態の管理と結果表示のみを担う。ブラケット近似式であることや、前月の給与が
 * ない場合・賞与が前月の給与の10倍を超える場合など国税庁の特別な計算方法に未対応である旨は、
 * 常にassumptionsとして併記する（判定・助言は行わない）。
 */
export function BonusWithholdingCalculator() {
  const [bonusGrossAmount, setBonusGrossAmount] = useState("");
  const [bonusInsurancePremium, setBonusInsurancePremium] = useState("");
  const [previousMonthSalaryAfterInsurance, setPreviousMonthSalaryAfterInsurance] = useState("");
  const [dependentCount, setDependentCount] = useState("0");

  const { result, error } = useMemo(() => {
    if (bonusGrossAmount.trim() === "") {
      return { result: null, error: null };
    }

    const gross = Number(bonusGrossAmount);
    const insurance = bonusInsurancePremium.trim() === "" ? 0 : Number(bonusInsurancePremium);
    const previousMonth =
      previousMonthSalaryAfterInsurance.trim() === "" ? 0 : Number(previousMonthSalaryAfterInsurance);
    const dependents = dependentCount.trim() === "" ? 0 : Number(dependentCount);

    try {
      return {
        result: calculateBonusWithholding({
          bonusGrossAmount: gross,
          bonusInsurancePremium: insurance,
          previousMonthSalaryAfterInsurance: previousMonth,
          dependentCount: dependents,
        }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [bonusGrossAmount, bonusInsurancePremium, previousMonthSalaryAfterInsurance, dependentCount]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="bonus-gross-amount">
            賞与（ボーナス）の総支給額（円）
          </label>
          <input
            id="bonus-gross-amount"
            type="number"
            min="0"
            value={bonusGrossAmount}
            onChange={(e) => setBonusGrossAmount(e.target.value)}
            placeholder="例：500000"
            className={inputClass}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="bonus-insurance-premium">
              その賞与にかかる社会保険料（健康保険・厚生年金等、円）
            </label>
            <input
              id="bonus-insurance-premium"
              type="number"
              min="0"
              value={bonusInsurancePremium}
              onChange={(e) => setBonusInsurancePremium(e.target.value)}
              placeholder="例：73000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bonus-previous-month-salary">
              前月の給与等の金額（社会保険料等控除後、円）
            </label>
            <input
              id="bonus-previous-month-salary"
              type="number"
              min="0"
              value={previousMonthSalaryAfterInsurance}
              onChange={(e) => setPreviousMonthSalaryAfterInsurance(e.target.value)}
              placeholder="例：256000"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="bonus-dependent-count">
              扶養親族等の数（甲欄、0〜7人以上）
            </label>
            <input
              id="bonus-dependent-count"
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

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">計算結果</h2>
        {result ? (
          <div className="border border-border bg-surface p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>賞与の社会保険料等控除後の金額（課税ベース）</span>
              <span className="tabular-nums">{yen.format(result.bonusTaxableBase)}円</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>前月給与の扶養調整後の金額</span>
              <span className="tabular-nums">
                {yen.format(
                  Math.max(0, result.previousMonthSalaryAfterInsurance - result.dependentDeductionApplied)
                )}
                円
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>適用した税率（概算）</span>
              <span className="tabular-nums">{result.appliedRatePercent}%</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>源泉徴収税額（概算・賞与分）</span>
              <span className="tabular-nums">{yen.format(result.withholdingTax)}円</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
              <span>差引支給額（概算）</span>
              <span className="tabular-nums">{yen.format(result.netPay)}円</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            賞与の総支給額と前月の給与等の金額を入力すると、源泉徴収税額（概算）と差引支給額を計算します。
          </p>
        )}

        <ul className="mt-3 text-xs text-amber-700 leading-relaxed list-disc list-inside space-y-1">
          {(
            result?.assumptions ?? [
              "国税庁公表の「賞与に対する源泉徴収税額の算出率の表」甲欄を、前月の給与等の金額の水準に応じた区分ごとの税率で近似した概算値を表示します。実額とは数百円〜数千円程度、場合によってはそれ以上ずれることがあります。",
              "「前月の給与がない場合の計算方法」「賞与が前月の給与の10倍を超える場合の計算方法」など国税庁が定める特別な計算方法には対応していません。",
              "このツールは源泉徴収税額の目安を示す試算であり、税務代理・税務書類の作成・個別具体的な税務相談には該当しません。実際の源泉徴収・納付にあたっては必ず国税庁公表の最新の算出率の表をご確認ください。",
            ]
          ).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
