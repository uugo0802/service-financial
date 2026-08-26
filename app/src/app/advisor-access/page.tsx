import type { Metadata } from "next";
import Link from "next/link";
import { AdvisorAccessPanel } from "@/components/AdvisorAccessPanel";
import { AdvisorAccessGrant } from "@/lib/team/advisorAccess";

export const metadata: Metadata = {
  title: "顧問税理士への閲覧共有｜決算書作成から税務申告までワンクリック スグル",
  description:
    "既にご契約中の顧問税理士に、記帳データや申告書下書きをread-onlyで共有できます（追加課金プラン）。",
};

// DB未接続の現状に合わせ、実データの代わりにサンプルのグラント一覧を表示する
// （settings/team/page.tsx の INITIAL_MEMBERS と同様の方針）。
const SAMPLE_TENANT_ID = "sample-tenant";

const INITIAL_GRANTS: AdvisorAccessGrant[] = [
  {
    id: "grant-sample-1",
    tenantId: SAMPLE_TENANT_ID,
    advisorName: "山田税理士事務所",
    advisorEmail: "advisor@example.com",
    scopes: ["transactions", "filingDrafts"],
    status: "active",
    inviteToken: "sample-token-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    activatedAt: "2026-06-02T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z",
  },
];

// 現時点では pricing/plans.ts にアドオン契約有無のフィールドが存在しないため、
// このサンプルページでは true 固定（プラン判定は将来のエンタイトルメント解決層で行う想定）。
const SAMPLE_PLAN_INCLUDES_ADVISOR_ACCESS = true;

export default function AdvisorAccessPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500">顧問税理士への閲覧共有（追加課金）</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">顧問税理士への閲覧共有</h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            既にご自身で契約されている顧問税理士・会計事務所に、仕訳・記帳データや申告書下書き、請求書などを
            read-only（閲覧のみ・編集不可）で共有できます。共有範囲や共有期間はいつでも指定・変更でき、
            不要になったアクセスはワンクリックで取り消せます。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed mt-2">
            この機能は、新規に提携税理士を紹介する「提携税理士への紹介・有償相談」（/advisor-referral）や、
            同じ事業者内で記帳作業を分担する「チームメンバー」（/settings/team）とは別物です。
            あくまで、お客様が既にお持ちの顧問税理士に対して、ご自身のデータを外部から見ていただくための
            共有機能（追加課金プラン）です。
          </p>
        </section>

        <AdvisorAccessPanel
          tenantId={SAMPLE_TENANT_ID}
          initialGrants={INITIAL_GRANTS}
          eligible={SAMPLE_PLAN_INCLUDES_ADVISOR_ACCESS}
        />

        <p className="text-xs text-stone-400">
          この画面は開発中のプロトタイプです。招待・取り消し内容はこのブラウザセッション内のみで保持され、
          実際の招待メール送信やデータベースへの保存は行われません。
        </p>

        <Link href="/settings" className="text-xs text-stone-500 underline underline-offset-2 self-start">
          ← 事業者設定に戻る
        </Link>
      </main>
    </div>
  );
}
