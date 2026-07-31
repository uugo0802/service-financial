import type { Metadata } from "next";
import { Tag, TagAssignment, TaggableTransaction } from "@/lib/tags/tagging";
import { TagManagerClient } from "./TagManagerClient";

export const metadata: Metadata = {
  title: "タグ・収益性｜税務申告AI（ジャービス）",
  description: "取引にクライアント/プロジェクトタグを付け、タグ別の収益性を確認する画面（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。docs/business-plan.md 12節（オーナー修吾の実体験ペイン
// 「どのクライアント/案件が儲かっているか分からない」）の動作確認用で、Supabase実データ
// 連携とは切り離している（本番ではテナントIDに紐づく取引・タグデータに差し替える）。
// db/supabaseClient.ts の TransactionRow を直接使わず、集計に必要な最小限のフィールド
// （id/date/description/amount）だけを持つ TaggableTransaction をここで組み立てる。
const SAMPLE_TRANSACTIONS: TaggableTransaction[] = [
  { id: "tx-1", date: "2026-06-01", description: "事務所家賃", amount: -150_000 },
  { id: "tx-2", date: "2026-06-15", description: "コンサルティング売上（A社）", amount: 300_000 },
  { id: "tx-3", date: "2026-07-01", description: "事務用品購入", amount: -3_000 },
  { id: "tx-4", date: "2026-07-05", description: "外注費（Xプロジェクト）", amount: -80_000 },
  { id: "tx-5", date: "2026-07-10", description: "打合せ会食（B社担当者と）", amount: -8_200 },
  { id: "tx-6", date: "2026-07-20", description: "顧問料入金（C社）", amount: 220_000 },
  { id: "tx-7", date: "2026-07-22", description: "交通費（A社訪問）", amount: -6_500 },
  { id: "tx-8", date: "2026-07-25", description: "寄付", amount: -10_000 },
  { id: "tx-9", date: "2026-07-28", description: "Xプロジェクト納品売上", amount: 120_000 },
];

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

export default function TagsPage() {
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
          <h1 className="text-2xl font-semibold">クライアント・プロジェクトの収益性</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            取引にクライアントや案件のタグを付けると、タグごとの収入・支出・純額を自動で集計します。
            「どの案件が実際に儲かっているか」を、高価な会計ツールなしで手軽に把握するための画面です。
          </p>
        </div>

        <TagManagerClient
          initialTags={SAMPLE_TAGS}
          initialAssignments={SAMPLE_ASSIGNMENTS}
          transactions={SAMPLE_TRANSACTIONS}
        />
      </main>

      <footer className="border-t border-stone-300 bg-white mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は取引データの単純な集計・可視化であり、税額計算や申告内容とは連動していません。
          個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
