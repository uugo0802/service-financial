"use client";

import { useMemo, useState } from "react";
import {
  CORPORATE_TAX_INTERIM_FILING_THRESHOLD,
  calculateProvisionalInterimTax,
  compareInterimTaxMethods,
  deriveInterimTaxFromClosing,
} from "@/lib/tax/corporateInterimTax";
import { CorporateEstimate } from "@/lib/tax/corporateEstimate";

type Method = "provisional" | "interimClosing" | "compare";

const METHOD_TABS: { value: Method; label: string }[] = [
  { value: "provisional", label: "予定申告方式" },
  { value: "interimClosing", label: "仮決算方式" },
  { value: "compare", label: "両方式を比較" },
];

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function toNumber(value: string): number {
  return Number(value) || 0;
}

/**
 * 仮決算方式の入力欄はユーザーが「6か月分の仮決算による法人税額・地方法人税額・消費税額」を
 * 直接入力する簡易UIになっている（本来は6か月分の取引データを estimateForMicroCorp に渡して
 * CorporateEstimate を得るのが正式な手順。詳しくは corporateInterimTax.ts の
 * deriveInterimTaxFromClosing のコメントを参照）。ここでは入力された金額を最小限の
 * CorporateEstimate 形式に詰め替えて deriveInterimTaxFromClosing に渡す。
 */
function buildManualInterimClosingEstimate(input: {
  corporateTax: number;
  localCorporateTax: number;
  consumptionTaxPayable: number | null;
}): CorporateEstimate {
  return {
    revenue: 0,
    expenses: 0,
    taxableIncome: 0,
    corporateTax: input.corporateTax,
    localCorporateTax: input.localCorporateTax,
    perCapitaTaxReference: 0,
    totalNationalTax: input.corporateTax + input.localCorporateTax,
    consumptionTax: {
      isLikelyExempt: input.consumptionTaxPayable === null,
      salesTax: 0,
      purchaseTax: 0,
      payable: input.consumptionTaxPayable ?? 0,
    },
    assumptions: [],
  };
}

