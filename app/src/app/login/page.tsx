"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/db/supabaseClient";
import { signInWithMagicLink, signOut } from "@/lib/auth/authClient";

type SendStatus = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [configError, setConfigError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // マジックリンクのメール送信・ログアウトそのものは lib/auth/authClient 経由で行うが、
  // ログイン状態の表示にはリアルタイム購読(onAuthStateChange)が必要なため、
  // ここでは getSupabaseClient() を直接呼ぶ。
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // getSupabaseClient() は環境変数未設定時に同期的に例外を投げるため、
    // Promise チェーンの中で呼び出して .catch() 側に倒す
    // （エフェクト本体で同期的に setState するとカスケードレンダリングの警告になるため）。
    Promise.resolve()
      .then(() => getSupabaseClient())
      .then(async (supabase) => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);

        const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
          setSession(newSession);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch((e) => {
        if (cancelled) return;
        setConfigError(e instanceof Error ? e.message : "Supabaseが未設定です");
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrorMessage(null);

    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
    const { error } = await signInWithMagicLink(email, redirectTo);

    if (error) {
      setStatus("error");
      setErrorMessage(error);
      return;
    }
    setStatus("sent");
  }

  async function handleLogout() {
    await signOut();
    setSession(null);
  }

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-md px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-16 flex flex-col gap-6">
        {configError && (
          <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
            Supabaseが未設定のため、ログイン機能はまだ利用できません（開発中のプロトタイプです）。
          </div>
        )}

        {!configError && checkingSession && <p className="text-sm text-stone-500">読み込み中…</p>}

        {!configError && !checkingSession && session && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">ログイン中</h1>
            <p className="text-sm text-stone-600">{session.user.email} としてログインしています。</p>
            <button
              type="button"
              onClick={handleLogout}
              className="self-start text-sm px-5 py-3 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
            >
              ログアウト
            </button>
          </section>
        )}

        {!configError && !checkingSession && !session && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">ログイン / 新規登録</h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              メールアドレス宛にログイン用リンクをお送りします。未登録のメールアドレスの場合は、
              自動的にアカウントが作成されます。パスワードの入力は不要です。
            </p>

            {status === "sent" ? (
              <p className="text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 p-4">
                {email} 宛にログイン用リンクを送信しました。メールをご確認ください。
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-stone-500">
                  メールアドレス
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="border border-stone-400 bg-white px-4 py-3 text-sm outline-none focus:border-stone-600"
                  />
                </label>
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className={`text-sm px-5 py-3 border transition-colors ${
                    status === "sending"
                      ? "border-stone-300 bg-stone-100 text-stone-400 cursor-not-allowed"
                      : "border-stone-900 bg-stone-900 text-white hover:bg-stone-700"
                  }`}
                >
                  {status === "sending" ? "送信中…" : "ログインリンクを送る"}
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
