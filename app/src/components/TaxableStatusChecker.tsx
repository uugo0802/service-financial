"use client";

import { useMemo, useState } from "react";
import {
  EntityType,
  TaxableStatusRuleId,
  determineTaxableStatus,
} from "@/lib/tax/taxableStatusDetermination";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const RULE_STEP_TITLES: Record<TaxableStatusRuleId, string> = {
  basePeriod: "(a) 基準期間の課税売上高",
  newCompanyCapital: "(b) 新設法人の資本金特例",
  specifiedPeriod: "(c) 特定期間の課税売上高・給与等支払額",
  invoiceRegistration: "(d) インボイス発行事業者登録",
};

/**
 * 消費税課税事業者判定シミュレーター。
 *
 * 基準期間・特定期間の課税売上高、新設法人の資本金特例、インボイス発行事業者登録の
 * 有無を入力すると、当期が課税事業者・免税事業者のいずれになるかを、判定に使った
 * ルールを(a)〜(d)の順にステップ表示しながら計算する。計算自体は
 * determineTaxableStatus（純粋関数）に委譲し、このコンポーネントはフォーム状態の
 * 管理と結果表示のみを担う。
 */
export function TaxableStatusChecker() {
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [hasBasePeriod, setHasBasePeriod] = useState(true);
  const [baseYearTaxableSales, setBaseYearTaxableSales] = useState("0");

  const [hasSpecifiedPeriod, setHasSpecifiedPeriod] = useState(true);
  const [specifiedPeriodTaxableSales, setSpecifiedPeriodTaxableSales] = useState("0");
  const [specifiedPeriodSalaryPaid, setSpecifiedPeriodSalaryPaid] = useState("0");

  const [capitalStockAtPeriodStart, setCapitalStockAtPeriodStart] = useState("0");
  const [isInvoiceRegisteredBusiness, setIsInvoiceRegisteredBusiness] = useState(false);

  const [hasMergerOrDemerger, setHasMergerOrDemerger] = useState(false);
  const [isSpecifiedNewlyEstablishedCorporation, setIsSpecifiedNewlyEstablishedCorporation] = useState(false);

  const { result, error } = useMemo(() => {
    try {
      const r = determineTaxableStatus({
        entityType,
        isInvoiceRegisteredBusiness,
        hasBasePeriod,
        baseYearTaxableSales: hasBasePeriod ? Number(baseYearTaxableSales) : undefined,
        hasSpecifiedPeriod,
        specifiedPeriodTaxableSales: hasSpecifiedPeriod ? Number(specifiedPeriodTaxableSales) : undefined,
        specifiedPeriodSalaryPaid: hasSpecifiedPeriod ? Number(specifiedPeriodSalaryPaid) : undefined,
        capitalStockAtPeriodStart:
          !hasBasePeriod && entityType === "corporation" ? Number(capitalStockAtPeriodStart) : undefined,
        hasMergerOrDemerger,
        isSpecifiedNewlyEstablishedCorporation,
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [
    entityType,
    isInvoiceRegisteredBusiness,
    hasBasePeriod,
    baseYearTaxableSales,
    hasSpecifiedPeriod,
    specifiedPeriodTaxableSales,
    specifiedPeriodSalaryPaid,
    capitalStockAtPeriodStart,
    hasMergerOrDemerger,
    isSpecifiedNewlyEstablishedCorporation,
  ]);

  const showNewCompanyCapital = !hasBasePeriod && entityType === "corporation";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass}>事業形態</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="entity-type"
                checked={entityType === "individual"}
                onChange={() => setEntityType("individual")}
              />
              個人事業主
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="entity-type"
                checked={entityType === "corporation"}
                onChange={() => setEntityType("corporation")}
              />
              法人
            </label>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasBasePeriod}
              onChange={(e) => setHasBasePeriod(e.target.checked)}
            />
            当期に基準期間がある（法人の設立1期目・2期目はチェックを外してください）
          </label>
        </div>

        {hasBasePeriod ? (
          <div>
            <label className={labelClass} htmlFor="taxable-status-base-year-taxable-sales">基準期間の課税売上高（円）</label>
            <input
              id="taxable-status-base-year-taxable-sales"
              type="number"
              min="0"
              value={baseYearTaxableSales}
              onChange={(e) => setBaseYearTaxableSales(e.target.value)}
              placeholder="例：8000000"
              className={inputClass}
            />
          </div>
        ) : showNewCompanyCapital ? (
          <div>
            <label className={labelClass} htmlFor="taxable-status-capital-stock-at-period-start">事業年度開始の日における資本金の額（円）</label>
            <input
              id="taxable-status-capital-stock-at-period-start"
              type="number"
              min="0"
              value={capitalStockAtPeriodStart}
              onChange={(e) => setCapitalStockAtPeriodStart(e.target.value)}
              placeholder="例：5000000"
              className={inputClass}
            />
          </div>
        ) : (
          <p className="text-xs text-stone-500">
            個人事業主の場合、新設法人の資本金特例は適用されません。基準期間の課税売上高は0円として扱われます。
          </p>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasSpecifiedPeriod}
              onChange={(e) => setHasSpecifiedPeriod(e.target.checked)}
            />
            当期に特定期間がある（法人の設立1期目はチェックを外してください）
          </label>
        </div>

        {hasSpecifiedPeriod && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="taxable-status-specified-period-taxable-sales">特定期間の課税売上高（円）</label>
              <input
                id="taxable-status-specified-period-taxable-sales"
                type="number"
                min="0"
                value={specifiedPeriodTaxableSales}
                onChange={(e) => setSpecifiedPeriodTaxableSales(e.target.value)}
                placeholder="例：11000000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="taxable-status-specified-period-salary-paid">特定期間の給与等支払額（円）</label>
              <input
                id="taxable-status-specified-period-salary-paid"
                type="number"
                min="0"
                value={specifiedPeriodSalaryPaid}
                onChange={(e) => setSpecifiedPeriodSalaryPaid(e.target.value)}
                placeholder="例：9000000"
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isInvoiceRegisteredBusiness}
              onChange={(e) => setIsInvoiceRegisteredBusiness(e.target.checked)}
            />
            インボイス発行事業者（適格請求書発行事業者）として登録済み
          </label>
        </div>

        <div className="border-t border-stone-200 pt-3 flex flex-col gap-2">
          <p className="text-xs text-stone-500">
            以下に該当する場合、本ツールの判定ロジックは対応していません（要専門家確認）。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasMergerOrDemerger}
              onChange={(e) => setHasMergerOrDemerger(e.target.checked)}
            />
            合併・分割が関係する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSpecifiedNewlyEstablishedCorporation}
              onChange={(e) => setIsSpecifiedNewlyEstablishedCorporation(e.target.checked)}
            />
            特定新規設立法人に該当する可能性がある
          </label>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">判定結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            <div
              className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${
                result.status === "taxable" ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"
              }`}
            >
              <div>
                <span
                  className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${
                    result.status === "taxable" ? "bg-red-700 text-white" : "bg-emerald-700 text-white"
                  }`}
                >
                  当期の判定
                </span>
                <div className="text-2xl font-semibold mt-1">{result.statusLabel}</div>
              </div>
              {result.decidingRuleId && (
                <div className="text-sm text-stone-600 max-w-xs">
                  決め手: {RULE_STEP_TITLES[result.decidingRuleId]}
                </div>
              )}
            </div>

            {result.requiresExpertReview && (
              <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">要専門家確認</p>
                <ul className="list-disc list-inside space-y-1">
                  {result.outOfScopeReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border border-stone-300 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">判定ルール</th>
                    <th className="px-3 py-2 font-normal">対象</th>
                    <th className="px-3 py-2 font-normal">該当</th>
                    <th className="px-3 py-2 font-normal">説明</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((step) => (
                    <tr key={step.ruleId} className="border-b border-stone-100 last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        {RULE_STEP_TITLES[step.ruleId]}
                      </td>
                      <td className="px-3 py-2 text-stone-500">{step.applicable ? "対象" : "対象外"}</td>
                      <td className="px-3 py-2">
                        {step.applicable ? (
                          <span className={step.triggered ? "text-red-700 font-medium" : "text-stone-500"}>
                            {step.triggered ? "該当" : "非該当"}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-stone-600 leading-relaxed">{step.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
