"use client";

import { useMemo, useState } from "react";
import {
  HIGH_VALUE_ASSET_PRICE_THRESHOLD,
  determineHighValueAssetTaxableStatus,
  type AssetAcquisition,
  type TaxPeriod,
} from "@/lib/tax/highValueAssetTaxableStatus";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";

type TaxPeriodRow = TaxPeriod & { id: string };
type AssetAcquisitionRow = AssetAcquisition & { id: string };

let nextRowId = 0;
function newRowId(prefix: string): string {
  nextRowId += 1;
  return `${prefix}-${nextRowId}`;
}

function defaultTaxPeriods(): TaxPeriodRow[] {
  return [
    { id: newRowId("period"), startDate: "2025-01-01", endDate: "2025-12-31", label: "2025年分" },
    { id: newRowId("period"), startDate: "2026-01-01", endDate: "2026-12-31", label: "2026年分" },
    { id: newRowId("period"), startDate: "2027-01-01", endDate: "2027-12-31", label: "2027年分" },
    { id: newRowId("period"), startDate: "2028-01-01", endDate: "2028-12-31", label: "2028年分" },
  ];
}

function defaultAcquisitions(): AssetAcquisitionRow[] {
  return [{ id: newRowId("asset"), acquisitionDate: "2026-06-01", taxExcludedPrice: 0, description: "" }];
}

/**
 * 高額特定資産の取得（消費税法12条の4）による課税事業者強制期間チェッカー。
 *
 * 課税期間（判定に使う連続した期間）と資産取得（取得日・税抜き取得価額）を
 * フォームで入力すると、determineHighValueAssetTaxableStatus（純粋関数）に
 * 委譲して、1,000万円以上の取得があるか、あればどの課税期間まで免税事業者・
 * 簡易課税制度の選択が制限されるかを計算し、結果を表示する。
 */
