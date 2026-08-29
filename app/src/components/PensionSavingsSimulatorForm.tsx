"use client";

import { useMemo, useState } from "react";
import {
  IDECO_SOLE_PROPRIETOR_ANNUAL_CAP,
  SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP,
  simulatePensionSavings,
} from "@/lib/tax/pensionSavingsSimulator";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";
const yen = new Intl.NumberFormat("ja-JP");

/**
 * 小規模企業共済・iDeCo 掛金シミュレーター。
 *
 * 控除前の課税所得と、小規模企業共済・iDeCoそれぞれの年間想定拠出額（スライダー＋数値入力）を
 * 入力すると、小規模企業共済等掛金控除による所得税・住民税の減少額の概算を表示する。
 * 計算自体は simulatePensionSavings（純粋関数、estimate.tsに依存しない自己完結モジュール）に
 * 委譲し、このコンポーネントはフォーム状態の管理と結果表示のみを担う。
 *
 * 「仮にこれだけ拠出したら税額はどう変わるか」という一般的なシミュレーションの提示に留め、
 * 特定の掛金額での拠出を推奨する表現は用いない（税理士法上の個別税務相談に該当しないため）。
 */
export function PensionSavingsSimulatorForm() {
  const [taxableIncome, setTaxableIncome] = useState("5000000");
  const [mutualAidContribution, setMutualAidContribution] = useState("420000");
  const [idecoContribution, setIdecoContribution] = useState("240000");

  const { result, error } = useMemo(() => {
    try {
      const r = simulatePensionSavings({
        taxableIncomeBeforeDeduction: Number(taxableIncome),
        smallBusinessMutualAidAnnualContribution: Number(mutualAidContribution),
        idecoAnnualContribution: Number(idecoContribution),
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [taxableIncome, mutualAidContribution, idecoContribution]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="pension-taxable-income">
            控除前の課税所得（円）
          </label>
          <input
            id="pension-taxable-income"
            type="number"
            min="0"
            value={taxableIncome}
            onChange={(e) => setTaxableIncome(e.target.value)}
            placeholder="例：5000000"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-1">
            青色申告特別控除・基礎控除・社会保険料控除など、他の所得控除をすべて適用した後の課税所得の見込みを入力してください。
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className={labelClass} htmlFor="pension-mutual-aid">
              小規模企業共済の年間想定拠出額（円）
            </label>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              上限 {yen.format(SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP)}円/年
            </span>
          </div>
          <input
            id="pension-mutual-aid-range"
            type="range"
            min="0"
            max={SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP}
            step="1000"
            value={Math.min(Number(mutualAidContribution) || 0, SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP)}
            onChange={(e) => setMutualAidContribution(e.target.value)}
            className="w-full accent-accent"
            aria-labelledby="pension-mutual-aid"
          />
          <input
            id="pension-mutual-aid"
            type="number"
            min="0"
            value={mutualAidContribution}
            onChange={(e) => setMutualAidContribution(e.target.value)}
            placeholder="例：420000"
            className={`${inputClass} mt-2`}
          />
          <p className="text-xs text-muted-foreground mt-1">月額1,000円〜70,000円（500円単位）の範囲で加入できます。</p>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className={labelClass} htmlFor="pension-ideco">
              iDeCoの年間想定拠出額（円）
            </label>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              上限（第1号被保険者目安）{yen.format(IDECO_SOLE_PROPRIETOR_ANNUAL_CAP)}円/年
            </span>
          </div>
          <input
            id="pension-ideco-range"
            type="range"
            min="0"
            max={IDECO_SOLE_PROPRIETOR_ANNUAL_CAP}
            step="1000"
            value={Math.min(Number(idecoContribution) || 0, IDECO_SOLE_PROPRIETOR_ANNUAL_CAP)}
            onChange={(e) => setIdecoContribution(e.target.value)}
            className="w-full accent-accent"
            aria-labelledby="pension-ideco"
          />
          <input
            id="pension-ideco"
            type="number"
            min="0"
            value={idecoContribution}
            onChange={(e) => setIdecoContribution(e.target.value)}
            placeholder="例：240000"
            className={`${inputClass} mt-2`}
          />
          <p className="text-xs text-muted-foreground mt-1">
            上限は国民年金の加入状況（国民年金基金・付加保険料との合算枠）により異なります。ここでは、自営業者（第1号被保険者）で他の年金制度に加入していない場合の目安を用いています。
          </p>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">試算結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            {result.capWarnings.length > 0 && (
              <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800 flex flex-col gap-1">
                {result.capWarnings.map((w) => (
                  <p key={w} className="leading-relaxed">
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="border border-border bg-surface rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">拠出前の課税所得が該当する所得税の限界税率</div>
              <div className="text-2xl font-semibold">{result.marginalBracket.ratePercent}%</div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="border border-emerald-400 bg-emerald-50 rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">所得税の減少額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.incomeTaxReduction)}円</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {yen.format(result.incomeTaxBefore)}円 → {yen.format(result.incomeTaxAfter)}円
                </div>
              </div>
              <div className="border border-emerald-400 bg-emerald-50 rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">住民税の減少額（概算・標準税率10%換算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.residentTaxReduction)}円</div>
              </div>
              <div className="border border-border bg-foreground text-background rounded-lg p-4">
                <div className="text-xs text-stone-300 mb-1">合計の節税額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.totalTaxReduction)}円</div>
                <div className="text-xs text-muted-foreground mt-1">
                  実質割引率の目安：拠出額の約{(result.effectiveDiscountRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">項目</th>
                    <th className="px-3 py-2 font-normal">入力した拠出額</th>
                    <th className="px-3 py-2 font-normal">控除対象額（上限適用後）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">小規模企業共済</td>
                    <td className="px-3 py-2">{yen.format(result.requestedContribution.smallBusinessMutualAid)}円</td>
                    <td className="px-3 py-2">{yen.format(result.deductibleContribution.smallBusinessMutualAid)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">iDeCo</td>
                    <td className="px-3 py-2">{yen.format(result.requestedContribution.ideco)}円</td>
                    <td className="px-3 py-2">{yen.format(result.deductibleContribution.ideco)}円</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-3 py-2 whitespace-nowrap">合計</td>
                    <td className="px-3 py-2">{yen.format(result.requestedContribution.total)}円</td>
                    <td className="px-3 py-2">{yen.format(result.deductibleContribution.total)}円</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-foreground">前提・注意事項</h3>
              <ul className="text-xs text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
                {result.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-amber-700 leading-relaxed">{result.disclaimer}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">入力内容をご確認ください。</p>
        )}
      </section>
    </div>
  );
}
