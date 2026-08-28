"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { BulkReapplyRulesPanel } from "@/components/BulkReapplyRulesPanel";
import type { CategorizedTransaction } from "@/lib/categorize/engine";
import { createUserCategoryRule, UserCategoryRule } from "@/lib/categorize/userRules";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";

// このページ専用のサンプルデータ。実データ（journal_entries）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （reconcile/trial-balance等と同じuseLedgerTransactionsフック経由）。
// 一方、ユーザー辞書ルール（SAMPLE_USER_RULES、下記）は対応するDBテーブル
// （user_categorize_rules）が未実装のため、引き続きサンプルデータのまま。
const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "tx-1",
    date: "2026-06-01",
    description: "事務所家賃 〇〇不動産",
    amount: -150000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-2",
    date: "2026-06-15",
    description: "クライアントA社 業務委託料",
    amount: 300000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 0,
    source: "uncategorized",
  },
  {
    id: "tx-3",
    date: "2026-07-01",
    description: "事務用品購入 Amazon",
    amount: -3000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-4",
    date: "2026-07-10",
    description: "打合せ会食 B社担当者と",
    amount: -8200,
    account: "接待交際費",
    taxCategory: "課税仕入10%",
    confidence: 0.6,
    source: "ai",
    note: "AIによる推定",
  },
];

// クライアントA社を売上高ではなく専用科目で管理したい、という編集を後から行ったケースを想定した
// サンプルユーザー辞書ルール。このルールを一括再適用すると、tx-2 の分類が変わって見えるはず。
const SAMPLE_USER_RULES: UserCategoryRule[] = [
  createUserCategoryRule(
    {
      pattern: "クライアントA社",
      account: "業務委託売上(A社案件)",
      taxCategory: "課税売上10%",
      note: "A社は他クライアントと分けて集計したいため",
    },
    new Date("2026-08-01T00:00:00Z")
  ),
];

export default function RuleBackfillPage() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_TRANSACTIONS);

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">ルール一括再適用（バックフィル）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">カテゴライズルールの一括再適用（バックフィル）</h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            ユーザー辞書ルール（キーワードと勘定科目・税区分の対応）を追加・編集すると、今後の自動分類には反映されますが、すでに分類済みの過去の取引は自動では変わりません。ここでは現在のルールでもう一度分類し直した場合の変更内容を一覧表示し、内容を確認したうえで、必要な取引だけを選んで反映できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mt-2">
            このツールが提示する勘定科目・税区分はルールに基づく簡易な自動判定であり、正式な税務判断ではありません。反映する場合も、最終的な内容は必ずご自身でご確認ください（本サービスは税理士法上の税務代理・個別税務相談を行うものではなく、本人申告を支援するツールです）。
          </p>
          <p className="text-xs text-stone-400 mt-2">
            {isSampleData ? "現在は取引データもサンプルデータを表示しています。" : "記帳された実データ（当期の取引）を表示しています。"}
          </p>
        </section>

        {/*
          BulkReapplyRulesPanelはinitialTransactionsをuseStateの初期値として一度だけ
          取り込み、以降は内部状態（選択中の行・適用結果）として保持する作りのため、
          useLedgerTransactionsの非同期取得がマウント後に完了して実データへ差し替わっても、
          initialTransactionsの変化だけではパネルの内部状態は更新されない。
          isSampleDataをkeyに使い、サンプル→実データの切り替わり時（trueからfalseへの
          一度きりの遷移）にパネルを再マウントさせることで、実データが確実に反映されるようにする。
        */}
        <BulkReapplyRulesPanel
          key={isSampleData ? "sample" : "real"}
          initialTransactions={transactions}
          userRules={SAMPLE_USER_RULES}
        />

        <p className="text-xs text-stone-400">
          この画面は開発中のプロトタイプです。表示しているユーザー辞書ルールはサンプルデータであり、適用結果はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
        </p>
      </PageContainer>
    </div>
  );
}