export function HighValueAssetStatusChecker() {
  const [taxPeriods, setTaxPeriods] = useState<TaxPeriodRow[]>(defaultTaxPeriods);
  const [acquisitions, setAcquisitions] = useState<AssetAcquisitionRow[]>(defaultAcquisitions);

  const updateTaxPeriod = (id: string, patch: Partial<TaxPeriod>) => {
    setTaxPeriods((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeTaxPeriod = (id: string) => {
    setTaxPeriods((rows) => rows.filter((row) => row.id !== id));
  };
  const addTaxPeriod = () => {
    setTaxPeriods((rows) => [
      ...rows,
      { id: newRowId("period"), startDate: "", endDate: "", label: "" },
    ]);
  };

  const updateAcquisition = (id: string, patch: Partial<AssetAcquisitionRow>) => {
    setAcquisitions((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeAcquisition = (id: string) => {
    setAcquisitions((rows) => rows.filter((row) => row.id !== id));
  };
  const addAcquisition = () => {
    setAcquisitions((rows) => [
      ...rows,
      { id: newRowId("asset"), acquisitionDate: "", taxExcludedPrice: 0, description: "" },
    ]);
  };

  const { result, error } = useMemo(() => {
    try {
      const r = determineHighValueAssetTaxableStatus({
        taxPeriods: taxPeriods.map(({ startDate, endDate, label }) => ({ startDate, endDate, label })),
        acquisitions: acquisitions.map(({ acquisitionDate, taxExcludedPrice, description }) => ({
          acquisitionDate,
          taxExcludedPrice,
          description,
        })),
      });
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [taxPeriods, acquisitions]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-surface border border-border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">課税期間（判定に使う連続した期間）</h2>
          <button
            type="button"
            onClick={addTaxPeriod}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface"
          >
            + 課税期間を追加
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          資産の取得日を含む課税期間から、その後2課税期間分までのデータが揃っていないと、強制期間の全体を計算できません。
        </p>
        <div className="flex flex-col gap-3">
          {taxPeriods.map((period, index) => (
            <div key={period.id} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className={labelClass} htmlFor={`period-label-${period.id}`}>
                  期間{index + 1}のラベル（任意）
                </label>
                <input
                  id={`period-label-${period.id}`}
                  type="text"
                  value={period.label ?? ""}
                  onChange={(e) => updateTaxPeriod(period.id, { label: e.target.value })}
                  placeholder="例：2026年分"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`period-start-${period.id}`}>
                  開始日
                </label>
                <input
                  id={`period-start-${period.id}`}
                  type="date"
                  value={period.startDate}
                  onChange={(e) => updateTaxPeriod(period.id, { startDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`period-end-${period.id}`}>
                  終了日
                </label>
                <input
                  id={`period-end-${period.id}`}
                  type="date"
                  value={period.endDate}
                  onChange={(e) => updateTaxPeriod(period.id, { endDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => removeTaxPeriod(period.id)}
                className="text-xs text-red-700 border border-red-300 rounded px-2 py-2 hover:bg-red-50"
                aria-label={`期間${index + 1}を削除`}
              >
                削除
              </button>
            </div>
          ))}
          {taxPeriods.length === 0 && <p className="text-xs text-muted-foreground">課税期間を1件以上追加してください。</p>}
        </div>
      </section>

      <section className="flex flex-col gap-4 bg-surface border border-border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">資産の取得</h2>
          <button
            type="button"
            onClick={addAcquisition}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface"
          >
            + 資産取得を追加
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {acquisitions.map((acquisition, index) => (
            <div key={acquisition.id} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className={labelClass} htmlFor={`asset-desc-${acquisition.id}`}>
                  資産{index + 1}の名称・摘要（任意）
                </label>
                <input
                  id={`asset-desc-${acquisition.id}`}
                  type="text"
                  value={acquisition.description ?? ""}
                  onChange={(e) => updateAcquisition(acquisition.id, { description: e.target.value })}
                  placeholder="例：業務用車両"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`asset-date-${acquisition.id}`}>
                  取得日
                </label>
                <input
                  id={`asset-date-${acquisition.id}`}
                  type="date"
                  value={acquisition.acquisitionDate}
                  onChange={(e) => updateAcquisition(acquisition.id, { acquisitionDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`asset-price-${acquisition.id}`}>
                  取得価額（税抜き、円）
                </label>
                <input
                  id={`asset-price-${acquisition.id}`}
                  type="number"
                  min="0"
                  value={acquisition.taxExcludedPrice}
                  onChange={(e) =>
                    updateAcquisition(acquisition.id, { taxExcludedPrice: Number(e.target.value) })
                  }
                  placeholder="例：15000000"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => removeAcquisition(acquisition.id)}
                className="text-xs text-red-700 border border-red-300 rounded px-2 py-2 hover:bg-red-50"
                aria-label={`資産${index + 1}を削除`}
              >
                削除
              </button>
            </div>
          ))}
          {acquisitions.length === 0 && (
            <p className="text-xs text-muted-foreground">資産取得を1件以上追加してください（無ければ「該当なし」と判定されます）。</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          しきい値は税抜き取得価額
          {HIGH_VALUE_ASSET_PRICE_THRESHOLD.toLocaleString("ja-JP")}
          円「以上」です（消費税法12条の4）。
        </p>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">判定結果</h2>
        {result ? (
          <div className="flex flex-col gap-4">
            <div
              className={`border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap ${
                result.hasHighValueAcquisition ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"
              }`}
            >
              <div>
                <span
                  className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium ${
                    result.hasHighValueAcquisition ? "bg-red-700 text-white" : "bg-emerald-700 text-white"
                  }`}
                >
                  高額特定資産の取得
                </span>
                <div className="text-2xl font-semibold mt-1">
                  {result.hasHighValueAcquisition ? "該当あり" : "該当なし"}
                </div>
              </div>
              {result.latestMandatoryTaxableEndDate && (
                <div className="text-sm text-muted-foreground max-w-xs">
                  免税事業者・簡易課税の選択が制限される期間: 〜{result.latestMandatoryTaxableEndDate}
                </div>
              )}
            </div>

            {result.hasHighValueAcquisition && (
              <div className="border border-border bg-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground text-xs">
                      <th className="px-3 py-2 font-normal">強制課税期間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.combinedMandatoryTaxablePeriods.map((period) => (
                      <tr key={`${period.startDate}_${period.endDate}`} className="border-b border-border/60 last:border-b-0">
                        <td className="px-3 py-2 text-foreground">
                          {period.label ? `${period.label}（` : ""}
                          {period.startDate}〜{period.endDate}
                          {period.label ? "）" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">資産</th>
                    <th className="px-3 py-2 font-normal">取得日</th>
                    <th className="px-3 py-2 font-normal">取得価額（税抜き）</th>
                    <th className="px-3 py-2 font-normal">該当</th>
                    <th className="px-3 py-2 font-normal">説明</th>
                  </tr>
                </thead>
                <tbody>
                  {result.evaluations.map((evaluation, index) => (
                    <tr key={index} className="border-b border-border/60 last:border-b-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        {evaluation.acquisition.description || `資産${index + 1}`}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {evaluation.acquisition.acquisitionDate}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {evaluation.acquisition.taxExcludedPrice.toLocaleString("ja-JP")}円
                      </td>
                      <td className="px-3 py-2">
                        <span className={evaluation.meetsThreshold ? "text-red-700 font-medium" : "text-muted-foreground"}>
                          {evaluation.meetsThreshold ? "該当" : "非該当"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground leading-relaxed">
                        <ul className="list-disc list-inside space-y-1">
                          {evaluation.notes.map((note, noteIndex) => (
                            <li key={noteIndex}>{note}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                  {result.evaluations.length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-muted-foreground" colSpan={5}>
                        資産取得が入力されていません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-foreground">前提・注意事項</h3>
              <ul className="text-xs text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
                {result.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
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
