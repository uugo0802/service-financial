"use client";

import { useMemo, useState } from "react";
import {
  DocumentSearchFilters,
  DocumentWithTransaction,
  countUnlinkedDocuments,
  extractFileNameFromStoragePath,
  filterDocuments,
  isUnlinkedDocument,
} from "@/lib/documents/documentSearch";
import { selectPrintVisibleFields } from "@/lib/export/printLayout";

// ------------------------------------------------------------------
// 電子帳簿保存法（docs/cto-tech-architecture.md 4.1節）が求める
// 「取引年月日・取引金額・取引先」による証憑（レシート・請求書）検索と、
// 「可視性確保」（ディスプレイ・書面への出力）に対応した検索フォーム＋
// 結果一覧＋印刷用ビュー。TransactionSearchForm.tsxと同じ
// 「propsで証憑一覧を受け取り、クライアント側でその場（in-memory）に
// フィルタを適用する」表示専用コンポーネントの構成に合わせている。
//
// リンク先の取引が無い証憑は取引年月日・金額・取引先を照合できないため、
// 検索条件を絞り込むと結果から外れてしまう（documentSearch.tsのfilterDocuments
// を参照）。見落としを防ぐため、常に「未紐付けの証憑」件数を明示し、
// 一覧表示（フィルタ未適用時）でもバッジで目立たせる。
//
// 印刷／PDF保存は他画面（PrintableStatementLayout.tsx・InvoicePrintLayout.tsx）
// と同じ「window.print()に頼ったブラウザ標準の印刷/PDF保存」方式を踏襲し、
// 新規PDFライブラリへの依存を増やさない。ヘッダー項目の組み立てには
// src/lib/export/printLayout.ts の selectPrintVisibleFields を再利用する。
// ------------------------------------------------------------------

interface DocumentSearchFormProps {
  documents: DocumentWithTransaction[];
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

/**
 * 印刷書面のフッターに常時表示する注記文。TransactionSearchForm.tsx側の画面と同じ
 * 「下書き・シミュレーションであり税務代理等ではない」という法的位置づけに加え、
 * このページ固有の注意点（未紐付け証憑は取引年月日・金額・取引先を確認できない旨）
 * を明記する。削除・非表示にする手段はUI上に用意しない。
 */
const DOCUMENT_PRINT_NOTICE =
  "本書面は電子帳簿保存法が求める「取引年月日・取引金額・取引先」による証憑（レシート・請求書）検索結果の書面出力です。" +
  "取引明細と紐付いていない証憑（「未紐付け」表示）は取引年月日・金額・取引先を照合できないため、内容はご自身でご確認ください。" +
  "当社が税務代理・税務書類の作成・税務相談を行うものではありません。";

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function toSearchFilters(form: FormFilters): DocumentSearchFilters {
  const filters: DocumentSearchFilters = {};
  if (form.dateFrom) filters.dateFrom = form.dateFrom;
  if (form.dateTo) filters.dateTo = form.dateTo;
  if (form.minAmount !== "" && !Number.isNaN(Number(form.minAmount))) filters.minAmount = Number(form.minAmount);
  if (form.maxAmount !== "" && !Number.isNaN(Number(form.maxAmount))) filters.maxAmount = Number(form.maxAmount);
  if (form.keyword.trim()) filters.keyword = form.keyword;
  return filters;
}

export function DocumentSearchForm({ documents }: DocumentSearchFormProps) {
  const [form, setForm] = useState<FormFilters>(EMPTY_FORM_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DocumentSearchFilters>({});
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);

  const filtered = useMemo(() => filterDocuments(documents, appliedFilters), [documents, appliedFilters]);
  const results = useMemo(
    () => (unlinkedOnly ? filtered.filter(isUnlinkedDocument) : filtered),
    [filtered, unlinkedOnly]
  );
  const totalUnlinkedCount = useMemo(() => countUnlinkedDocuments(documents), [documents]);
  const resultUnlinkedCount = useMemo(() => countUnlinkedDocuments(results), [results]);

  const printHeaderFields = selectPrintVisibleFields([
    { key: "total", label: "証憑総数", value: `${documents.length}件` },
    { key: "results", label: "検索結果", value: `${results.length}件` },
    { key: "unlinked", label: "うち未紐付け", value: `${resultUnlinkedCount}件` },
  ]);

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
    setUnlinkedOnly(false);
  }

