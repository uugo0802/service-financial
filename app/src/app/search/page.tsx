"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";
import { Counterparty } from "@/lib/clients/clientMaster";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listCounterparties } from "@/lib/db/clients";
import { listInvoices } from "@/lib/db/invoices";
import { loadTransactionsForCurrentTenant } from "@/lib/db/transactions";
import { loadDocumentsWithTransactionsForCurrentTenant } from "@/lib/db/documentsWithTransactions";
import {
  ClientSearchResult,
  DocumentSearchResultItem,
  InvoiceSearchResult,
  TransactionSearchResult,
  globalSearch,
  groupSearchResultsByKind,
} from "@/lib/search/globalSearch";
import { PageTitle } from "@/components/ui/PageTitle";

// ------------------------------------------------------------------
// テナントに1年分程度の記帳データが蓄積すると、目当ての取引・証憑・取引先・請求書が
// どこにあったか思い出せなくなる。この画面は「取引」「証憑」「取引先」「請求書」を
// 1つのキーワードで横断検索できる場所を提供する（lib/search/globalSearch.ts
// を薄く呼び出すだけの表示専用コンポーネント。documents/page.tsx・
// transactions/page.tsx・clients/page.tsxと同じ構成に合わせている）。
//
// 各エンティティのサンプル値は、横断検索の効果が確認しやすいよう取引先名・摘要を
// わざと重ねてある（例:「〇〇不動産」は取引・証憑・取引先マスタのいずれにも登場する）。
// 取引（transactions/page.tsxと同じlib/db/transactions.ts）・証憑（documents/page.tsxと
// 同じlib/db/documentsWithTransactions.ts）・取引先マスタ（lib/db/clients.ts）・
// 請求書（lib/db/invoices.ts）はいずれも実装済みのため、実データに接続する
// （テナント未解決時はこのページ専用のサンプルデータのまま表示する）。
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

const SAMPLE_INVOICES: ReceivableInvoiceInput[] = [
  {
    invoiceNumber: "INV-20260615-0001",
    clientName: "A社",
    issueDate: "2026-06-15",
    dueDate: "2026-07-15",
    grandTotal: 300000,
    paidAt: undefined,
    paidAmount: undefined,
  },
  {
    invoiceNumber: "INV-20260701-0002",
    clientName: "合同会社パートナーズ",
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    grandTotal: 165000,
    paidAt: "2026-07-20",
    paidAmount: 165000,
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
  kind: "transaction" | "document" | "client" | "invoice";
  label: string;
  emptyMessage: string;
}[] = [
  { kind: "transaction", label: "取引", emptyMessage: "一致する取引はありませんでした。" },
  { kind: "document", label: "証憑（レシート・請求書）", emptyMessage: "一致する証憑はありませんでした。" },
  { kind: "client", label: "取引先", emptyMessage: "一致する取引先はありませんでした。" },
  { kind: "invoice", label: "請求書", emptyMessage: "一致する請求書はありませんでした。" },
];

function AmountText({ amount }: { amount: number }) {
  return (
    <span
      className={
        amount < 0 ? "text-foreground tabular-nums" : "text-emerald-700 dark:text-emerald-400 tabular-nums"
      }
    >
      {yen.format(amount)}
      <span className="text-xs text-muted-foreground"> 円</span>
    </span>
  );
}

function TransactionResultRow({ result }: { result: TransactionSearchResult }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-foreground">{result.title}</span>
          {result.subtitle && <span className="text-xs text-muted-foreground">{result.subtitle}</span>}
        </span>
        <span className="flex items-baseline gap-3 text-xs text-muted-foreground whitespace-nowrap">
          <span className="tabular-nums">{result.sortDate}</span>
          <AmountText amount={result.amount} />
        </span>
      </Link>
    </li>
  );
}

function DocumentResultRow({ result }: { result: DocumentSearchResultItem }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-foreground">{result.title}</span>
          <span className="text-xs text-muted-foreground">
            {result.subtitle && <>{result.subtitle} ／ </>}
            {result.fileName}
          </span>
        </span>
        <span className="flex items-baseline gap-3 text-xs text-muted-foreground whitespace-nowrap">
          <span className="tabular-nums">{result.sortDate}</span>
          <AmountText amount={result.amount} />
        </span>
      </Link>
    </li>
  );
}

function ClientResultRow({ result }: { result: ClientSearchResult }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-foreground">{result.title}</span>
          {result.subtitle && <span className="text-xs text-muted-foreground">{result.subtitle}</span>}
        </span>
      </Link>
    </li>
  );
}

function InvoiceResultRow({ result }: { result: InvoiceSearchResult }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={result.href}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="text-sm text-foreground">{result.title}</span>
          {result.subtitle && <span className="text-xs text-muted-foreground">{result.subtitle}</span>}
        </span>
        <span className="flex items-baseline gap-3 text-xs text-muted-foreground whitespace-nowrap">
          <span className="tabular-nums">{result.sortDate}</span>
          <AmountText amount={result.amount} />
        </span>
      </Link>
    </li>
  );
}

