"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TwoFactorSetupForm } from "@/components/TwoFactorSetupForm";
import { TwoFactorFactor, listTotpFactors, unenrollTotpFactor } from "@/lib/auth/twoFactor";
import { PageTitle } from "@/components/ui/PageTitle";

export default function SecuritySettingsPage() {
  const [factors, setFactors] = useState<TwoFactorFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // getSupabaseClient() は環境変数未設定時に同期的に例外を投げるため（login/page.tsxと同様）、
  // listTotpFactors() 呼び出し全体をtry/catchで囲み、Supabase未設定の状態を区別する。
  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const { data, error } = await listTotpFactors();
      setConfigError(null);
      if (error) {
        setListError(error);
      } else {
        setFactors(data ?? []);
      }
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "Supabaseが未設定です");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // refresh() の内部は setLoading(true) 等のsetStateを同期的に呼ぶため、
    // login/page.tsx と同様にマイクロタスク経由で呼び出し、
    // エフェクト本体での同期的なsetStateを避ける。
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleUnenroll(factorId: string) {
    setRemovingId(factorId);
    const { error } = await unenrollTotpFactor(factorId);
    setRemovingId(null);
    if (error) {
      setListError(error);
      return;
    }
    await refresh();
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">二要素認証（2FA）</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            認証アプリ（Google Authenticator・1Password等）を使ったTOTPベースの二要素認証を設定・管理できます。
            記帳データや税務情報など機微な情報を取り扱うため、二要素認証の設定を推奨します。
          </p>
        </section>

        {configError && (
          <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
            Supabaseが未設定のため、二要素認証機能はまだ利用できません（開発中のプロトタイプです）。
          </div>
        )}

        {!configError && (
          <>
            <TwoFactorSetupForm onEnrolled={refresh} />

            <section className="border border-border bg-surface p-5 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">登録済みの認証アプリ</h2>

              {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
              {listError && <p className="text-sm text-red-700">{listError}</p>}
              {!loading && !listError && factors.length === 0 && (
                <p className="text-sm text-muted-foreground">登録済みの二要素認証はありません。</p>
              )}

              {factors.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {factors.map((factor) => (
                    <li
                      key={factor.id}
                      className="flex items-center justify-between border border-border px-3 py-2 text-sm"
                    >
                      <div className="flex items-baseline gap-2">
                        <span>{factor.friendlyName ?? factor.id}</span>
                        <span
                          className={`text-xs ${
                            factor.status === "verified" ? "text-emerald-700" : "text-muted-foreground"
                          }`}
                        >
                          {factor.status === "verified" ? "有効" : "未検証"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnenroll(factor.id)}
                        disabled={removingId === factor.id}
                        className="text-xs text-red-700 underline underline-offset-2 disabled:text-muted-foreground"
                      >
                        {removingId === factor.id ? "解除中…" : "解除"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <Link href="/settings" className="text-xs text-muted-foreground underline underline-offset-2 self-start">
          ← 事業者設定に戻る
        </Link>
      </PageContainer>
    </div>
  );
}
