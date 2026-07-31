"use client";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { buildBalanceSheetForm } from "@/lib/tax/balanceSheetForm";
import { buildConsumptionTaxForm } from "@/lib/tax/consumptionTaxForm";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildCorporateTaxForm, buildFinancialStatements } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildCashFlowStatement } from "@/lib/tax/cashFlowStatement";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

function FormTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; amount: number; muted?: boolean; strong?: boolean }[];
}) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-stone-500 mb-1">{title}</div>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-stone-200 ${r.strong ? "font-semibold" : ""}`}>
              <td className={`py-1.5 pr-4 ${r.muted ? "text-stone-400" : ""}`}>{r.label}</td>
              <td className="py-1.5 text-right w-36">
                <Yen v={r.amount} />
                <span className="text-xs text-stone-400"> 円</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocHeader({ title, entityName, periodStart, periodEnd }: { title: string; entityName: string; periodStart: string; periodEnd: string }) {
  return (
    <div className="text-center mb-8 border-b-2 border-stone-800 pb-4">
      <div className="text-xl font-serif tracking-widest">{title}</div>
      <div className="text-sm text-stone-500 mt-2">
        {entityName || "（法人名 未入力）"} ／ 対象期間: {periodStart} 〜 {periodEnd}
      </div>
      <div className="text-xs text-amber-700 mt-2">
        本書類はCSVから機械的に算出した概算の下書き・試算であり、正式な決算書ではありません。提出前・利用前に必ずご自身でご確認ください。
      </div>
    </div>
  );
}

type DocType = "bs" | "pl" | "cf";

