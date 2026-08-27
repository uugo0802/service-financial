"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";
import { Counterparty } from "@/lib/clients/clientMaster";
import {
  ClientSearchResult,
  DocumentSearchResultItem,
  TransactionSearchResult,
  globalSearch,
  groupSearchResultsByKind,
} from "@/lib/search/globalSearch";

// ------------------------------------------------------------------
// テナントに1年分程度の記帳データが蓄積すると、目当ての取引・証憑・取引先が
// どこにあったか思い出せなくなる。この画面は「取引」「証憑」「取引先」を
// 1つのキーワードで横断検索できる場所を提供する（lib/search/globalSearch.ts
// を薄く呼び出すだけの表示専用コンポーネント。documents/page.tsx・
// transactions/page.tsx・clients/page.tsxと同じ構成に合わせている）。
//
// DB未接続の現状に合わせ、このページ専用のサンプルデータを表示する。
// 各エンティティのサンプル値は、横断検索の効果が確認しやすいよう
// 取引先名・摘要をわざと重ねてある（例:「〇〇不動産」は取引・証憑・
// 取引先マスタのいずれにも登場する）。
// ------------------------------------------------------------------

const SAMPLE_TRANSACTIONS: TransactionRow[] = [
  {
    id: "tx-1",
    tenant_id: "sample-tenant",
    date: "2026-06-01",
    description: "事務所家賃",
    amount: -150000,
    account_id: null,
    tax_category: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "〇〇不動産",
    personal_deduction_only: false,
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "tx-2",
    tenant_id: "sample-tenant",
    date: "2026-06-15",
    description: "コンサルティング売上",
    amount: 300000,
    account_id: null,
    tax_category: "課税売上10%",
    confidence: 1,
    source: "rule",
    note: "A社案件",
    personal_deduction_only: false,
    created_at: "2026-06-15T00:00:00Z",
  },
  {
    id: "tx-3",
    tenant_id: "sample-tenant",
    date: "2026-07-01",
    description: "事務用品購入",
    amount: -3000,
    account_id: null,
    tax_category: "課税仕入10%",
    confidence: 0.8,
    source: "ai",
    note: "Amazon",
    personal_deduction_only: false,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "tx-4",
    tenant_id: "sample-tenant",
    date: "2026-07-20",
    description: "顧問料入金",
    amount: 220000,
    account_id: null,
    tax_category: "課税売上10%",
    confidence: 1,
    source: "rule",
    note: "C社案件",
    personal_deduction_only: false,
    created_at: "2026-07-20T00:00:00Z",
  },
];

const SAMPLE_DOCUMENTS: DocumentWithTransaction[] = [
  {
    id: "doc-1",
    tenant_id: "sample-tenant",
    transaction_id: "tx-1",
    storage_path: "sample-tenant/2026/06/rent-receipt-202606.jpg",
    uploaded_at: "2026-06-02T09:15:00Z",
    transaction: {
      date: "2026-06-01",
      description: "事務所家賃",
      amount: -150000,
      counterparty: "〇〇不動産",
    },
  },
  {
    id: "doc-2",
    tenant_id: "sample-tenant",
    transaction_id: "tx-2",
    storage_path: "sample-tenant/2026/06/invoice-a-corp-0615.pdf",
    uploaded_at: "2026-06-16T10:30:00Z",
    transaction: {
      date: "2026-06-15",
      description: "コンサルティング売上",
      amount: 300000,
      counterparty: "A社案件",
    },
  },
  {
    id: "doc-3",
    tenant_id: "sample-tenant",
    transaction_id: "tx-3",
    storage_path: "sample-tenant/2026/07/amazon-receipt-0701.jpg",
    uploaded_at: "2026-07-01T18:42:00Z",
    transaction: {
      date: "2026-07-01",
      description: "事務用品購入",
      amount: -3000,
      counterparty: "Amazon",
    },
  },
  {
    id: "doc-4",
    tenant_id: "sample-tenant",
    transaction_id: null,
    storage_path: "sample-tenant/2026/07/scan-0042-unlabeled.jpg",
    uploaded_at: "2026-07-22T08:03:00Z",
    transaction: null,
  },
];

const SAMPLE_CLIENTS: Counterparty[] = [
  {
    id: "cp-1",
    name: "〇〇不動産",
    kind: "vendor",
    defaultAccountName: "地代家賃",
    invoiceRegistrationNumber: undefined,
    notes: "事務所賃借。免税事業者のため登録番号なし",
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
  },
  {
    id: "cp-2",
    name: "A社",
    kind: "client",
    defaultAccountName: "売上高",
    invoiceRegistrationNumber: "T2120901007402",
    notes: "コンサルティング案件の売上先",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "cp-3",
    name: "合同会社パートナーズ",
    kind: "vendor",
    defaultAccountName: "外注費",
    invoiceRegistrationNumber: "T7000012050002",
    notes: undefined,
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
  },
];

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const KIND_SECTIONS: {
  kind: "transaction" | "document" | "client";
  label: string;
  emptyMessage: string;
}[] = [
  { kind: "transaction", label: "取引", emptyMessage: "一致する取引はありませんでした。" },
  { kind: "document", label: "証憑（レシート・請求書）", emptyMessage: "一致する証憑はありませんでした。" },
  { kind: "client", label: "取引先", emptyMessage: "一致する取引先はありませんでした。" },
];

