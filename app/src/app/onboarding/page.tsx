"use client";

import { useState } from "react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { EMPTY_TENANT_PROFILE_DRAFT, TenantProfileDraft, draftToTenantProfilePatch } from "@/lib/db/tenants";

export default function OnboardingPage() {
  const [completedPatch, setCompletedPatch] = useState<ReturnType<typeof draftToTenantProfilePatch> | null>(null);

  function handleComplete(draft: TenantProfileDraft) {
    // DB未接続の現状に合わせ、事業者設定画面（src/app/settings/page.tsx）と同様に
    // 実際の updateTenantProfile 呼び出しの代わりにパッチをその場で確認できるようにしている。
    // 実DB接続時には、ここで updateTenantProfile(tenantId, patch) を呼び出す想定
    // （tenantId は認証済みユーザーの所属テナントから解決する）。
    const patch = draftToTenantProfilePatch(draft);
    setCompletedPatch(patch);
  }

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen">
      <header className="border-b border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">初回設定</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">ようこそ。まずは基本情報を設定しましょう</h1>
          <p className="text-sm text-stone-600 dark:text-stone-300 max-w-2xl leading-relaxed">
            事業形態・屋号（会社名）・決算月・青色申告の承認有無は、記帳や税額の概算シミュレーション、
            申告書の下書き作成の前提となる基本情報です。ステップに沿って一つずつ設定してください。
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-500 max-w-2xl leading-relaxed mt-2">
            ここでの設定は申告書の下書き作成・概算シミュレーションの前提条件として利用されるものです。
            申告書の下書き作成やe-Tax/eLTAXへの送信操作は、あくまでご自身の権限・確認のもとで行っていただくものであり、当社が税務代理を行うものではありません。
            設定内容はいつでも事業者設定画面から変更できます。
          </p>
        </section>

        <OnboardingWizard initialDraft={EMPTY_TENANT_PROFILE_DRAFT} onComplete={handleComplete} />

        {completedPatch && (
          <p className="text-xs text-stone-400 dark:text-stone-500">
            この画面は開発中のプロトタイプです。保存内容はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
          </p>
        )}
      </main>
    </div>
  );
}
