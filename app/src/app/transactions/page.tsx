import type { Metadata } from "next";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { TransactionSearchForm } from "@/components/TransactionSearchForm";

export const metadata: Metadata = {
  title: "取引検索｜税務申告AI（ジャービス）",
  description: "取引年月日・取引金額・取引先で記帳データを検索する画面（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。電子帳簿保存法（docs/cto-tech-architecture.md 4.1節）が
// 求める「取引年月日・取引金額・取引先」検索の動作確認用で、Supabase実データ連携とは
// 切り離している（本番ではテナントIDに紐づく searchTransactions() の結果に差し替える）。
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

export default function TransactionsPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">取引を検索する</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            電子帳簿保存法で求められる「取引年月日・取引金額・取引先」による検索に対応した画面です。
            条件を指定して記帳データを絞り込み、確認・エクスポートなどにご利用ください。
          </p>
        </div>

        <TransactionSearchForm transactions={SAMPLE_TRANSACTIONS} />
      </main>

      <footer className="border-t border-stone-300 bg-white mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データの下書き・概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
