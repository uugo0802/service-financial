"use client";

import { useMemo, useState } from "react";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { TransactionSearchFilters, filterTransactions } from "@/lib/db/transactionSearch";

// ------------------------------------------------------------------
// 電子帳簿保存法が求める「取引年月日・取引金額・取引先」検索を満たす
// 検索フォーム＋結果一覧。取引データはprops経由で受け取り、フィルタは
// クライアント側でその場（in-memory）に適用する（表示専用コンポーネント）。
// ------------------------------------------------------------------

interface TransactionSearchFormProps {
  transactions: TransactionRow[];
}

type FormFilters = {
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  keyword: string;
};

const EMPTY_FORM_FILTERS: FormFilters = {
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
  keyword: "",
};

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function toSearchFilters(form: FormFilters): TransactionSearchFilters {
  const filters: TransactionSearchFilters = {};
  if (form.dateFrom) filters.dateFrom = form.dateFrom;
  if (form.dateTo) filters.dateTo = form.dateTo;
  if (form.minAmount !== "" && !Number.isNaN(Number(form.minAmount))) filters.minAmount = Number(form.minAmount);
  if (form.maxAmount !== "" && !Number.isNaN(Number(form.maxAmount))) filters.maxAmount = Number(form.maxAmount);
  if (form.keyword.trim()) filters.keyword = form.keyword;
  return filters;
}

export function TransactionSearchForm({ transactions }: TransactionSearchFormProps) {
  const [form, setForm] = useState<FormFilters>(EMPTY_FORM_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TransactionSearchFilters>({});

  const results = useMemo(() => filterTransactions(transactions, appliedFilters), [transactions, appliedFilters]);

  function set<K extends keyof FormFilters>(key: K, value: FormFilters[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters(toSearchFilters(form));
  }

  function handleReset() {
    setForm(EMPTY_FORM_FILTERS);
    setAppliedFilters({});
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="border border-border bg-surface p-5 flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            取引年月日（開始）
            <input
              type="date"
              value={form.dateFrom}
              onChange={(e) => set("dateFrom", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            取引年月日（終了）
            <input
              type="date"
              value={form.dateTo}
              onChange={(e) => set("dateTo", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            取引金額（下限）
            <input
              type="text"
              inputMode="decimal"
              placeholder="例: -50000"
              value={form.minAmount}
              onChange={(e) => set("minAmount", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            取引金額（上限）
            <input
              type="text"
              inputMode="decimal"
              placeholder="例: 500000"
              value={form.maxAmount}
              onChange={(e) => set("maxAmount", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            取引先・摘要キーワード
            <input
              type="text"
              placeholder="例: 事務所家賃、A社案件 など"
              value={form.keyword}
              onChange={(e) => set("keyword", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors"
          >
            検索
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm px-5 py-2.5 border border-border bg-surface hover:border-foreground/40 transition-colors"
          >
            条件をクリア
          </button>
        </div>
      </form>

      <div>
        <h2 className="text-sm text-muted-foreground mb-3">
          検索結果 <span className="font-medium text-foreground">{results.length}件</span>
          <span className="text-muted-foreground">（全{transactions.length}件中）</span>
        </h2>

        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
            条件に一致する取引が見つかりませんでした。日付・金額・キーワードの条件を見直してください。
          </p>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">取引年月日</th>
                  <th className="px-3 py-2 font-normal">取引先・摘要</th>
                  <th className="px-3 py-2 font-normal text-right">取引金額</th>
                  <th className="px-3 py-2 font-normal">消費税区分</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.date}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={row.note ?? row.description}>
                      {row.description}
                      {row.note && <span className="text-muted-foreground"> ／ {row.note}</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.amount < 0 ? "text-foreground" : "text-emerald-700"
                      }`}
                    >
                      {yen.format(row.amount)}
                      <span className="text-xs text-muted-foreground"> 円</span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{row.tax_category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        表示内容は記帳データを条件で絞り込んだものであり、正式な税務代理・個別税務相談ではありません。
        内容はご自身の確認のうえご利用ください。
      </p>
    </div>
  );
}
