"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { TransactionSearchForm } from "@/components/TransactionSearchForm";
import { CsvColumnMapper } from "@/components/CsvColumnMapper";
import { BulkCsvJournalImportForm } from "@/components/BulkCsvJournalImportForm";
import { useTransactionRows } from "@/hooks/useTransactionRows";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。実データ（transactionsテーブル）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （reconcile/rule-backfill等と同じuseTransactionRowsフック経由）。
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
    date: "2026-07-10",
    description: "打合せ会食",
    amount: -8200,
    account_id: null,
    tax_category: "課税仕入10%",
    confidence: 0.6,
    source: "ai",
    note: "B社担当者と",
    personal_deduction_only: false,
    created_at: "2026-07-10T00:00:00Z",
  },
  {
    id: "tx-5",
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
  {
    id: "tx-6",
    tenant_id: "sample-tenant",
    date: "2026-07-25",
    description: "寄付",
    amount: -10000,
    account_id: null,
    tax_category: "対象外",
    confidence: 1,
    source: "uncategorized",
    note: null,
    personal_deduction_only: false,
    created_at: "2026-07-25T00:00:00Z",
  },
];

export function TransactionsClient() {
  const { transactions, isSampleData } = useTransactionRows(SAMPLE_TRANSACTIONS);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">取引を検索する</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            電子帳簿保存法で求められる「取引年月日・取引金額・取引先」による検索に対応した画面です。
            条件を指定して記帳データを絞り込み、確認・エクスポートなどにご利用ください。
          </p>
          <p className="text-xs text-muted-foreground">
            {isSampleData ? "現在はサンプルデータを表示しています。" : "記帳された実データ（当期の取引）を表示しています。"}
          </p>
        </div>

        {/*
          TransactionSearchFormはtransactionsプロップをuseStateの初期値として取り込むのではなく、
          useMemo(() => filterTransactions(transactions, appliedFilters), [transactions, appliedFilters])
          で毎回算出している（BulkReapplyRulesPanelのようにpropsを一度だけ取り込む作りではない）ため、
          transactionsが差し替わればそのまま再計算される。rule-backfill/page.tsxのような
          isSampleDataをkeyにした強制リマウントは不要と判断した。
        */}
        <TransactionSearchForm transactions={transactions} />

        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground">明細CSVの取込（対応銀行が一覧に無い場合）</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            住信SBIネット銀行・楽天銀行・GMOあおぞらネット銀行・三井住友カード・楽天カードなど、
            対応済みの主要な銀行・カード会社であればCSVの列名を自動判定して取り込めます。
            それ以外の銀行・カード会社をお使いの場合や自動判定がうまくいかない場合は、以下からCSVの列をご自身で指定して取り込めます。
          </p>
          <CsvColumnMapper />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground">過去の明細CSVをまとめて記帳する（複数ファイル一括アップロード）</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            期首以降、月をまたいで溜まっている銀行・カードの明細CSVを一度に複数ファイル選択して取り込めます。
            ファイルごとに順番にルールベース/AI分類を行い、結果をまとめてプレビューしたうえで、
            指定した現金・預金勘定と組み合わせて記帳データ（journal_entries）として保存します。
          </p>
          <BulkCsvJournalImportForm />
        </div>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
