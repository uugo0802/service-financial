"use client";

import { useMemo, useState } from "react";
import { simulateFurusatoNozei, type FurusatoNozeiEntityType } from "@/lib/tax/furusatoNozeiSimulator";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";
const yen = new Intl.NumberFormat("ja-JP");

/**
 * ふるさと納税 自己負担2,000円 年間寄附上限額シミュレーター。
 *
 * 事業形態（個人 or マイクロ法人）、所得税の課税所得金額、配偶者控除・扶養親族の適用状況を
 * 入力すると、simulateFurusatoNozei（純粋関数、estimate.tsに依存しない自己完結モジュール）を
 * 呼び出し、自己負担が2,000円のままで済む年間寄附額の上限の目安を表示する。
 *
 * このコンポーネントはフォーム状態の管理と結果表示のみを担い、特定の寄附額を推奨する
 * 表現は用いない（税理士法上の個別税務相談に該当しないため、あくまで目安の提示に留める）。
 */
export function FurusatoNozeiSimulatorForm() {
  const [entityType, setEntityType] = useState<FurusatoNozeiEntityType>("individual");
  const [taxableIncome, setTaxableIncome] = useState("4000000");
  const [hasSpouseDeduction, setHasSpouseDeduction] = useState(false);
  const [generalDependentCount, setGeneralDependentCount] = useState("0");
  const [specifiedDependentCount, setSpecifiedDependentCount] = useState("0");
  const [elderlyDependentCount, setElderlyDependentCount] = useState("0");

  const { result, error } = useMemo(() => {
    try {
      const r = simulateFurusatoNozei({
        entityType,
        taxableIncome: Number(taxableIncome),
        dependents: {
          hasSpouseDeduction,
          generalDependentCount: Number(generalDependentCount),
          specifiedDependentCount: Number(specifiedDependentCount),
          elderlyDependentCount: Number(elderlyDependentCount),
        },
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [entityType, taxableIncome, hasSpouseDeduction, generalDependentCount, specifiedDependentCount, elderlyDependentCount]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="furusato-entity-type">
            事業形態
          </label>
          <select
            id="furusato-entity-type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as FurusatoNozeiEntityType)}
            className={inputClass}
          >
            <option value="individual">個人（フリーランス・給与所得者等）</option>
            <option value="corporation">マイクロ法人（法人）</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            ふるさと納税の自己負担2,000円の特例控除制度は個人向けの制度です。法人を選択した場合は試算を行いません。
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <label className={labelClass} htmlFor="furusato-taxable-income">
            所得税の課税所得金額（円）
          </label>
          <input
            id="furusato-taxable-income"
            type="number"
            min="0"
            value={taxableIncome}
            onChange={(e) => setTaxableIncome(e.target.value)}
            placeholder="例：4000000"
            className={inputClass}
            disabled={entityType === "corporation"}
          />
          <p className="text-xs text-muted-foreground mt-1">
            社会保険料控除・基礎控除・配偶者控除・扶養控除など、適用可能な所得控除をすべて差し引いた後の金額（このふるさと納税分の寄附金控除を適用する前の金額）を入力してください。
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-xs text-muted-foreground mb-2">配偶者控除・扶養親族の適用状況</div>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={hasSpouseDeduction}
              onChange={(e) => setHasSpouseDeduction(e.target.checked)}
              disabled={entityType === "corporation"}
              className="accent-stone-700"
            />
            控除対象配偶者（一般の配偶者控除）がいる
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="furusato-general-dependent">
                一般の扶養親族（人）
              </label>
              <input
                id="furusato-general-dependent"
                type="number"
                min="0"
                step="1"
                value={generalDependentCount}
                onChange={(e) => setGeneralDependentCount(e.target.value)}
                className={inputClass}
                disabled={entityType === "corporation"}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="furusato-specified-dependent">
                特定扶養親族（19〜22歳、人）
              </label>
              <input
                id="furusato-specified-dependent"
                type="number"
                min="0"
                step="1"
                value={specifiedDependentCount}
                onChange={(e) => setSpecifiedDependentCount(e.target.value)}
                className={inputClass}
                disabled={entityType === "corporation"}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="furusato-elderly-dependent">
                老人扶養親族（70歳以上・別居、人）
              </label>
              <input
                id="furusato-elderly-dependent"
                type="number"
                min="0"
                step="1"
                value={elderlyDependentCount}
                onChange={(e) => setElderlyDependentCount(e.target.value)}
                className={inputClass}
                disabled={entityType === "corporation"}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            所得税と住民税とで控除額が異なる（住民税の方が小さい）ことによる調整分の概算に用います。同居老親等・障害者控除等、他の人的控除は考慮していません。
          </p>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">試算結果</h2>
        {!result ? (
          <p className="text-sm text-muted-foreground">入力内容をご確認ください。</p>
        ) : !result.isApplicable ? (
          <div className="border border-amber-400 bg-amber-50 rounded p-4 text-sm text-amber-800 leading-relaxed">
            {result.notApplicableReason}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border border-border bg-foreground text-background rounded-lg p-4">
              <div className="text-xs text-stone-300 mb-1">自己負担2,000円のままで済む年間寄附上限額（目安）</div>
              <div className="text-3xl font-semibold">{yen.format(result.donationCeiling)}円</div>
              <div className="text-xs text-muted-foreground mt-1">自己負担額：{yen.format(result.selfPayAmount)}円</div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">所得税の限界税率</div>
                <div className="text-2xl font-semibold">{result.marginalIncomeTaxBracket.ratePercent}%</div>
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">住民税の課税総所得金額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.residentTaxTaxableIncomeApprox)}円</div>
              </div>
              <div className="border border-emerald-400 bg-emerald-50 rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">住民税所得割額（概算）</div>
                <div className="text-2xl font-semibold">{yen.format(result.residentTaxIncomeLevyApprox)}円</div>
                <div className="text-xs text-muted-foreground mt-1">調整控除概算：{yen.format(result.adjustmentDeductionApprox)}円</div>
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
                    <td className="px-3 py-2 whitespace-nowrap">所得税の課税所得金額（入力値）</td>
                    <td className="px-3 py-2">{yen.format(result.taxableIncome)}円</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">人的控除差の合計（基礎控除分含む）</td>
                    <td className="px-3 py-2">{yen.format(result.personalDeductionGapTotal)}円</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-3 py-2 whitespace-nowrap">寄附上限額の目安</td>
                    <td className="px-3 py-2">{yen.format(result.donationCeiling)}円</td>
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
