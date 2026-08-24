"use client";

import { FormEvent, useState } from "react";
import {
  ADVISOR_ACCESS_SCOPE_LABELS,
  ADVISOR_ACCESS_SCOPES,
  ADVISOR_ACCESS_STATUS_LABELS,
  AdvisorAccessGrant,
  AdvisorAccessScope,
  createAdvisorAccessInvite,
  isAdvisorAccessGrantExpired,
  revokeAdvisorAccessGrant,
} from "@/lib/team/advisorAccess";

interface AdvisorAccessPanelProps {
  tenantId: string;
  /** 初期表示に使うグラント一覧。DB未接続のため呼び出し側がサンプル/永続化済みデータを渡す。 */
  initialGrants: AdvisorAccessGrant[];
  /**
   * この機能（有償アドオン）が現在のプランで利用可能かどうか。
   * false の場合はフォームを無効化し、アップグレードを促す注記を表示する。
   */
  eligible: boolean;
}

const statusBadgeClass: Record<AdvisorAccessGrant["status"], string> = {
  pending: "text-amber-700",
  active: "text-emerald-700",
  revoked: "text-stone-400",
};

function formatDateTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdvisorAccessPanel({ tenantId, initialGrants, eligible }: AdvisorAccessPanelProps) {
  const [grants, setGrants] = useState<AdvisorAccessGrant[]>(initialGrants);
  const [advisorName, setAdvisorName] = useState("");
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [scopes, setScopes] = useState<AdvisorAccessScope[]>([...ADVISOR_ACCESS_SCOPES]);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function toggleScope(scope: AdvisorAccessScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(null);
    try {
      const parsedExpiresInDays = expiresInDays.trim() ? Number(expiresInDays) : undefined;
      const newGrant = createAdvisorAccessInvite(grants, {
        tenantId,
        advisorName,
        advisorEmail,
        scopes,
        expiresInDays: parsedExpiresInDays,
      });
      setGrants((prev) => [...prev, newGrant]);
      setAdvisorName("");
      setAdvisorEmail("");
      setScopes([...ADVISOR_ACCESS_SCOPES]);
      setExpiresInDays("");
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "招待に失敗しました");
    }
  }

  function handleRevoke(grantId: string) {
    setActionError(null);
    try {
      setGrants((prev) => revokeAdvisorAccessGrant(prev, grantId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "アクセスの取り消しに失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!eligible && (
        <section className="border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          顧問税理士への閲覧共有は追加課金アドオンです。現在のプランには含まれていないため、
          招待の作成は無効になっています。ご利用にはプランのアップグレードが必要です。
        </section>
      )}

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-stone-800">顧問税理士を招待</h2>
        <p className="text-xs text-stone-500 leading-relaxed">
          既にご契約中の顧問税理士・会計事務所に、記帳データの一部を read-only（閲覧のみ）で共有できます。
          共有範囲は下記から選択でき、期間を指定すれば申告シーズンのみの限定共有も可能です。
        </p>
        <form onSubmit={handleInvite} className="flex flex-col gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500">顧問税理士のお名前・事務所名</span>
              <input
                type="text"
                required
                disabled={!eligible}
                value={advisorName}
                onChange={(e) => setAdvisorName(e.target.value)}
                placeholder="山田税理士事務所"
                className="border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-500 disabled:bg-stone-100 disabled:text-stone-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stone-500">メールアドレス</span>
              <input
                type="email"
                required
                disabled={!eligible}
                value={advisorEmail}
                onChange={(e) => setAdvisorEmail(e.target.value)}
                placeholder="advisor@example.com"
                className="border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-500 disabled:bg-stone-100 disabled:text-stone-400"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">共有するデータ範囲</span>
            <div className="flex flex-wrap gap-3">
              {ADVISOR_ACCESS_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    disabled={!eligible}
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {ADVISOR_ACCESS_SCOPE_LABELS[scope]}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 sm:w-64">
            <span className="text-xs text-stone-500">アクセス期限（任意・日数）</span>
            <input
              type="number"
              min={1}
              disabled={!eligible}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="例: 90（未入力の場合は無期限）"
              className="border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-500 disabled:bg-stone-100 disabled:text-stone-400"
            />
          </label>

          <button
            type="submit"
            disabled={!eligible}
            className="self-start bg-stone-800 text-white text-sm px-4 py-2 hover:bg-stone-700 disabled:bg-stone-300 disabled:text-stone-500 whitespace-nowrap"
          >
            招待する
          </button>
        </form>
        {inviteError && <p className="text-sm text-red-700">{inviteError}</p>}
      </section>

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-stone-800">共有中の顧問税理士</h2>

        {actionError && <p className="text-sm text-red-700">{actionError}</p>}

        {grants.length === 0 ? (
          <p className="text-sm text-stone-500">まだ顧問税理士への共有はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grants.map((grant) => {
              const expired = grant.status === "active" && isAdvisorAccessGrantExpired(grant);
              return (
                <li
                  key={grant.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-stone-200 px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span>
                      {grant.advisorName}{" "}
                      <span className="text-stone-400 text-xs">（{grant.advisorEmail}）</span>
                    </span>
                    <span className="text-xs text-stone-500 flex flex-wrap items-center gap-2">
                      <span className={statusBadgeClass[grant.status]}>
                        {ADVISOR_ACCESS_STATUS_LABELS[grant.status]}
                      </span>
                      {expired && <span className="text-red-700">（期限切れ）</span>}
                      <span>
                        共有範囲: {grant.scopes.map((scope) => ADVISOR_ACCESS_SCOPE_LABELS[scope]).join("・")}
                      </span>
                      {grant.expiresAt && <span>期限: {formatDateTime(grant.expiresAt)}まで</span>}
                    </span>
                  </div>

                  {grant.status !== "revoked" && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.id)}
                      className="self-start sm:self-auto text-xs text-red-700 underline underline-offset-2"
                    >
                      アクセスを取り消す
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-stone-400 leading-relaxed">
        本サービスは自己申告支援ツールであり、共有した記帳データ・申告書下書きの概算内容について
        当社が税務代理や個別の税務判断を行うものではありません。内容の最終確認・ご相談は、
        共有先の顧問税理士にご依頼ください。
      </p>
    </div>
  );
}
