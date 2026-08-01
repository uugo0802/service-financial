"use client";

import { useMemo, useState } from "react";
import {
  HOUSING_LOAN_DEDUCTION_RATE,
  HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP,
  calculateHousingLoanDeduction,
} from "@/lib/tax/housingLoanDeduction";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";
const yen = new Intl.NumberFormat("ja-JP");

/**
 * 住宅ローン控除（住宅借入金等特別控除）シミュレーター。
 *
 * 年末時点の住宅ローン残高を入力すると、控除率0.7%（現行率）と簡易的に仮定した
 * 借入限度額（省エネ基準適合住宅・3,000万円相当）に基づく、その年分の税額控除額の
 * 概算を表示する。計算自体は calculateHousingLoanDeduction（純粋関数、estimate.tsに
 * 依存しない自己完結モジュール）に委譲し、このコンポーネントはフォーム状態の管理と
 * 結果表示のみを担う。
 *
 * 実際の借入限度額は住宅の種類（認定住宅・ZEH水準省エネ住宅・既存住宅等）によって
 * 異なるため、「詳細設定」で借入限度額（延いては上限額）を上書きできるようにしている。
 * 特定の住宅の適否判断や税務上の助言は行わない（税理士法上の個別税務相談に該当しないため）。
 */
export function HousingLoanDeductionForm() {
  const [yearEndLoanBalance, setYearEndLoanBalance] = useState("25000000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loanBalanceCapInput, setLoanBalanceCapInput] = useState(
    String(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP)
  );

  const { result, error } = useMemo(() => {
    try {
      const balance = Number(yearEndLoanBalance);
      const loanBalanceCap = showAdvanced ? Number(loanBalanceCapInput) : undefined;
      const annualCreditCap =
        loanBalanceCap !== undefined && Number.isFinite(loanBalanceCap)
          ? Math.floor((loanBalanceCap * HOUSING_LOAN_DEDUCTION_RATE) / 100) * 100
          : undefined;

      const r = calculateHousingLoanDeduction({
        yearEndLoanBalance: balance,
        ...(annualCreditCap !== undefined ? { annualCreditCap } : {}),
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [yearEndLoanBalance, showAdvanced, loanBalanceCapInput]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="housing-loan-balance">
            年末時点の住宅ローン残高（円）
          </label>
          <input
            id="housing-loan-balance"
            type="number"
            min="0"
            value={yearEndLoanBalance}
            onChange={(e) => setYearEndLoanBalance(e.target.value)}
            placeholder="例：25000000"
            className={inputClass}
          />
          <p className="text-xs text-stone-500 mt-1">
            住宅ローンを提供している金融機関から発行される「住宅取得資金に係る借入金の年末残高等証明書」に記載の金額を入力してください。連帯債務の場合は、ご自身の負担割合分の残高を入力する想定です。
          </p>
        </div>

        <div className="border-t border-stone-200 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-stone-600 underline underline-offset-2"
          >
            {showAdvanced ? "詳細設定を閉じる" : "詳細設定（借入限度額を変更する）"}
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <label className={labelClass} htmlFor="housing-loan-cap">
                借入限度額（円） — 住宅の種類に応じて変更
              </label>
              <input
                id="housing-loan-cap"
                type="number"
                min="0"
                value={loanBalanceCapInput}
                onChange={(e) => setLoanBalanceCapInput(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-stone-500 mt-1">
                既定値は「省エネ基準適合住宅（新築）」の一般区分（
                {yen.format(HOUSING_LOAN_DEDUCTION_SIMPLIFIED_LOAN_BALANCE_CAP)}円）です。認定長期優良住宅・ZEH水準省エネ住宅（子育て世帯・若者夫婦世帯を含む）は最大5,000万円、既存住宅（中古）は原則2,000万円など、実際の区分に応じた借入限度額に置き換えてください。判断に迷う場合は税理士等の専門家にご確認ください。
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">試算結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            {result.cappedByLimit && (
              <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800 leading-relaxed">
                年末残高×控除率（{yen.format(result.rawAnnualCredit)}円）が、この試算で用いた1年あたりの上限（
                {yen.format(result.annualCreditCap)}円）を超えているため、控除額は上限でキャップして試算しています。
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="border border-stone-300 bg-white rounded-lg p-4">
                <div className="text-xs text-stone-500 mb-1">控除率</div>
                <div className="text-2xl font-semibold">{(result.creditRate * 100).toFixed(2)}%</div>
              </div>
              <div className="border border-stone-300 bg-white rounded-lg p-4">
                <div className="text-xs text-stone-500 mb-1">上限適用前の控除額</div>
                <div className="text-2xl font-semibold">{yen.format(result.rawAnnualCredit)}円</div>
              </div>
              <div className="border border-stone-700 bg-stone-800 text-white rounded-lg p-4">
                <div className="text-xs text-stone-300 mb-1">その年の税額控除見込み額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.estimatedAnnualCredit)}円</div>
                <div className="text-xs text-stone-300 mt-1">上限 {yen.format(result.annualCreditCap)}円/年</div>
              </div>
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
