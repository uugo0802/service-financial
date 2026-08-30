"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { Tag, TagAssignment } from "@/lib/tags/tagging";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { TagManagerClient } from "./TagManagerClient";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。docs/business-plan.md 12節（オーナー修吾の実体験ペイン
// 「どのクライアント/案件が儲かっているか分からない」）の動作確認用で、取引一覧が実データ
// （journal_entries）を取得できない間・未ログイン・Supabase未設定の場合のフォールバック
// 表示として使う（useLedgerTransactions経由。budget/rule-backfill等と同じパターン）。
// db/supabaseClient.ts の TransactionRow を直接使わず、CategorizedTransaction型で
// 用意している（useLedgerTransactionsの引数型に合わせるため。TagManagerClientが要求する
// TaggableTransaction は id/date/description/amount のみのため、この型でも満たせる）。
const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "tx-1",
    date: "2026-06-01",
    description: "事務所家賃",
    amount: -150_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-2",
    date: "2026-06-15",
    description: "コンサルティング売上（A社）",
    amount: 300_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-3",
    date: "2026-07-01",
    description: "事務用品購入",
    amount: -3_000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-4",
    date: "2026-07-05",
    description: "外注費（Xプロジェクト）",
    amount: -80_000,
    account: "外注費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-5",
    date: "2026-07-10",
    description: "打合せ会食（B社担当者と）",
    amount: -8_200,
    account: "接待交際費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-6",
    date: "2026-07-20",
    description: "顧問料入金（C社）",
    amount: 220_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-7",
    date: "2026-07-22",
    description: "交通費（A社訪問）",
    amount: -6_500,
    account: "旅費交通費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-8",
    date: "2026-07-25",
    description: "寄付",
    amount: -10_000,
    account: "寄付金",
    taxCategory: "対象外",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-9",
    date: "2026-07-28",
    description: "Xプロジェクト納品売上",
    amount: 120_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
];

// タグ管理自体（tags/tag_assignmentsテーブル）は TagManagerClient 内で
// Supabase接続済み（lib/db/tags.ts）のため、ここでは従来通りサンプル値を
// 初期値（テナント未解決時のフォールバック）として渡す。
const SAMPLE_TAGS: Tag[] = [
  { id: "tag-clientA", label: "A社案件", color: "#2a78d6" },
  { id: "tag-clientC", label: "C社案件", color: "#1baf7a" },
  { id: "tag-projectX", label: "Xプロジェクト", color: "#eb6834" },
];

const SAMPLE_ASSIGNMENTS: TagAssignment[] = [
  { tagId: "tag-clientA", transactionId: "tx-2" },
  { tagId: "tag-clientA", transactionId: "tx-7" },
  { tagId: "tag-clientC", transactionId: "tx-6" },
  { tagId: "tag-projectX", transactionId: "tx-4" },
  { tagId: "tag-projectX", transactionId: "tx-9" },
];

export function TagsClient() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_TRANSACTIONS);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">クライアント・プロジェクトの収益性</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            取引にクライアントや案件のタグを付けると、タグごとの収入・支出・純額を自動で集計します。
            「どの案件が実際に儲かっているか」を、高価な会計ツールなしで手軽に把握するための画面です。
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {isSampleData
              ? "取引一覧は開発中のプロトタイプであり、サンプルデータを使用しています。"
              : "記帳された実データ（当期の取引）を表示しています。"}
          </p>
        </div>

        <TagManagerClient
          initialTags={SAMPLE_TAGS}
          initialAssignments={SAMPLE_ASSIGNMENTS}
          transactions={transactions}
        />
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は取引データの単純な集計・可視化であり、税額計算や申告内容とは連動していません。
          個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
