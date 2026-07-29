"use client";

import { useMemo, useState } from "react";
import { Asset, FiscalPeriod, summarizeDepreciation } from "@/lib/tax/depreciation";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function currentFiscalYearDefaults(): FiscalPeriod {
  const now = new Date();
  const year = now.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

export function AssetLedgerForm() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [period, setPeriod] = useState<FiscalPeriod>(currentFiscalYearDefaults);

  const [name, setName] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [usefulLifeYears, setUsefulLifeYears] = useState("");
  const [immediateExpensing, setImmediateExpensing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeDepreciation(assets, period), [assets, period]);

  function resetForm() {
    setName("");
    setAcquisitionDate("");
    setAcquisitionCost("");
    setUsefulLifeYears("");
    setImmediateExpensing(false);
  }

  function handleAddAsset(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cost = Number(acquisitionCost);
    const life = Number(usefulLifeYears);

    if (!name.trim()) {
      setFormError("資産名を入力してください。");
      return;
    }
    if (!acquisitionDate) {
      setFormError("取得年月日を入力してください。");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setFormError("取得価額は0以上の数値で入力してください。");
      return;
    }
    if (!Number.isFinite(life) || life <= 0) {
      setFormError("耐用年数は1年以上の数値で入力してください。");
      return;
    }

    const newAsset: Asset = {
      id: makeId(),
      name: name.trim(),
      acquisitionDate,
      acquisitionCost: cost,
      usefulLifeYears: life,
      immediateExpensing,
    };
    setAssets((prev) => [...prev, newAsset]);
    resetForm();
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">対象期間（事業年度）</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            開始日
            <input
              type="date"
              value={period.start}
              onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
              className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            終了日
            <input
              type="date"
              value={period.end}
              onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
              className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">資産を追加する</h2>
        <form onSubmit={handleAddAsset} className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>資産名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：ノートパソコン"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>取得年月日</label>
              <input
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>取得価額（円）</label>
              <input
                type="number"
                min="0"
                value={acquisitionCost}
                onChange={(e) => setAcquisitionCost(e.target.value)}
                placeholder="例：300000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>耐用年数（年）</label>
              <input
                type="number"
                min="1"
                value={usefulLifeYears}
                onChange={(e) => setUsefulLifeYears(e.target.value)}
                placeholder="例：4"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-stone-400 leading-relaxed">
                法定耐用年数（減価償却資産の耐用年数等に関する省令）は本アプリでは自動判定しません。国税庁の耐用年数表等でご確認のうえ入力してください。
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={immediateExpensing}
              onChange={(e) => setImmediateExpensing(e.target.checked)}
            />
            少額減価償却資産の特例を適用する（取得価額30万円未満・取得年度に全額経費算入）
          </label>

          {formError && <p className="text-sm text-red-700">{formError}</p>}

          <div>
            <button
              type="submit"
              className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            >
              資産を追加
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">固定資産台帳（{period.start} 〜 {period.end}）</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-stone-500">まだ資産が登録されていません。上のフォームから追加してください。</p>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">資産名</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">取得年月日</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">取得価額</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">耐用年数</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">当期供用月数</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">期首帳簿価額</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">当期償却額</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">期末減価償却累計額</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">期末帳簿価額</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">備考</th>
                  <th className="px-3 py-2 font-normal print:hidden" />
                </tr>
              </thead>
              <tbody>
                {summary.results.map((r) => (
                  <tr key={r.asset.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2">{r.asset.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.asset.acquisitionDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(r.asset.acquisitionCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.asset.usefulLifeYears}年</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.monthsInService}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(r.openingBookValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{yen.format(r.currentYearDepreciation)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(r.accumulatedDepreciation)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(r.endingBookValue)}</td>
                    <td className="px-3 py-2 text-xs text-stone-500 max-w-[16rem]">
                      {r.immediateExpensingApplied && <span className="text-sky-700">少額特例 </span>}
                      {r.fullyDepreciated && <span className="text-stone-400">償却済（備忘価額）</span>}
                      {r.notes.length > 0 && <span className="block text-amber-700">{r.notes.join(" ")}</span>}
                    </td>
                    <td className="px-3 py-2 print:hidden">
                      <button
                        type="button"
                        onClick={() => removeAsset(r.asset.id)}
                        className="text-xs text-stone-400 hover:text-red-700"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-800 font-semibold">
                  <td className="px-3 py-2" colSpan={6}>
                    合計
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(summary.totalCurrentYearDepreciation)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(summary.totalAccumulatedDepreciation)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(summary.totalEndingBookValue)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400 leading-relaxed">
          少額減価償却資産の特例（取得価額30万円未満の全額即時償却）には、青色申告者について年間合計300万円までという上限があります。
          このアプリは資産ごとの判定のみを行い、資産横断の年間合計はチェックしていないため、対象資産が多い場合はご自身で合計額をご確認ください。
        </p>
      </section>
    </div>
  );
}
