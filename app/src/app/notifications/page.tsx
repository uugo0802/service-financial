"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { EntityType } from "@/lib/filing/deadlines";
import { ReconciliationResult } from "@/lib/reconcile/bankReconciliation";
import { buildWeeklyDigest, IsoDate } from "@/lib/notifications/weeklyDigest";
import { WeeklyDigestPreview } from "@/components/WeeklyDigestPreview";
import { NotificationPreferencesForm } from "@/components/NotificationPreferencesForm";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。記帳された実データ（journal_entries）が
// useLedgerTransactions経由で取得できるまで、または取得できなかった場合の
// フォールバック表示に使う（reconcile/rule-backfill等と同じ位置づけ）。
// 一方SAMPLE_RECONCILIATIONS（下記）は対応する銀行残高突合結果の永続化の仕組み
// （DBテーブル・lib/db/層）が現時点で存在しないため、引き続きサンプルデータのまま。
const SAMPLE_CATEGORIZED_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-rule-1",
    date: "2026-07-05",
    description: "サンプル: 業務委託料入金",
    amount: 420_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-rule-2",
    date: "2026-07-08",
    description: "サンプル: コワーキングスペース利用料",
    amount: -32_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-review-1",
    date: "2026-07-12",
    description: "サンプル: 摘要が不明瞭な出金（要確認）",
    amount: -18_400,
    account: "要確認",
    taxCategory: "要確認",
    confidence: 0.4,
    source: "uncategorized",
  },
  {
    id: "sample-review-2",
    date: "2026-07-18",
    description: "サンプル: AIが低信頼で分類した交際費",
    amount: -6_600,
    account: "接待交際費",
    taxCategory: "課税仕入10%",
    confidence: 0.58,
    source: "ai",
    note: "領収書の記載が薄く、参加者情報が確認できないため確信度を下げています",
  },
  {
    id: "sample-review-3",
    date: "2026-07-21",
    description: "サンプル: 新規取引先からの入金（初回のため要確認）",
    amount: 95_000,
    account: "要確認",
    taxCategory: "要確認",
    confidence: 0.3,
    source: "uncategorized",
  },
];

// bankReconciliation.tsは口座・期間単位の突合結果を返す設計のため、サンプルでも
// 「連携している口座ごとに1件」の突合結果を想定する（未突合の口座が1つある状態）。
const SAMPLE_RECONCILIATIONS: ReconciliationResult[] = [
  {
    transactionCount: 12,
    netTransactionAmount: 458_400,
    openingBalance: 1_000_000,
    expectedClosingBalance: 1_458_400,
    actualClosingBalance: 1_458_400,
    discrepancy: 0,
    toleranceYen: 1,
    isReconciled: true,
    hint: null,
  },
  {
    transactionCount: 4,
    netTransactionAmount: 120_000,
    openingBalance: 300_000,
    expectedClosingBalance: 420_000,
    actualClosingBalance: 460_000,
    discrepancy: 40_000,
    toleranceYen: 1,
    isReconciled: false,
    hint: {
      direction: "shortfall",
      title: "取込漏れの可能性（不足額が示す方向）",
      message: "実際の銀行残高が、取り込んだ取引から計算した残高より多くなっています。入金など一部の取引がまだ取り込めていない可能性があります。",
    },
  },
];

// ブラウザのローカル日時から "YYYY-MM-DD" 形式の基準日を作る。
// weeklyDigest.ts側のロジックはDate.now()に依存しない設計になっており、
// ここ（実際のアプリ実行時にのみ「今日」を決める場所）でだけ現在日時を参照する。
function todayIsoDate(): IsoDate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function NotificationsPage() {
  const asOf = useMemo(() => todayIsoDate(), []);
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_CATEGORIZED_TRANSACTIONS);

  // 本サービスはマイクロ法人向けに一本化しているため、事業形態は法人固定とする
  // （docs/superpowers/specs/2026-08-30-nav-slimdown-and-entity-simplify-design.md ⑤参照）。
  const entityType: EntityType = "corporate";
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState(3);
  const [includeReviewQueue, setIncludeReviewQueue] = useState(true);
  const [includeReconciliation, setIncludeReconciliation] = useState(true);

  const digest = useMemo(
    () =>
      buildWeeklyDigest({
        asOf,
        categorizedTransactions: includeReviewQueue ? transactions : [],
        filing: { entityType, fiscalYearEndMonth },
        reconciliations: includeReconciliation ? SAMPLE_RECONCILIATIONS : undefined,
      }),
    [asOf, transactions, entityType, fiscalYearEndMonth, includeReviewQueue, includeReconciliation]
  );

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">週次アクティビティダイジェスト（プレビュー）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">週次アクティビティダイジェスト</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            AIカテゴライズのレビュー待ち・申告期限・銀行残高の未突合状況を1週間分にまとめたダイジェストの下書きです。
            実際のメール配信は行わず、送信内容として組み立てられる構造化データをこの画面で確認できます。
          </p>
        </section>

        <section className="border border-border bg-surface rounded-md p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground w-44">
            決算月
            <select
              value={fiscalYearEndMonth}
              onChange={(e) => setFiscalYearEndMonth(Number(e.target.value))}
              className="border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground border-t border-border/60 pt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeReviewQueue}
                onChange={(e) => setIncludeReviewQueue(e.target.checked)}
              />
              {isSampleData
                ? "サンプルのレビュー待ち取引を含める（AIカテゴライズの低信頼エスカレーション）"
                : "記帳された実データのレビュー待ち取引を含める（AIカテゴライズの低信頼エスカレーション）"}
            </label>
            <p className="text-xs text-muted-foreground pl-6 -mt-1">
              {isSampleData
                ? "現在は取引データもサンプルデータを表示しています。"
                : "記帳された実データ（当期の取引）を表示しています。"}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeReconciliation}
                onChange={(e) => setIncludeReconciliation(e.target.checked)}
              />
              サンプルの銀行残高突合結果を含める（未連携テナントを試したい場合はオフ）
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">ダイジェストのプレビュー</h2>
          <WeeklyDigestPreview digest={digest} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">通知の詳細設定</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-3">
            ダイジェストの配信頻度と、通知を控えたい静音時間帯（クワイエットアワー）をこの端末に保存できます。
          </p>
          <NotificationPreferencesForm />
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            本ページは開発中のプロトタイプです。
            {isSampleData
              ? "レビュー待ち取引はサンプルデータを表示しています。"
              : "レビュー待ち取引は記帳された実データに基づいて表示しています。"}
            {" "}
            銀行残高突合結果は現時点でサンプルデータのままです。実際のメール送信は行わず、
            ダイジェストとして組み立てられる内容（件数・申告期限の一覧・要約文）を確認するための画面です。
            申告期限の情報は一般的な原則ルールに基づく参考値であり、個別の税務相談ではありません。
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
