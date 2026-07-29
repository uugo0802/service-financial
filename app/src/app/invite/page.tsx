"use client";

import { useState } from "react";
import {
  InviteRecord,
  createInviteRecord,
  generateReferralCode,
  markInviteJoined,
  tryMarkInviteRewarded,
} from "@/lib/referral/inviteProgram";
import { InviteProgramCard } from "@/components/InviteProgramCard";

// サンプル用の「ログイン中ユーザー」ID。実際の認証・DB連携はMVP後のスコープ。
const SAMPLE_CURRENT_USER_ID = "sample-user-001";

// デモとして最初から表示しておく招待の状態（pending / joined / rewarded を1件ずつ）。
function buildSampleInvites(): InviteRecord[] {
  const pending = createInviteRecord({
    referrerUserId: SAMPLE_CURRENT_USER_ID,
    inviteeContact: "tanaka@example.com",
    now: new Date("2026-07-20T00:00:00.000Z"),
  });

  const joined = markInviteJoined(
    createInviteRecord({
      referrerUserId: SAMPLE_CURRENT_USER_ID,
      inviteeContact: "sato@example.com",
      now: new Date("2026-07-15T00:00:00.000Z"),
    }),
    new Date("2026-07-17T00:00:00.000Z"),
  );

  const rewarded = tryMarkInviteRewarded(
    markInviteJoined(
      createInviteRecord({
        referrerUserId: SAMPLE_CURRENT_USER_ID,
        inviteeContact: "suzuki@example.com",
        now: new Date("2026-07-01T00:00:00.000Z"),
      }),
      new Date("2026-07-03T00:00:00.000Z"),
    ),
    { refereeCompletedFirstCsvImport: true },
    new Date("2026-07-10T00:00:00.000Z"),
  );

  return [pending, joined, rewarded];
}

export default function InvitePage() {
  const [invites, setInvites] = useState<InviteRecord[]>(() => buildSampleInvites());
  const referralCode = generateReferralCode(SAMPLE_CURRENT_USER_ID);

  function handleInvite(inviteeContact: string) {
    setInvites((prev) => [...prev, createInviteRecord({ referrerUserId: SAMPLE_CURRENT_USER_ID, inviteeContact })]);
  }

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> 友達紹介プログラム
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 flex flex-col gap-8">
        <section className="text-center flex flex-col gap-2">
          <h1 className="font-serif text-2xl">友達を招待して、お互いに1ヶ月無料</h1>
          <p className="text-stone-600 text-sm max-w-xl mx-auto leading-relaxed">
            記帳・確定申告の手間で困っている友達に、あなたの紹介リンクをシェアしましょう。
            友達が登録して最初のCSVインポートを完了すると、あなたと友達の両方に特典が届きます。
          </p>
        </section>

        <InviteProgramCard referralCode={referralCode} invites={invites} onInvite={handleInvite} />
      </main>

      <footer className="border-t border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-stone-500 leading-relaxed">
          このページは開発中のプロトタイプであり、表示されている招待データはサンプルです。実際の招待・特典付与・課金連携は今後実装予定です。
          本サービスは税理士法に定める税務代理・税務書類の作成・税務相談を行うものではなく、申告書の下書き作成・送信操作は常にご本人の判断と操作によって行われます。
        </div>
      </footer>
    </div>
  );
}
