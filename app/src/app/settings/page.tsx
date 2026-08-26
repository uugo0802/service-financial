"use client";

import { useState } from "react";
import Link from "next/link";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantProfile, TenantProfileDraft, draftToTenantProfilePatch, tenantProfileToDraft } from "@/lib/db/tenants";

// DB未接続の現状に合わせ、実テナントデータの代わりにサンプルデータを表示する
// （business-plan.mdが想定する「今ごえん合同会社」的なマイクロ法人のサンプル）。
const SAMPLE_TENANT_PROFILE: TenantProfile = {
  id: "sample-tenant",
  entity_type: "corp",
  display_name: "今ごえん合同会社",
  created_at: "2024-04-01T00:00:00Z",
  fiscal_year_end_month: 3,
  blue_return: true,
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<TenantProfile>(SAMPLE_TENANT_PROFILE);
  const [savedNotice, setSavedNotice] = useState(false);

  function handleSubmit(draft: TenantProfileDraft) {
    const patch = draftToTenantProfilePatch(draft);
    setProfile((prev) => ({ ...prev, ...patch }));
    setSavedNotice(true);
  }

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">事業者設定</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">事業者設定</h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            事業形態・屋号（会社名）・決算月・青色申告の承認有無など、記帳や税額の概算シミュレーションの前提となる基本情報を設定します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mt-2">
            ここでの設定は申告書の下書き作成・概算シミュレーションの前提条件として利用されるものです。
            申告書の下書き作成やe-Tax/eLtaxへの送信操作は、あくまでご自身の権限・確認のもとで行っていただくものであり、当社が税務代理を行うものではありません。
          </p>
        </section>

        <TenantSettingsForm initialDraft={tenantProfileToDraft(profile)} onSubmit={handleSubmit} />

        <Link href="/settings/security" className="text-sm text-stone-700 underline underline-offset-2 self-start">
          二要素認証（2FA）の設定はこちら →
        </Link>

        {savedNotice && (
          <p className="text-xs text-stone-400">
            この画面は開発中のプロトタイプです。保存内容はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。
          </p>
        )}
      </main>
    </div>
  );
}