const DOC_TABS: { key: DocType; label: string }[] = [
  { key: "bs", label: "貸借対照表" },
  { key: "pl", label: "損益計算書" },
  { key: "cf", label: "キャッシュフロー計算書（簡易試算）" },
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // サーバー側(app/api/categorize/route.ts)の上限と揃える

interface ApiMeta {
  total: number;
  skippedRows: number;
}

export default function FinancialStatementsPage() {
  const [rows, setRows] = useState<CategorizedTransaction[] | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [entityName, setEntityName] = useState("");
  const [capitalStock, setCapitalStock] = useState("1000000");
  const [openingCash, setOpeningCash] = useState("1000000");
  const [shareCount, setShareCount] = useState("");
  const [activeDoc, setActiveDoc] = useState<DocType>("cf");

  // キャッシュフロー計算書用の任意入力（このアプリは固定資産・借入金台帳を保持していないため手入力）
  const [depreciationExpense, setDepreciationExpense] = useState("0");
  const [assetPurchases, setAssetPurchases] = useState("0");
  const [assetSales, setAssetSales] = useState("0");
  const [borrowings, setBorrowings] = useState("0");
  const [loanRepayments, setLoanRepayments] = useState("0");
  const [capitalIncrease, setCapitalIncrease] = useState("0");
  const [dividendsPaid, setDividendsPaid] = useState("0");

  async function handleFile(file: File) {
    if (loading) return; // 解析中は二重送信を防ぐ
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）。期間を分けてアップロードしてください。`);
      return;
    }
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/categorize", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析に失敗しました");
        setRows(null);
        setMeta(null);
        return;
      }
      setRows(data.transactions);
      setMeta(data.meta);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const pl = useMemo(() => (rows ? buildProfitLossStatement(rows) : null), [rows]);
  const corpEstimate = useMemo(() => (rows ? estimateForMicroCorp(rows) : null), [rows]);
  const taxForm = useMemo(() => (corpEstimate ? buildCorporateTaxForm(corpEstimate) : null), [corpEstimate]);
  const localTaxForm = useMemo(
    () => (corpEstimate && taxForm ? buildLocalCorporateTaxForm(corpEstimate, taxForm) : null),
    [corpEstimate, taxForm]
  );
  const consumptionForm = useMemo(() => (rows ? buildConsumptionTaxForm(rows) : null), [rows]);
  const fs = useMemo(
    () => (pl && taxForm ? buildFinancialStatements(pl, taxForm, entityName || "（法人名未入力）", localTaxForm?.grandTotal ?? 0) : null),
    [pl, taxForm, entityName, localTaxForm]
  );

  const bs = useMemo(() => {
    if (!pl || !fs || !consumptionForm) return null;
    // 貸借対照表・キャッシュフロー計算書は、税込経理の慣行に合わせ
    // 未払消費税等も反映した「調整後・当期純利益」で繰越利益剰余金を計算する。
    const bsNetIncome = fs.incomeBeforeTax - fs.taxes - consumptionForm.totalDue;
    return buildBalanceSheetForm(
      {
        capitalStock: Number(capitalStock) || 0,
        openingCash: Number(openingCash) || 0,
        shareCount: Number(shareCount) || undefined,
      },
      pl.incomeTotal,
      pl.expenseTotal,
      fs.taxes,
      consumptionForm.totalDue,
      bsNetIncome
    );
  }, [pl, fs, consumptionForm, capitalStock, openingCash, shareCount]);

  const cf = useMemo(() => {
    if (!pl || !bs) return null;
    return buildCashFlowStatement(pl, bs, {
      depreciationExpense: Number(depreciationExpense) || 0,
      assetPurchases: Number(assetPurchases) || 0,
      assetSales: Number(assetSales) || 0,
      borrowings: Number(borrowings) || 0,
      loanRepayments: Number(loanRepayments) || 0,
      capitalIncrease: Number(capitalIncrease) || 0,
      dividendsPaid: Number(dividendsPaid) || 0,
    });
  }, [pl, bs, depreciationExpense, assetPurchases, assetSales, borrowings, loanRepayments, capitalIncrease, dividendsPaid]);

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">決算報告書（貸借対照表・損益計算書・キャッシュフロー計算書）下書き試作</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-semibold mb-2">決算報告書の下書きを作成する</h1>
          <p className="text-sm text-stone-600 mb-4 max-w-2xl leading-relaxed">
            銀行・カード会社からダウンロードした取引明細CSVをアップロードすると、貸借対照表・損益計算書・
            キャッシュフロー計算書（簡易試算）の下書きを作成します。
            <b>これは概算シミュレーションであり、正式な決算書ではありません。</b>
            最終的な内容は必ずご自身でご確認ください。マイクロ法人（資本金1億円以下の中小法人）向けの機能です。
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs text-stone-500 mb-2">法人名（書類プレビュー用）</div>
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="例: 株式会社サンプル"
                className="w-full max-w-md border border-stone-400 bg-white px-4 py-3 text-sm outline-none focus:border-stone-600"
              />
            </div>

            <div>
              <div className="text-xs text-stone-500 mb-2">貸借対照表用の入力（期首時点の想定値）</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  資本金
                  <input
                    type="number"
                    value={capitalStock}
                    onChange={(e) => setCapitalStock(e.target.value)}
                    className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  期首現金残高
                  <input
                    type="number"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  発行済株式数（任意）
                  <input
                    type="number"
                    value={shareCount}
                    onChange={(e) => setShareCount(e.target.value)}
                    className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-stone-400 max-w-md leading-relaxed">
                期首の資産は現金のみ・負債ゼロと仮定し、期首繰越利益剰余金＝期首現金－資本金として貸借対照表を作成します（固定資産・売掛金・借入金等は反映されません）。
              </p>
            </div>

            <div>
              <div className="text-xs text-stone-500 mb-2">明細データ</div>
              <label
                className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm transition-colors ${
                  loading
                    ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
                    : "border-stone-400 bg-white cursor-pointer hover:border-red-700"
                }`}
              >
                <span>{loading ? "解析中…" : "CSVファイルを選択"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={loading}
                  aria-busy={loading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = ""; // 同じファイルを選び直しても再度onChangeが発火するようにする
                  }}
                />
              </label>
              {fileName && <span className="ml-3 text-xs text-stone-500">{fileName}</span>}
            </div>
          </div>

          {loading && <p className="mt-3 text-sm text-stone-500">解析中…</p>}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          {meta && (
            <div className="mt-4 text-xs text-stone-500 flex flex-wrap gap-x-6 gap-y-1">
              <span>取込件数: {meta.total}件（スキップ {meta.skippedRows}件）</span>
            </div>
          )}
        </section>

        {rows && rows.length > 0 && pl && bs && cf && (
          <section>
            <div className="flex gap-2 mb-4 flex-wrap">
              {DOC_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={activeDoc === t.key}
                  onClick={() => setActiveDoc(t.key)}
                  className={`text-sm px-4 py-2 border transition-colors ${
                    activeDoc === t.key
                      ? "bg-stone-900 border-stone-900 text-white"
                      : "bg-white border-stone-400 text-stone-600 hover:border-stone-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-white border border-stone-300 p-8">
              {activeDoc === "bs" && (
                <>
                  <DocHeader title="貸借対照表" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
                  <FormTable
                    title="資産の部"
                    rows={[
                      { label: "現金及び預金", amount: bs.endingCash },
                      { label: "資産の部合計", amount: bs.assetsTotal, strong: true },
                    ]}
                  />
                  <FormTable
                    title="負債の部"
                    rows={[
                      { label: "未払法人税等（法人税・地方法人税・住民税・事業税等）", amount: bs.unpaidCorporateTaxes },
                      { label: "未払消費税等", amount: bs.unpaidConsumptionTax },
                      { label: "負債の部合計", amount: bs.liabilitiesTotal, strong: true },
                    ]}
                  />
                  <FormTable
                    title="純資産の部"
                    rows={[
                      { label: "資本金", amount: bs.capitalStock },
                      { label: "繰越利益剰余金", amount: bs.retainedEarningsEnding },
                      { label: "純資産の部合計", amount: bs.netAssetsTotal, strong: true },
                    ]}
                  />
                  <p className={`text-xs ${bs.balanced ? "text-stone-400" : "text-red-700"}`}>
                    {bs.balanced
                      ? "検算: 資産合計＝負債＋純資産合計（一致）"
                      : "検算エラー: 資産合計と負債＋純資産合計が一致していません。入力値をご確認ください。"}
                    　固定資産・売掛金・借入金等、現金以外の資産負債はこのアプリでは反映されません。
                  </p>
                </>
              )}

              {activeDoc === "pl" && fs && (
                <>
                  <DocHeader title="損益計算書" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
                  <FormTable title="売上高" rows={[{ label: "売上高合計", amount: pl.incomeTotal - fs.nonOperatingIncome, strong: true }]} />
                  <FormTable
                    title="販売費及び一般管理費（内訳）"
                    rows={pl.expenseLines.filter((l) => l.account !== "雑損失").map((l) => ({ label: l.account, amount: l.amount }))}
                  />
                  <FormTable
                    title="営業外損益・税引後利益"
                    rows={[
                      { label: "営業利益金額", amount: fs.operatingIncome, strong: true },
                      { label: "営業外収益合計（受取利息・雑収入等）", amount: fs.nonOperatingIncome },
                      { label: "営業外費用合計（雑損失等）", amount: fs.nonOperatingExpense },
                      { label: "経常利益金額", amount: fs.ordinaryIncome, strong: true },
                      { label: "税引前当期純利益金額", amount: fs.incomeBeforeTax },
                      { label: "法人税、住民税及び事業税（概算合計）", amount: fs.taxes },
                      { label: "当期純利益金額（概算）", amount: fs.netIncome, strong: true },
                    ]}
                  />
                </>
              )}

              {activeDoc === "cf" && (
                <>
                  <DocHeader
                    title="キャッシュフロー計算書（簡易試算・間接法）"
                    entityName={entityName}
                    periodStart={cf.periodStart}
                    periodEnd={cf.periodEnd}
                  />

                  <div className="print:hidden mb-6 bg-stone-50 border border-stone-200 rounded p-4">
                    <div className="text-xs font-semibold text-stone-500 mb-3">
                      任意入力項目（このアプリは固定資産・借入金台帳を保持していないため手入力してください。未入力は0として扱われます）
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <NumberField label="減価償却費" value={depreciationExpense} onChange={setDepreciationExpense} />
                      <NumberField label="固定資産の取得による支出" value={assetPurchases} onChange={setAssetPurchases} />
                      <NumberField label="固定資産の売却による収入" value={assetSales} onChange={setAssetSales} />
                      <NumberField label="借入による収入" value={borrowings} onChange={setBorrowings} />
                      <NumberField label="借入金の返済による支出" value={loanRepayments} onChange={setLoanRepayments} />
                      <NumberField label="増資による収入" value={capitalIncrease} onChange={setCapitalIncrease} />
                      <NumberField label="配当金の支払額" value={dividendsPaid} onChange={setDividendsPaid} />
                    </div>
                  </div>

                  <FormTable
                    title="営業活動によるキャッシュフロー"
                    rows={[
                      ...cf.operatingLines.map((l) => ({ label: l.label, amount: l.amount })),
                      { label: "営業活動によるキャッシュフロー小計", amount: cf.operatingActivitiesCashFlow, strong: true },
                    ]}
                  />
                  <FormTable
                    title="投資活動によるキャッシュフロー"
                    rows={[
                      ...cf.investingLines.map((l) => ({ label: l.label, amount: l.amount })),
                      { label: "投資活動によるキャッシュフロー小計", amount: cf.investingActivitiesCashFlow, strong: true },
                    ]}
                  />
                  <FormTable
                    title="財務活動によるキャッシュフロー"
                    rows={[
                      ...cf.financingLines.map((l) => ({ label: l.label, amount: l.amount })),
                      { label: "財務活動によるキャッシュフロー小計", amount: cf.financingActivitiesCashFlow, strong: true },
                    ]}
                  />
                  <FormTable
                    title="現金及び現金同等物の増減"
                    rows={[
                      { label: "現金及び現金同等物の増減額", amount: cf.netChangeInCash, strong: true },
                      { label: "現金及び現金同等物の期首残高", amount: cf.openingCashBalance },
                      { label: "現金及び現金同等物の期末残高（試算）", amount: cf.endingCashBalanceEstimate, strong: true },
                    ]}
                  />

                  <div className="mb-6 text-sm space-y-2">
                    <div>
                      <span className="text-stone-500 text-xs mr-2">営業CF対売上高比率</span>
                      {cf.operatingCashFlowToRevenueRatio === null
                        ? "算出不可（当期の売上高が0のため）"
                        : `${(cf.operatingCashFlowToRevenueRatio * 100).toFixed(2)}%`}
                    </div>
                    <div>
                      <span className="text-stone-500 text-xs mr-2">営業キャッシュフローと当期純利益の差額</span>
                      <Yen v={cf.cashFlowToNetIncomeGap} />円
                    </div>
                  </div>

                  <p className={`text-xs mb-4 ${cf.reconcilesWithBalanceSheet ? "text-stone-400" : "text-amber-700"}`}>
                    {cf.reconcilesWithBalanceSheet
                      ? "検算: 試算上の期末現金残高は貸借対照表の期末現金残高と一致しています。"
                      : `注意: 試算上の期末現金残高（${yen.format(cf.endingCashBalanceEstimate)}円）は貸借対照表の期末現金残高（${yen.format(
                          cf.actualEndingCashBalance
                        )}円）と一致していません。減価償却費・投資活動・財務活動の入力値をご確認ください。`}
                  </p>

                  <ul className="text-xs text-stone-500 list-disc list-inside space-y-1">
                    {cf.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
      />
    </label>
  );
}