function AmountText({ amount }: { amount: number }) {
  return (
    <span
      className={
        amount < 0 ? "text-stone-700 dark:text-stone-200 tabular-nums" : "text-emerald-700 dark:text-emerald-400 tabular-nums"
      }
    >
      {yen.format(amount)}
      <span className="text-xs text-stone-400 dark:text-stone-500"> 円</span>
    </span>
  );
}

function TransactionResultRow({ result }: { result: TransactionSearchResult }) {
  return (
    <li className="border-b border-stone-100 last:border-0 dark:border-stone-800">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50 transition-colors dark:hover:bg-stone-800 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-stone-900 dark:text-stone-50">{result.title}</span>
          {result.subtitle && <span className="text-xs text-stone-500 dark:text-stone-400">{result.subtitle}</span>}
        </span>
        <span className="flex items-baseline gap-3 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
          <span className="tabular-nums">{result.sortDate}</span>
          <AmountText amount={result.amount} />
        </span>
      </Link>
    </li>
  );
}

function DocumentResultRow({ result }: { result: DocumentSearchResultItem }) {
  return (
    <li className="border-b border-stone-100 last:border-0 dark:border-stone-800">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50 transition-colors dark:hover:bg-stone-800 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-stone-900 dark:text-stone-50">{result.title}</span>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {result.subtitle && <>{result.subtitle} ／ </>}
            {result.fileName}
          </span>
        </span>
        <span className="flex items-baseline gap-3 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
          <span className="tabular-nums">{result.sortDate}</span>
          <AmountText amount={result.amount} />
        </span>
      </Link>
    </li>
  );
}

function ClientResultRow({ result }: { result: ClientSearchResult }) {
  return (
    <li className="border-b border-stone-100 last:border-0 dark:border-stone-800">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50 transition-colors dark:hover:bg-stone-800 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-stone-900 dark:text-stone-50">{result.title}</span>
          {result.subtitle && <span className="text-xs text-stone-500 dark:text-stone-400">{result.subtitle}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function SearchPage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "横断検索｜決算書作成から税務申告までワンクリック（スグル）";
  }, []);

  const results = useMemo(
    () =>
      globalSearch(query, {
        transactions: SAMPLE_TRANSACTIONS,
        documents: SAMPLE_DOCUMENTS,
        clients: SAMPLE_CLIENTS,
      }),
    [query]
  );
  const grouped = useMemo(() => groupSearchResultsByKind(results), [results]);
  const hasSearched = query.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(queryInput);
  }

  function handleClear() {
    setQueryInput("");
    setQuery("");
  }

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500 dark:text-stone-400">横断検索</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">取引・証憑・取引先を横断検索する</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            1つのキーワードで、取引明細・証憑（レシート・請求書）・取引先マスタをまとめて検索します。
            より詳しい条件（日付・金額の範囲など）で絞り込みたい場合は、それぞれの検索画面（
            <Link href="/transactions" className="underline hover:no-underline">
              取引検索
            </Link>
            ・
            <Link href="/documents" className="underline hover:no-underline">
              証憑検索
            </Link>
            ・
            <Link href="/clients" className="underline hover:no-underline">
              取引先マスタ
            </Link>
            ）をご利用ください。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border border-stone-300 bg-white p-5 flex flex-col gap-4 dark:border-stone-700 dark:bg-stone-900"
          noValidate
        >
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-stone-400">
            キーワード
            <input
              type="text"
              placeholder="例: 〇〇不動産、A社案件、Amazon など"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600 dark:border-stone-600 dark:bg-stone-900"
              autoFocus
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
            >
              検索
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-sm px-5 py-2.5 border border-stone-400 bg-white hover:border-stone-600 transition-colors dark:border-stone-600 dark:bg-stone-900 dark:hover:border-stone-400"
            >
              条件をクリア
            </button>
          </div>
        </form>

        {!hasSearched ? (
          <p className="text-sm text-stone-500 dark:text-stone-400 border border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-6 text-center">
            キーワードを入力して検索してください。
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <h2 className="text-sm text-stone-500 dark:text-stone-400">
              検索結果 <span className="font-medium text-stone-700 dark:text-stone-200">{results.length}件</span>
              <span className="text-stone-400 dark:text-stone-500">
                {" "}
                （取引{grouped.transaction.length}件・証憑{grouped.document.length}件・取引先{grouped.client.length}件）
              </span>
            </h2>

            {results.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-stone-400 border border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-6 text-center">
                「{query}」に一致する取引・証憑・取引先が見つかりませんでした。キーワードを見直してください。
              </p>
            ) : (
              KIND_SECTIONS.map((section) => {
                const items = grouped[section.kind];
                return (
                  <section key={section.kind} className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                      {section.label} <span className="text-stone-400 dark:text-stone-500">（{items.length}件）</span>
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-sm text-stone-400 dark:text-stone-500 px-4 py-3 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
                        {section.emptyMessage}
                      </p>
                    ) : (
                      <ul className="border border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900">
                        {section.kind === "transaction" &&
                          grouped.transaction.map((result) => <TransactionResultRow key={result.id} result={result} />)}
                        {section.kind === "document" &&
                          grouped.document.map((result) => <DocumentResultRow key={result.id} result={result} />)}
                        {section.kind === "client" &&
                          grouped.client.map((result) => <ClientResultRow key={result.id} result={result} />)}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </div>
        )}
      </PageContainer>

      <footer className="border-t border-stone-300 bg-white mt-4 dark:border-stone-700 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データ・証憑データ・取引先データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
