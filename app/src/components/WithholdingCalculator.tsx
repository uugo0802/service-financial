"use client";

import { useMemo, useState } from "react";
import { calculateMonthlyWithholding } from "@/lib/payroll/withholding";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";

/**
 * 月額の役員報酬・給与から、源泉徴収税額（月額表・甲欄の近似）と差引支給額を
 * 計算するフォーム。
 *
 * 計算自体はcalculateMonthlyWithholding（純粋関数）に委譲し、このコンポーネントは
 * フォーム状態の管理と結果表示のみを担う。ブラケット近似式であることや
 * 復興特別所得税の織り込み・年末調整対象外である旨は、常にassumptionsとして
 * 併記する（判定・助言は行わない）。
 */
export function WithholdingCalculator() {
  const [monthlyGrossCompensation, setMonthlyGrossCompensation] = useState("");
  const [dependentCount, setDependentCount] = useState("0");
  const [insurancePremium, setInsurancePremium] = useState("");

  const { result, error } = useMemo(() => {
    if (monthlyGrossCompensation.trim() === "") {
      return { result: null, error: null };
    }

    const gross = Number(monthlyGrossCompensation);
    const dependents = dependentCount.trim() === "" ? 0 : Number(dependentCount);
    const insurance = insurancePremium.trim() === "" ? 0 : Number(insurancePremium);

    try {
      return {
        result: calculateMonthlyWithholding({
          monthlyGrossCompensation: gross,
          dependentCount: dependents,
          insurancePremium: insurance,
        }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [monthlyGrossCompensation, dependentCount, insurancePremium]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="monthly-gross-compensation">
            月額の役員報酬・給与（総支給額、円）
          </label>
          <input
            id="monthly-gross-compensation"
            type="number"
            min="0"
            value={monthlyGrossCompensation}
            onChange={(e) => setMonthlyGrossCompensation(e.target.value)}
            placeholder="例：300000"
            className={inputClass}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="withholding-dependent-count">
              扶養親族等の数（甲欄、0〜7人以上）
            </label>
            <input
              id="withholding-dependent-count"
              type="number"
              min="0"
              step="1"
              value={dependentCount}
              onChange={(e) => setDependentCount(e.target.value)}
              placeholder="例：0"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="withholding-insurance-premium">
              その月の社会保険料（健康保険・厚生年金等、円）
            </label>
            <input
              id="withholding-insurance-premium"
              type="number"
              min="0"
              value={insurancePremium}
              onChange={(e) => setInsurancePremium(e.target.value)}
              placeholder="例：44000"
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
              <span>社会保険料等控除後の金額（課税ベース）</span>
              <span className="tabular-nums">{yen.format(result.taxableBase)}円</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>扶養控除相当の概算控除額</span>
              <span className="tabular-nums">{yen.format(result.dependentDeductionApplied)}円</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>源泉徴収税額（概算・月額）</span>
              <span className="tabular-nums">{yen.format(result.withholdingTax)}円</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
              <span>差引支給額（概算）</span>
              <span className="tabular-nums">{yen.format(result.netPay)}円</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            月額の役員報酬・給与を入力すると、源泉徴収税額（概算）と差引支給額を計算します。
          </p>
        )}

        <ul className="mt-3 text-xs text-amber-700 leading-relaxed list-disc list-inside space-y-1">
          {(
            result?.assumptions ?? [
              "国税庁公表の「給与所得の源泉徴収税額表（月額表）」甲欄を、区分ごとの速算式で近似した概算値を表示します。実額とは数百円〜数千円程度ずれる場合があります。",
              "このツールは源泉徴収税額の目安を示す試算であり、税務代理・税務書類の作成・個別具体的な税務相談には該当しません。実際の源泉徴収・納付にあたっては必ず国税庁公表の最新の税額表をご確認ください。",
            ]
          ).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