export function CorporateInterimTaxForm() {
  const [method, setMethod] = useState<Method>("provisional");

  const [priorCorporateTaxInput, setPriorCorporateTaxInput] = useState("450000");
  const [priorLocalCorporateTaxInput, setPriorLocalCorporateTaxInput] = useState("46000");
  const [priorConsumptionTaxInput, setPriorConsumptionTaxInput] = useState("");

  const [closingCorporateTaxInput, setClosingCorporateTaxInput] = useState("180000");
  const [closingLocalCorporateTaxInput, setClosingLocalCorporateTaxInput] = useState("18000");
  const [closingConsumptionTaxInput, setClosingConsumptionTaxInput] = useState("");

  const priorYearConsumptionTax =
    priorConsumptionTaxInput.trim() === "" ? undefined : toNumber(priorConsumptionTaxInput);

  const provisional = useMemo(
    () =>
      calculateProvisionalInterimTax({
        corporateTax: toNumber(priorCorporateTaxInput),
        localCorporateTax: toNumber(priorLocalCorporateTaxInput),
        consumptionTax: priorYearConsumptionTax,
      }),
    [priorCorporateTaxInput, priorLocalCorporateTaxInput, priorYearConsumptionTax]
  );

  const closingConsumptionTaxPayable =
    closingConsumptionTaxInput.trim() === "" ? null : toNumber(closingConsumptionTaxInput);

  const interimClosing = useMemo(
    () =>
      deriveInterimTaxFromClosing(
        buildManualInterimClosingEstimate({
          corporateTax: toNumber(closingCorporateTaxInput),
          localCorporateTax: toNumber(closingLocalCorporateTaxInput),
          consumptionTaxPayable: closingConsumptionTaxPayable,
        })
      ),
    [closingCorporateTaxInput, closingLocalCorporateTaxInput, closingConsumptionTaxPayable]
  );

  const showInterimClosing = method === "interimClosing" || method === "compare";
  const comparison = useMemo(
    () => compareInterimTaxMethods(provisional, showInterimClosing ? interimClosing : undefined),
    [provisional, interimClosing, showInterimClosing]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {METHOD_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMethod(tab.value)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
              method === tab.value
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-300 hover:border-stone-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!provisional.required && (
        <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-4 text-sm text-emerald-900">
          前事業年度の確定法人税額（{formatYen(provisional.priorYearCorporateTax)}）は
          {formatYen(CORPORATE_TAX_INTERIM_FILING_THRESHOLD)}以下のため、当期の中間申告・中間納付は原則不要と見込まれます。
        </div>
      )}

      {(method === "provisional" || method === "compare") && (
        <section className="border border-stone-300 bg-white rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3 text-stone-700">
            予定申告方式（前年実績による予定申告）
          </h3>
          <div className="flex flex-col gap-4 max-w-md mb-4">
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前期確定法人税額（国税、地方法人税を含まない）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorCorporateTaxInput}
                onChange={(e) => setPriorCorporateTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 450000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前期確定地方法人税額
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorLocalCorporateTaxInput}
                onChange={(e) => setPriorLocalCorporateTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 46000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              前期確定消費税額（国税部分、任意）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={priorConsumptionTaxInput}
                onChange={(e) => setPriorConsumptionTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="未入力可（消費税は計算しません）"
              />
            </label>
          </div>

          <ResultTable
            rows={[
              { label: "法人税", value: provisional.corporateTaxPrepayment },
              { label: "地方法人税", value: provisional.localCorporateTaxPrepayment },
              ...(provisional.consumptionTaxPrepayment !== null
                ? [{ label: "消費税（国税部分）", value: provisional.consumptionTaxPrepayment }]
                : []),
            ]}
            total={provisional.totalPrepayment}
          />
          <p className="text-xs text-stone-400 leading-relaxed mt-3">
            前期確定額の1/2を、法人税・地方法人税は1万円未満切り捨て、消費税は円未満切り捨てで概算しています。
          </p>
        </section>
      )}

      {(method === "interimClosing" || method === "compare") && (
        <section className="border border-stone-300 bg-white rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3 text-stone-700">仮決算方式（仮決算による中間申告）</h3>
          <p className="text-xs text-stone-500 leading-relaxed mb-3">
            事業年度開始から6か月間の実際の取引データを法人税概算ツール（corporateEstimate.ts の
            estimateForMicroCorp）にかけて仮決算を組み、その結果の法人税額・地方法人税額・消費税額をここに入力してください。
          </p>
          <div className="flex flex-col gap-4 max-w-md mb-4">
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              仮決算（6か月）による法人税額
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={closingCorporateTaxInput}
                onChange={(e) => setClosingCorporateTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 180000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              仮決算（6か月）による地方法人税額
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={closingLocalCorporateTaxInput}
                onChange={(e) => setClosingLocalCorporateTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="例: 18000"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              仮決算（6か月）による消費税納付見込額（任意）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={closingConsumptionTaxInput}
                onChange={(e) => setClosingConsumptionTaxInput(e.target.value)}
                className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
                placeholder="未入力可（消費税は計算しません）"
              />
            </label>
          </div>

          <ResultTable
            rows={[
              { label: "法人税", value: interimClosing.corporateTax },
              { label: "地方法人税", value: interimClosing.localCorporateTax },
              ...(interimClosing.consumptionTaxPayable !== null
                ? [{ label: "消費税（国税部分）", value: interimClosing.consumptionTaxPayable }]
                : []),
            ]}
            total={interimClosing.totalPrepayment}
          />
          <p className="text-xs text-stone-400 leading-relaxed mt-3">
            仮決算の試算結果をそのまま転記しています（予定申告方式のような1万円未満切り捨ては適用していません）。
          </p>
        </section>
      )}

      {method === "compare" && comparison.interimClosingTotal !== null && (
        <section className="border border-stone-300 bg-white rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3 text-stone-700">方式の比較</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <ComparisonCard
              label="予定申告方式"
              amount={comparison.provisionalTotal}
              favored={comparison.favorableMethod === "provisional"}
            />
            <ComparisonCard
              label="仮決算方式"
              amount={comparison.interimClosingTotal}
              favored={comparison.favorableMethod === "interimClosing"}
            />
          </div>
          <div className="text-sm text-stone-700">
            {comparison.favorableMethod === "equal" && "両方式の納付額は同額です。"}
            {comparison.favorableMethod === "provisional" &&
              `予定申告方式の方が ${formatYen(Math.abs(comparison.savingsFromInterimClosing ?? 0))} 少なく済みます。`}
            {comparison.favorableMethod === "interimClosing" &&
              `仮決算方式の方が ${formatYen(comparison.savingsFromInterimClosing ?? 0)} 少なく済みます。`}
          </div>
        </section>
      )}

      <p className="text-xs text-stone-400 leading-relaxed">
        これは一般的な制度に基づく概算シミュレーションであり、個別の税務相談・助言ではありません。
        中間申告の要否・実際の金額・提出方式の選択は、必ず税務署からの通知または税理士等の専門家にご確認ください。
      </p>
    </div>
  );
}

function ResultTable({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  return (
    <div className="border border-stone-200 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-stone-100">
              <td className="px-3 py-2 text-stone-600">{row.label}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-stone-900">
                {formatYen(row.value)}
              </td>
            </tr>
          ))}
          <tr className="bg-stone-50">
            <td className="px-3 py-2 font-semibold text-stone-900">合計</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-stone-900">{formatYen(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonCard({ label, amount, favored }: { label: string; amount: number; favored: boolean }) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        favored ? "border-emerald-400 bg-emerald-50" : "border-stone-300 bg-white"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-stone-600">{label}</span>
        {favored && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-700 text-white font-medium">有利</span>
        )}
      </div>
      <div className="text-xl font-semibold tabular-nums text-stone-900">{formatYen(amount)}</div>
    </div>
  );
}
