"use client";

import { useMemo, useState } from "react";
import {
  InviteRecord,
  InviteStatus,
  buildReferralShareUrl,
  summarizeInvites,
} from "@/lib/referral/inviteProgram";

// 友達紹介（バイラル招待）プログラムのUI。
// business-plan.md 12章の「ユーザー間のインタラクションでネットワーク効果を作る」要望に対応する。
// 提携税理士への送客（advisorReferral）とは無関係の、新規ユーザー獲得のための招待機能。

const STATUS_LABEL: Record<InviteStatus, string> = {
  pending: "招待中",
  joined: "参加済み",
  rewarded: "特典付与済み",
};

const STATUS_STYLE: Record<InviteStatus, string> = {
  pending: "bg-surface text-muted-foreground",
  joined: "bg-amber-100 text-amber-800",
  rewarded: "bg-emerald-100 text-emerald-800",
};

export interface InviteProgramCardProps {
  /** 現在ログイン中ユーザーの紹介コード（表示・共有用） */
  referralCode: string;
  /** これまでの招待一覧（状態管理は呼び出し側に委ねる） */
  invites: InviteRecord[];
  /** フォーム送信時のコールバック（呼び出し側で createInviteRecord を呼んで invites に追加する想定） */
  onInvite?: (inviteeContact: string) => void;
}

export function InviteProgramCard({ referralCode, invites, onInvite }: InviteProgramCardProps) {
  const [inviteeContact, setInviteeContact] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // window.location.origin はクライアントでのみ取得可能なため、サーバー描画時は相対パスにフォールバックする
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const shareUrl = useMemo(() => buildReferralShareUrl(referralCode, origin), [referralCode, origin]);
  const summary = useMemo(() => summarizeInvites(invites), [invites]);

  const shareMessage = `一緒に確定申告をラクにしませんか？私が使っているAI記帳・申告下書きサービスに登録すると、私にもあなたにも「1ヶ月無料」特典があります。こちらからどうぞ：${shareUrl}`;
  const mailtoHref = `mailto:?subject=${encodeURIComponent("記帳・確定申告がラクになるサービス、使ってみませんか")}&body=${encodeURIComponent(shareMessage)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inviteeContact.trim();
    if (!trimmed) return;
    onInvite?.(trimmed);
    setInviteeContact("");
  }

  return (
    <div className="border border-border bg-surface rounded-lg p-6 flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-xl">友達を紹介する</h2>
        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
          あなたの紹介リンクから友達が登録し、初めての明細CSVインポートを完了すると、あなたと友達の両方に
          <span className="font-medium text-foreground">「1ヶ月無料」</span>特典を差し上げます。
        </p>
      </div>

      {/* 紹介コード・共有リンク */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">あなたの紹介コード</span>
          <span className="font-mono text-lg tracking-widest bg-stone-100 rounded px-3 py-1 text-foreground">
            {referralCode}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label="紹介リンク"
            className="flex-1 min-w-0 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-foreground font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md bg-red-700 px-4 py-2 text-white text-sm font-medium hover:bg-red-800 transition-colors whitespace-nowrap"
            >
              {copyState === "copied" ? "コピーしました" : copyState === "failed" ? "コピー失敗" : "リンクをコピー"}
            </button>
            <a
              href={mailtoHref}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-foreground hover:bg-stone-50 transition-colors whitespace-nowrap"
            >
              メールで送る
            </a>
          </div>
        </div>
      </div>

      {/* 招待フォーム */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={inviteeContact}
          onChange={(e) => setInviteeContact(e.target.value)}
          placeholder="友達のメールアドレスや名前"
          aria-label="招待する友達の連絡先"
          className="flex-1 min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!inviteeContact.trim()}
          className="rounded-md bg-stone-900 px-4 py-2 text-white text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          招待リストに追加
        </button>
      </form>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-surface border border-border py-3">
          <div className="text-lg font-semibold text-foreground tabular-nums">{summary.total}</div>
          <div className="text-xs text-muted-foreground">招待した友達</div>
        </div>
        <div className="rounded-md bg-surface border border-border py-3">
          <div className="text-lg font-semibold text-foreground tabular-nums">{summary.joined}</div>
          <div className="text-xs text-muted-foreground">参加済み</div>
        </div>
        <div className="rounded-md bg-surface border border-border py-3">
          <div className="text-lg font-semibold text-emerald-700 tabular-nums">{summary.freeMonthsEarned}</div>
          <div className="text-xs text-muted-foreground">獲得した無料月数</div>
        </div>
      </div>

      {/* 招待一覧 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">招待の状況</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ友達を招待していません。上のリンクを共有してみましょう。</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-stone-200 rounded-md overflow-hidden">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-white">
                <span className="text-foreground truncate">{invite.inviteeContact}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[invite.status]}`}>
                  {STATUS_LABEL[invite.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        ※ 特典は本サービスの利用料が1ヶ月分無料になるものであり、税務代理・税務相談等とは関係ありません。
        本ページは開発中のプロトタイプの機能紹介です。
      </p>
    </div>
  );
}
