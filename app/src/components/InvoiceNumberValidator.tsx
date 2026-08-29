"use client";

// インボイス登録番号の形式チェックと、仕入税額控除可否のルールベース判定結果を表示するための
// スタンドアロンなUIコンポーネント。
//
// 注意: このコンポーネントは現時点でどの画面にも組み込まれていない（既存画面への統合はしない方針）。
// `src/lib/categorize/invoiceValidation.ts` のロジックの動作確認・将来の画面組み込み用の
// 独立したビルディングブロックとして提供する。

import { useMemo, useState } from "react";
import { TAX_CATEGORIES, TaxCategory } from "@/lib/categorize/dictionary";
import {
  INVOICE_VALIDATION_DISCLAIMER,
  determineDeductionEligibility,
} from "@/lib/categorize/invoiceValidation";

const PURCHASE_TAX_CATEGORIES: TaxCategory[] = TAX_CATEGORIES.filter((c) =>
  c.startsWith("課税仕入")
);

const NON_PURCHASE_TAX_CATEGORIES: TaxCategory[] = TAX_CATEGORIES.filter(
  (c) => !c.startsWith("課税仕入")
);

export function InvoiceNumberValidator() {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [taxCategory, setTaxCategory] = useState<TaxCategory>("課税仕入10%");
  const [transactionDate, setTransactionDate] = useState("");

  const result = useMemo(
    () =>
      determineDeductionEligibility({
        taxCategory,
        invoiceNumber,
        transactionDate: transactionDate || undefined,
      }),
    [invoiceNumber, taxCategory, transactionDate]
  );

  const statusStyle: Record<string, string> = {
    eligible: "border-emerald-700 bg-emerald-50 text-emerald-900",
    transitional: "border-amber-700 bg-amber-50 text-amber-900",
    ineligible: "border-red-700 bg-red-50 text-red-900",
    not_applicable: "border-stone-400 bg-stone-50 text-foreground",
  };

  const statusLabel: Record<string, string> = {
    eligible: "仕入税額控除の対象となりえます（登録番号の形式は正しく確認できました）",
    transitional: "経過措置により一部控除が可能な期間です",
    ineligible: "原則として仕入税額控除の対象外です",
    not_applicable: "この税区分は仕入税額控除の判定対象外です",
  };

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="invoice-number">
          取引先のインボイス登録番号
        </label>
        <input
          id="invoice-number"
          type="text"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="T1234567890123"
          className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40 font-mono"
        />
        {!result.numberFormat.valid && result.numberFormat.reason && (
          <p className="mt-1 text-xs text-red-700">{result.numberFormat.reason}</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="invoice-tax-category">
            税区分
          </label>
          <select
            id="invoice-tax-category"
            value={taxCategory}
            onChange={(e) => setTaxCategory(e.target.value as TaxCategory)}
            className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          >
            <optgroup label="課税仕入（控除判定の対象）">
              {PURCHASE_TAX_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
            <optgroup label="その他（判定対象外）">
              {NON_PURCHASE_TAX_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="invoice-tx-date">
            取引日（経過措置の判定に使用）
          </label>
          <input
            id="invoice-tx-date"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          />
        </div>
      </div>

      <div className={`border p-4 text-sm ${statusStyle[result.eligibility]}`}>
        <p className="font-semibold mb-1">{statusLabel[result.eligibility]}</p>
        {result.eligibility !== "not_applicable" && (
          <p className="text-xs mb-1">控除可能割合の目安: {result.deductibleRatio}%</p>
        )}
        {result.warning && <p className="text-xs">{result.warning}</p>}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{INVOICE_VALIDATION_DISCLAIMER}</p>
    </div>
  );
}
