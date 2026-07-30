"use client";

import { useMemo, useState } from "react";
import {
  Asset,
  DepreciationMethod,
  FiscalPeriod,
  summarizeDepreciation,
  validateDeMinimisAnnualCap,
} from "@/lib/tax/depreciation";
import { AssetDisposalResult, calculateAssetDisposal } from "@/lib/tax/assetDisposal";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const DEPRECIATION_METHOD_LABEL: Record<DepreciationMethod, string> = {
  "straight-line": "定額法",
  "declining-balance": "定率法",
};

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
  const [method, setMethod] = useState<DepreciationMethod>("straight-line");
  const [formError, setFormError] = useState<string | null>(null);

  const [disposalAssetId, setDisposalAssetId] = useState("");
  const [disposalDate, setDisposalDate] = useState("");
  const [disposalProceeds, setDisposalProceeds] = useState("");
  const [disposalError, setDisposalError] = useState<string | null>(null);
  const [disposalResult, setDisposalResult] = useState<AssetDisposalResult | null>(null);

  const summary = useMemo(() => summarizeDepreciation(assets, period), [assets, period]);
  const deMinimisCapCheck = useMemo(() => validateDeMinimisAnnualCap(assets, period), [assets, period]);

  function resetForm() {
    setName("");
    setAcquisitionDate("");
    setAcquisitionCost("");
    setUsefulLifeYears("");
    setImmediateExpensing(false);
    setMethod("straight-line");
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
      method,
    };
    setAssets((prev) => [...prev, newAsset]);
    resetForm();
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    if (disposalAssetId === id) {
      setDisposalAssetId("");
      setDisposalResult(null);
    }
  }

  function handleCalculateDisposal(e: React.FormEvent) {
    e.preventDefault();
    setDisposalError(null);
    setDisposalResult(null);

    const targetAsset = assets.find((a) => a.id === disposalAssetId);
    if (!targetAsset) {
      setDisposalError("除却・売却する資産を選択してください。");
      return;
    }
    if (!disposalDate) {
      setDisposalError("除却・売却年月日を入力してください。");
      return;
    }
    const proceeds = disposalProceeds.trim() === "" ? 0 : Number(disposalProceeds);
    if (!Number.isFinite(proceeds)) {
      setDisposalError("受取額（売却代金）は数値で入力してください。スクラップ・廃棄の場合は0円のままで構いません。");
      return;
    }

    const result = calculateAssetDisposal({
      asset: targetAsset,
      disposalDate,
      disposalProceeds: proceeds,
    });
    setDisposalResult(result);
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
            <div>
              <label className={labelClass}>減価償却の方法</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as DepreciationMethod)}
                className={inputClass}
              >
                <option value="straight-line">定額法</option>
                <option value="declining-balance">定率法（200%償却・簡略化した計算）</option>
              </select>
              {method === "declining-balance" && (
                <p className="mt-1 text-xs text-stone-400 leading-relaxed">
                  定率法は簡略化した実装です。国税庁の公式な償却率表（保証率・改定償却率を含む耐用年数省令別表）は使用していません。正式な金額は税理士等の専門家にご確認ください。
                </p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={immediateExpensing}
              onChange={(e) => setImmediateExpensing(e.target.checked)}
            />
            少額減価償却資産の特例を適用する（取得価額30万円未満・取得年度に全額経費算入。方法の選択に関わらず優先されます）
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
                  <th className="px-3 py-2 font-normal whitespace-nowrap">方法</th>
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
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-stone-600">
                      {r.immediateExpensingApplied ? "少額特例" : DEPRECIATION_METHOD_LABEL[r.method]}
                    </td>
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
                  <td className="px-3 py-2" colSpan={7}>
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

        {deMinimisCapCheck.capExceeded && (
          <div className="mt-3 border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              少額減価償却資産の特例（取得価額30万円未満の全額即時償却）の年間上限を超えています
            </p>
            <p className="mt-1">
              当期の即時償却額の合計は{yen.format(deMinimisCapCheck.totalExpensedAmount)}
              円で、青色申告者の年間上限{yen.format(deMinimisCapCheck.annualCap)}円を
              {yen.format(deMinimisCapCheck.excessAmount)}円超えています。
              上限を超える部分については、いずれかの資産について特例の適用を取りやめ、通常の減価償却（定額法・定率法）に
              切り替える必要があります。<strong>本アプリはどの資産を切り替えるかを自動決定しません。</strong>
              以下を参考に、利用者（または税理士等の専門家）が対象資産を選んでください。
            </p>
            <div className="mt-3 grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-amber-800">取得年月日が新しい順（見直しの参考）</p>
                <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
                  {deMinimisCapCheck.assetsByAcquisitionDateDesc.map((a) => (
                    <li key={a.asset.id}>
                      {a.asset.name}（{a.asset.acquisitionDate}）— {yen.format(a.expensedAmount)}円
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-amber-800">即時償却額が大きい順（見直しの参考）</p>
                <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
                  {deMinimisCapCheck.assetsByExpensedAmountDesc.map((a) => (
                    <li key={a.asset.id}>
                      {a.asset.name}（{a.asset.acquisitionDate}）— {yen.format(a.expensedAmount)}円
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-stone-400 leading-relaxed">
          少額減価償却資産の特例（取得価額30万円未満の全額即時償却）には、青色申告者について年間合計300万円までという上限があります。
          このアプリは対象資産の当期即時償却額を資産横断で自動的に合計し、上限超過の有無を上記の警告で表示しますが、
          上限を超えた場合にどの資産の特例適用を取りやめるかは自動的には決定・修正しません。最終的な判断は、必ずご自身
          （または税理士等の専門家）で行ってください。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">資産を除却・売却する</h2>
        <p className="text-xs text-stone-500 mb-3 max-w-2xl leading-relaxed">
          資産を廃棄・スクラップした場合や売却した場合の未償却残高と、固定資産除却損／売却損益の概算を計算します。
          受取額（売却代金）が0円の場合は「除却」、1円以上の場合は「売却」として扱います。
        </p>
        {assets.length === 0 ? (
          <p className="text-sm text-stone-500">除却・売却するには、まず上の台帳に資産を登録してください。</p>
        ) : (
          <form
            onSubmit={handleCalculateDisposal}
            className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4"
          >
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>対象資産</label>
                <select
                  value={disposalAssetId}
                  onChange={(e) => setDisposalAssetId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">選択してください</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}（取得日 {a.acquisitionDate}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>除却・売却年月日</label>
                <input
                  type="date"
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>受取額・売却代金（円）</label>
                <input
                  type="number"
                  min="0"
                  value={disposalProceeds}
                  onChange={(e) => setDisposalProceeds(e.target.value)}
                  placeholder="例：0（スクラップの場合）"
                  className={inputClass}
                />
              </div>
            </div>

            {disposalError && <p className="text-sm text-red-700">{disposalError}</p>}

            <div>
              <button
                type="submit"
                className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
              >
                除却・売却損益を計算
              </button>
            </div>
          </form>
        )}

        {disposalResult && (
          <div className="mt-4 border border-stone-300 bg-white p-5">
            <div className="text-sm font-medium mb-3">
              {disposalResult.asset.name} — {disposalResult.disposalCase === "retirement" ? "除却" : "売却"}
            </div>
            <dl className="text-sm space-y-2 max-w-md">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-stone-500">未償却残高の算定基準日</dt>
                <dd className="tabular-nums">{disposalResult.cutoffDate}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-stone-500">算定基準日までの償却月数</dt>
                <dd className="tabular-nums">{disposalResult.monthsDepreciatedBeforeDisposal}ヶ月</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-stone-500">減価償却累計額（算定基準日時点）</dt>
                <dd className="tabular-nums">{yen.format(disposalResult.accumulatedDepreciationBeforeDisposal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-stone-500">未償却残高</dt>
                <dd className="tabular-nums font-medium">{yen.format(disposalResult.bookValueAtDisposal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-stone-500">受取額（売却代金）</dt>
                <dd className="tabular-nums">{yen.format(disposalResult.disposalProceeds)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-2 border-t border-stone-200">
                <dt className={disposalResult.isGain ? "text-emerald-700" : disposalResult.isLoss ? "text-red-700" : "text-stone-500"}>
                  {disposalResult.disposalCase === "retirement"
                    ? "固定資産除却損"
                    : disposalResult.isGain
                    ? "固定資産売却益"
                    : disposalResult.isLoss
                    ? "固定資産売却損"
                    : "売却損益"}
                </dt>
                <dd
                  className={`tabular-nums font-semibold text-base ${
                    disposalResult.isGain ? "text-emerald-700" : disposalResult.isLoss ? "text-red-700" : ""
                  }`}
                >
                  {yen.format(Math.abs(disposalResult.gainOrLoss))}
                </dd>
              </div>
            </dl>
            {disposalResult.notes.length > 0 && (
              <ul className="mt-4 text-xs text-stone-500 list-disc list-inside space-y-1">
                {disposalResult.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-stone-400 leading-relaxed">
          未償却残高は、除却・売却の属する月自体の減価償却費は計上せず、その前月末までの月割り償却額をもって概算しています（簡便法）。
          正式な決算・申告への反映は、必ずご自身（または税理士等の専門家）でご確認ください。税務代理・個別具体的な税務相談は行っておりません。
        </p>
      </section>
    </div>
  );
}
