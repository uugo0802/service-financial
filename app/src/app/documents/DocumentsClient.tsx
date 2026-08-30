"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import Link from "next/link";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";
import { DocumentSearchForm } from "@/components/DocumentSearchForm";
import { useDocuments } from "@/hooks/useDocuments";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。電子帳簿保存法（docs/cto-tech-architecture.md 4.1節）が
// 求める証憑の「取引年月日・取引金額・取引先」検索と「可視性確保（書面への出力）」の
// 動作確認用で、実データ取得前・未ログイン・Supabase未設定時のフォールバック表示として使う
// （useDocuments経由。reconcile/ReconcileClient.tsx等と同じ「isSampleDataフォールバック」方針）。
// transactions/page.tsxのSAMPLE_TRANSACTIONSと対になる想定の取引を証憑側に持たせている。
//
// 注（要ユーザー確認）: 実データ接続時、リンク先取引の counterparty（取引先）は
// journal_entries・accounts のどちらにも取引先に相当する列が存在しないため常にnullになる
// （lib/db/documentsWithTransactions.ts参照）。サンプルデータのcounterpartyはこの制約が
// 無かった頃の表示イメージとして残しているが、実データでは取引先列は表示されない。
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
    transaction_id: "tx-4",
    storage_path: "sample-tenant/2026/07/meeting-meal-receipt-0710.jpg",
    uploaded_at: "2026-07-10T21:05:00Z",
    transaction: {
      date: "2026-07-10",
      description: "打合せ会食",
      amount: -8200,
      counterparty: "B社担当者と",
    },
  },
  {
    id: "doc-5",
    tenant_id: "sample-tenant",
    transaction_id: null,
    storage_path: "sample-tenant/2026/07/scan-0042-unlabeled.jpg",
    uploaded_at: "2026-07-22T08:03:00Z",
    transaction: null,
  },
  {
    id: "doc-6",
    tenant_id: "sample-tenant",
    transaction_id: null,
    storage_path: "sample-tenant/2026/07/camera-capture-20260728.jpg",
    uploaded_at: "2026-07-28T13:20:00Z",
    transaction: null,
  },
];

export function DocumentsClient() {
  const { documents, isSampleData } = useDocuments(SAMPLE_DOCUMENTS);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface print:hidden dark:border-stone-700 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2 print:hidden">
          <h1 className="text-2xl font-semibold">証憑（レシート・請求書）を検索する</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            電子帳簿保存法で求められる「取引年月日・取引金額・取引先」による証憑検索、およびディスプレイ・書面への
            出力（可視性確保）に対応した画面です。証憑は紐づく取引の年月日・金額・取引先で検索されます。
            取引と紐付いていない証憑（スキャンのみアップロードされたもの）は検索条件を照合できないため、
            画面下部で常に件数を表示します。
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {isSampleData
              ? "本ページは開発中のプロトタイプであり、サンプルデータを使用しています。"
              : "記帳された実データ（アップロード済みの証憑と、紐づく仕訳）を表示しています。取引先（相手方の名称）は現時点では記録していないため空欄になります。"}
          </p>
        </div>

        <DocumentSearchForm documents={documents} />
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4 print:hidden dark:border-stone-700 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データ・証憑データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
