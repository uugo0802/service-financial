"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  TEAM_MEMBER_STATUS_LABELS,
  TEAM_ROLE_LABELS,
  TeamMember,
  TeamRole,
  acceptTeamMemberInvite,
  changeTeamMemberRole,
  inviteTeamMember,
  isLastOwner,
  removeTeamMember,
} from "@/lib/team/teamMembers";
import { PageTitle } from "@/components/ui/PageTitle";

// DB未接続の現状に合わせ、実データの代わりにサンプルのメンバー一覧を表示する
// （settings/page.tsx の SAMPLE_TENANT_PROFILE と同様の方針）。
const SAMPLE_TENANT_ID = "sample-tenant";

const INITIAL_MEMBERS: TeamMember[] = [
  {
    id: "member-owner",
    tenantId: SAMPLE_TENANT_ID,
    email: "owner@example.com",
    role: "owner",
    status: "active",
    invitedAt: "2024-04-01T00:00:00.000Z",
    joinedAt: "2024-04-01T00:00:00.000Z",
  },
  {
    id: "member-bookkeeper",
    tenantId: SAMPLE_TENANT_ID,
    email: "bookkeeper@example.com",
    role: "editor",
    status: "pending",
    invitedAt: "2026-07-20T00:00:00.000Z",
  },
];

const ROLE_OPTIONS: TeamRole[] = ["owner", "editor", "viewer"];

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>(INITIAL_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(null);
    try {
      const newMember = inviteTeamMember(members, {
        tenantId: SAMPLE_TENANT_ID,
        email: inviteEmail,
        role: inviteRole,
      });
      setMembers((prev) => [...prev, newMember]);
      setInviteEmail("");
      setInviteRole("editor");
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "招待に失敗しました");
    }
  }

  function handleRoleChange(memberId: string, newRole: TeamRole) {
    setActionError(null);
    try {
      setMembers((prev) => changeTeamMemberRole(prev, memberId, newRole));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "ロールの変更に失敗しました");
    }
  }

  function handleRemove(memberId: string) {
    setActionError(null);
    try {
      setMembers((prev) => removeTeamMember(prev, memberId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }

  async function handleAcceptInvite(memberId: string) {
    setActionError(null);
    setPendingActionId(memberId);
    try {
      setMembers((prev) => acceptTeamMemberInvite(prev, memberId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "参加確定に失敗しました");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">チームメンバー設定</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">チームメンバー</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            オーナーに加えて、ご家族やパートタイムの記帳担当の方をメールアドレスで招待し、
            日々の記帳作業を分担できます。ロールに応じて、閲覧のみ／記帳データの編集まで、
            権限を分けて付与できます。
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed mt-2">
            この機能は既存のお友達紹介・提携税理士紹介プログラムとは別物です。
            あくまで同じ事業者（テナント）内で記帳業務を分担するための、社内向けのメンバー管理です。
          </p>
        </section>

        <section className="border border-border bg-surface p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">メンバーを招待</h2>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">メールアドレス</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="member@example.com"
                className="border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">ロール</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                className="border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {TEAM_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="bg-accent text-white text-sm px-4 py-2 hover:opacity-90 whitespace-nowrap"
            >
              招待する
            </button>
          </form>
          {inviteError && <p className="text-sm text-red-700">{inviteError}</p>}
        </section>

        <section className="border border-border bg-surface p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">メンバー一覧</h2>

          {actionError && <p className="text-sm text-red-700">{actionError}</p>}

          <ul className="flex flex-col gap-2">
            {members.map((member) => {
              const lastOwner = isLastOwner(members, member.id);
              return (
                <li
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span>{member.email}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className={member.status === "active" ? "text-emerald-700" : "text-amber-700"}>
                        {TEAM_MEMBER_STATUS_LABELS[member.status]}
                      </span>
                      {lastOwner && <span className="text-muted-foreground">（テナントに必須の唯一のオーナー）</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={member.role}
                      disabled={lastOwner}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as TeamRole)}
                      className="border border-border px-2 py-1 text-xs disabled:bg-surface disabled:text-muted-foreground"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {TEAM_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>

                    {member.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleAcceptInvite(member.id)}
                        disabled={pendingActionId === member.id}
                        className="text-xs text-foreground underline underline-offset-2 disabled:text-muted-foreground whitespace-nowrap"
                      >
                        参加を確定
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemove(member.id)}
                      disabled={lastOwner}
                      className="text-xs text-red-700 underline underline-offset-2 disabled:text-muted-foreground"
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          この画面は開発中のプロトタイプです。メンバーの追加・変更内容はこのブラウザセッション内のみで保持され、
          実際の招待メール送信やデータベースへの保存は行われません。
        </p>

        <Link href="/settings" className="text-xs text-muted-foreground underline underline-offset-2 self-start">
          ← 事業者設定に戻る
        </Link>
      </PageContainer>
    </div>
  );
}
