"use client";

import { useMemo, useState } from "react";
import { estimateIndividualResidentTax } from "@/lib/tax/individualResidentTaxEstimate";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";
const yen = new Intl.NumberFormat("ja-JP");

/**
 * 個人住民税（道府県民税・市町村民税）概算試算フォーム。
 *
 * 所得税の課税所得金額（およびオプションでふるさと納税等の年間寄附金額）を入力すると、
 * estimateIndividualResidentTax（純粋関数、estimate.tsに依存しない自己完結モジュール）を
 * 呼び出し、所得割・均等割の内訳と翌年度に課税される見込みの住民税額の合計を表示する。
 *
 * このコンポーネントはフォーム状態の管理と結果表示のみを担い、特定の節税手法を推奨する
 * 表現は用いない（税理士法上の個別税務相談に該当しないため、あくまで概算の提示に留める）。
 */
export function ResidentTaxEstimateForm() {
  const [taxableIncome, setTaxableIncome] = useState("4000000");
  const [furusatoNozeiDonationAmount, setFurusatoNozeiDonationAmount] = useState("0");

  const { result, error } = useMemo(() => {
    try {
      const r = estimateIndividualResidentTax({
        taxableIncome: Number(taxableIncome),
        furusatoNozeiDonationAmount: Number(furusatoNozeiDonationAmount),
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [taxableIncome, furusatoNozeiDonationAmount]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="resident-tax-taxable-income">
            所得税の課税所得金額（円）
          </label>
          <input
            id="resident-tax-taxable-income"
            type="number"
            min="0"
            value={taxableIncome}
            onChange={(e) => setTaxableIncome(e.target.value)}
            placeholder="例：4000000"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-1">
            確定申告書における「課税される所得金額」を入力してください。住民税独自の所得控除額（基礎控除43万円等）による再計算は行わず、この金額をそのまま住民税の課税所得金額の概算として用います。
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <label className={labelClass} htmlFor="resident-tax-donation-amount">
            ふるさと納税等の年間寄附金額（円）
          </label>
          <input
            id="resident-tax-donation-amount"
            type="number"
            min="0"
            value={furusatoNozeiDonationAmount}
            onChange={(e) => setFurusatoNozeiDonationAmount(e.target.value)}
            placeholder="例：0"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-1">
            寄附を行っていない場合は0円のままで構いません。寄附金税額控除（基本控除分＋特例控除分）を所得割額から差し引いて試算します。
          </p>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">試算結果</h2>
        {!result ? (
          <p className="text-sm text-muted-foreground">入力内容をご確認ください。</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border border-border bg-foreground text-background rounded-lg p-4">
              <div className="text-xs text-stone-300 mb-1">翌年度の個人住民税額（見込み・概算）</div>
              <div className="text-3xl font-semibold">{yen.format(result.totalEstimatedResidentTax)}円</div>
              <div className="text-xs text-muted-foreground mt-1">
                所得割 {yen.format(result.incomeLevy.afterCredit)}円 ＋ 均等割 {yen.format(result.perCapitaLevy.total)}円
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border border-emerald-400 bg-emerald-50 rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">所得割額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.incomeLevy.afterCredit)}円</div>
                <div className="text-xs text-muted-foreground mt-1">
                  税額控除前 {yen.format(result.incomeLevy.beforeCredit)}円（道府県民税4%＋市町村民税6%）
                </div>
                {result.incomeLevy.donationCredit.total > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    寄附金税額控除 −{yen.format(result.incomeLevy.donationCredit.total)}円
                  </div>
                )}
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">均等割額</div>
                <div className="text-2xl font-semibold">{yen.format(result.perCapitaLevy.total)}円</div>
                <div className="text-xs text-muted-foreground mt-1">道府県民税＋市町村民税＋森林環境税の標準額</div>
              </div>
            </div>

            <div className="border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">項目</th>
                    <th className="px-3 py-2 font-normal">金額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">道府県民税所得割（課税所得×4%）</td>
                    <td className="px-3 py-2">{yen.format(result.incomeLevy.prefectural)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">市町村民税所得割（課税所得×6%）</td>
                    <td className="px-3 py-2">{yen.format(result.incomeLevy.municipal)}円</td>
                  </tr>
                  {result.incomeLevy.donationCredit.total > 0 && (
                    <>
                      <tr className="border-b border-border/60">
                        <td className="px-3 py-2 whitespace-nowrap">寄附金税額控除（基本控除分）</td>
                        <td className="px-3 py-2">−{yen.format(result.incomeLevy.donationCredit.basic)}円</td>
                      </tr>
                      <tr className="border-b border-border/60">
                        <td className="px-3 py-2 whitespace-nowrap">寄附金税額控除（特例控除分）</td>
                        <td className="px-3 py-2">−{yen.format(result.incomeLevy.donationCredit.special)}円</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-b border-stone-100 font-semibold">
                    <td className="px-3 py-2 whitespace-nowrap">所得割額（100円未満切り捨て後）</td>
                    <td className="px-3 py-2">{yen.format(result.incomeLevy.afterCredit)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">道府県民税均等割</td>
                    <td className="px-3 py-2">{yen.format(result.perCapitaLevy.prefectural)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">市町村民税均等割</td>
                    <td className="px-3 py-2">{yen.format(result.perCapitaLevy.municipal)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">森林環境税</td>
                    <td className="px-3 py-2">{yen.format(result.perCapitaLevy.forestEnvironmentTax)}円</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-3 py-2 whitespace-nowrap">合計見込み住民税額</td>
                    <td className="px-3 py-2">{yen.format(result.totalEstimatedResidentTax)}円</td>
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
        )}
      </section>
    </div>
  );
}
