"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { BulkReapplyRulesPanel } from "@/components/BulkReapplyRulesPanel";
import type { CategorizedTransaction } from "@/lib/categorize/engine";
import { createUserCategoryRule, UserCategoryRule } from "@/lib/categorize/userRules";

// このページ専用のサンプルデータ（開発中プロトタイプ用）。
// 実際の運用では、テナントに紐づく「分類済み取引一覧」と「現在登録されているユーザー辞書ルール」を
// それぞれのデータストアから取得して BulkReapplyRulesPanel に渡す（categorize-rules 画面で
// 編集されるユーザー辞書ルールと同じ保存先を想定）。
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
        </section>

        <BulkReapplyRulesPanel initialTransactions={SAMPLE_TRANSACTIONS} userRules={SAMPLE_USER_RULES} />

        <p className="text-xs text-stone-400">
          この画面は開発中のプロトタイプです。表示している取引・ユーザー辞書ルールはサンプルデータであり、適用結果はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
        </p>
      </PageContainer>
    </div>
  );
}