export default function SearchPage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  const [transactions, setTransactions] = useState<TransactionRow[]>(SAMPLE_TRANSACTIONS);
  const [documents, setDocuments] = useState<DocumentWithTransaction[]>(SAMPLE_DOCUMENTS);
  const [clients, setClients] = useState<Counterparty[]>(SAMPLE_CLIENTS);
  const [isSampleClients, setIsSampleClients] = useState(true);
  const [invoices, setInvoices] = useState<ReceivableInvoiceInput[]>(SAMPLE_INVOICES);
  const [isSampleInvoices, setIsSampleInvoices] = useState(true);

  useEffect(() => {
    document.title = "横断検索｜決算書作成から税務申告までワンクリック（スグル）";
  }, []);

  useEffect(() => {
    let cancelled = false;
    // login/page.tsx・settings/security/page.tsx と同様、getSupabaseClient() の
    // 同期的な例外をエフェクト本体で直接投げさせないよう、マイクロタスク経由で呼び出す。
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (!tenantUser || cancelled) return; // 未ログイン・未所属の場合はサンプルのまま
        const [clientRecords, invoiceRecords, transactionRecords, documentRecords] = await Promise.all([
          listCounterparties(tenantUser.tenant_id),
          listInvoices(tenantUser.tenant_id),
          loadTransactionsForCurrentTenant(),
          loadDocumentsWithTransactionsForCurrentTenant(),
        ]);
        if (!cancelled) {
          setClients(clientRecords);
          setIsSampleClients(false);
          setInvoices(invoiceRecords);
          setIsSampleInvoices(false);
          if (transactionRecords) setTransactions(transactionRecords);
          if (documentRecords) setDocuments(documentRecords);
        }
      } catch {
        // Supabaseが未設定（開発中のプロトタイプ）。サンプルデータのまま表示する。
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () =>
      globalSearch(query, {
        transactions,
        documents,
        clients,
        invoices,
      }),
    [query, transactions, documents, clients, invoices]
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
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">取引・証憑・取引先・請求書を横断検索する</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            1つのキーワードで、取引明細・証憑（レシート・請求書）・取引先マスタ・発行済み請求書をまとめて検索します。
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
            ・
            <Link href="/invoices" className="underline hover:no-underline">
              請求書発行
            </Link>
            ）をご利用ください。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border border-border bg-surface p-5 flex flex-col gap-4"
          noValidate
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            キーワード
            <input
              type="text"
              placeholder="例: 〇〇不動産、A社案件、Amazon など"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
              autoFocus
            />
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
              onClick={handleClear}
              className="text-sm px-5 py-2.5 border border-border bg-surface hover:border-foreground/40 transition-colors"
            >
              条件をクリア
            </button>
          </div>
        </form>

        {!hasSearched ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
            キーワードを入力して検索してください。
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <h2 className="text-sm text-muted-foreground">
              検索結果 <span className="font-medium text-foreground">{results.length}件</span>
              <span className="text-muted-foreground">
                {" "}
                （取引{grouped.transaction.length}件・証憑{grouped.document.length}件・取引先{grouped.client.length}件・請求書
                {grouped.invoice.length}件）
              </span>
            </h2>

            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
                「{query}」に一致する取引・証憑・取引先・請求書が見つかりませんでした。キーワードを見直してください。
              </p>
            ) : (
              KIND_SECTIONS.map((section) => {
                const items = grouped[section.kind];
                return (
                  <section key={section.kind} className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.label} <span className="text-muted-foreground">（{items.length}件）</span>
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-4 py-3 border border-border bg-surface">
                        {section.emptyMessage}
                      </p>
                    ) : (
                      <ul className="border border-border bg-surface">
                        {section.kind === "transaction" &&
                          grouped.transaction.map((result) => <TransactionResultRow key={result.id} result={result} />)}
                        {section.kind === "document" &&
                          grouped.document.map((result) => <DocumentResultRow key={result.id} result={result} />)}
                        {section.kind === "client" &&
                          grouped.client.map((result) => <ClientResultRow key={result.id} result={result} />)}
                        {section.kind === "invoice" &&
                          grouped.invoice.map((result) => <InvoiceResultRow key={result.id} result={result} />)}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </div>
        )}
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データ・証憑データ・取引先データ・請求書データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
          取引・証憑はサンプルデータです。取引先は
          {isSampleClients ? "サンプルデータを表示しています（Supabase未接続、または未ログインのため）。" : "登録済みの内容（Supabase）を表示しています。"}
          請求書は
          {isSampleInvoices ? "サンプルデータを表示しています（Supabase未接続、または未ログインのため）。" : "登録済みの内容（Supabase）を表示しています。"}
        </div>
      </footer>
    </div>
  );
}