  return (
    <div className="document-search-form flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="border border-border bg-surface p-5 flex flex-col gap-4 print:hidden dark:border-stone-700 dark:bg-stone-900"
        noValidate
      >
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

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={unlinkedOnly}
            onChange={(e) => setUnlinkedOnly(e.target.checked)}
            className="h-4 w-4"
          />
          未紐付けの証憑のみ表示する（取引と照合できていないスキャンを確認する）
        </label>

        <div className="flex flex-wrap gap-3">
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
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm px-5 py-2.5 border border-border bg-surface hover:border-foreground/40 transition-colors ml-auto dark:border-stone-600 dark:bg-stone-900 dark:hover:border-stone-400"
          >
            印刷 / PDFで保存
          </button>
        </div>
      </form>

      {totalUnlinkedCount > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          未紐付けの証憑が <span className="font-semibold">{totalUnlinkedCount}件</span>{" "}
          あります。取引と紐付いていない証憑は取引年月日・取引金額・取引先で検索できず、電子帳簿保存法が求める可視性確保の対象外になるおそれがあります。該当の証憑を取引に紐付けてください。
        </div>
      )}

      {/* 画面表示用の見出し（印刷時は下の固定ヘッダーに置き換わるため隠す） */}
      <h2 className="text-sm text-muted-foreground print:hidden">
        検索結果 <span className="font-medium text-foreground">{results.length}件</span>
        <span className="text-muted-foreground">（全{documents.length}件中</span>
        {resultUnlinkedCount > 0 && (
          <span className="text-amber-700 dark:text-amber-400">、うち未紐付け{resultUnlinkedCount}件</span>
        )}
        <span className="text-muted-foreground">）</span>
      </h2>

      {/* 印刷時のみ表示する固定ヘッダー。各ページの先頭に繰り返し表示される。 */}
      <div className="hidden print:fixed print:inset-x-0 print:top-0 print:z-10 print:flex print:flex-wrap print:items-baseline print:justify-between print:gap-x-6 print:border-b print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-[9pt] print:text-stone-800">
        {printHeaderFields.map((field) => (
          <span key={field.key}>
            {field.label}: {field.value}
          </span>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
          条件に一致する証憑が見つかりませんでした。日付・金額・キーワードの条件を見直してください。
        </p>
      ) : (
        <div className="overflow-x-auto border border-border bg-surface print:mx-auto print:w-[186mm] print:border-0 print:pt-[14mm] print:pb-[18mm] dark:border-stone-700 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground text-xs">
                <th className="px-3 py-2 font-normal">取引年月日</th>
                <th className="px-3 py-2 font-normal">取引先・摘要</th>
                <th className="px-3 py-2 font-normal text-right">取引金額</th>
                <th className="px-3 py-2 font-normal">保存ファイル</th>
                <th className="px-3 py-2 font-normal">アップロード日時</th>
                <th className="px-3 py-2 font-normal">状態</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => {
                const unlinked = isUnlinkedDocument(row);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 last:border-0 print:break-inside-avoid dark:border-stone-800"
                  >
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {unlinked ? <span className="text-muted-foreground">－</span> : row.transaction!.date}
                    </td>
                    <td
                      className="px-3 py-2 max-w-xs truncate"
                      title={unlinked ? undefined : row.transaction!.counterparty ?? row.transaction!.description}
                    >
                      {unlinked ? (
                        <span className="text-muted-foreground">－</span>
                      ) : (
                        <>
                          {row.transaction!.description}
                          {row.transaction!.counterparty && (
                            <span className="text-muted-foreground"> ／ {row.transaction!.counterparty}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        unlinked
                          ? "text-muted-foreground"
                          : row.transaction!.amount < 0
                            ? "text-foreground"
                            : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {unlinked ? "－" : (
                        <>
                          {yen.format(row.transaction!.amount)}
                          <span className="text-xs text-muted-foreground"> 円</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[12rem] truncate" title={row.storage_path}>
                      {extractFileNameFromStoragePath(row.storage_path)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.uploaded_at.slice(0, 10)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {unlinked ? (
                        <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                          未紐付け
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">紐付け済み</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground print:hidden">
        表示内容は証憑データを条件で絞り込んだものであり、正式な税務代理・個別税務相談ではありません。
        内容はご自身の確認のうえご利用ください。
      </p>

      {/* 印刷時のみ表示する固定フッター。このフッターを非表示にするUI操作は用意しない。 */}
      <div className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:border-t print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-center print:text-[7.5pt] print:leading-snug print:text-stone-700">
        {DOCUMENT_PRINT_NOTICE}
      </div>
    </div>
  );
}
