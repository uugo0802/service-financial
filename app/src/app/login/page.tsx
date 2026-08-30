"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/db/supabaseClient";
import { signInWithGoogle, signInWithMagicLink, signOut } from "@/lib/auth/authClient";

type SendStatus = "idle" | "sending" | "sent" | "error";

const DEFAULT_REDIRECT = "/dashboard";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // middlewareが未ログイン時に付与する ?redirect=<元のパス> を、ログイン成功後の
  // 遷移先として使う（docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ②）。
  // 外部URLへのオープンリダイレクトを防ぐため、"/"始まりの相対パスのみ許可する。
  const redirectParam = searchParams.get("redirect");
  const redirectTarget = redirectParam && redirectParam.startsWith("/") ? redirectParam : DEFAULT_REDIRECT;

  const [configError, setConfigError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<SendStatus>("idle");
  const [googleErrorMessage, setGoogleErrorMessage] = useState<string | null>(null);

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

  // ログイン済み（既存セッション or マジックリンク経由の新規セッション）になった時点で、
  // redirect先へ遷移する。middlewareのCookie反映を待つため、単純なpushではなく
  // refreshを挟んでサーバー側の判定もやり直させる。
  useEffect(() => {
    if (!checkingSession && session) {
      router.replace(redirectTarget);
      router.refresh();
    }
  }, [checkingSession, session, redirectTarget, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrorMessage(null);

    // /login自身ではなく、認証コードの交換(exchangeCodeForSession)を行う
    // /auth/confirm ルートハンドラへ遷移させる（app/src/app/auth/confirm/route.ts参照）。
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent(redirectTarget)}`
        : undefined;
    const { error } = await signInWithMagicLink(email, redirectTo);

    if (error) {
      setStatus("error");
      setErrorMessage(error);
      return;
    }
    setStatus("sent");
  }

  async function handleGoogleLogin() {
    if (googleStatus === "sending") return;
    setGoogleStatus("sending");
    setGoogleErrorMessage(null);

    // マジックリンクと同じ /auth/confirm ルートハンドラでコード交換を行う。
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent(redirectTarget)}`
        : undefined;
    const { error } = await signInWithGoogle(redirectTo);

    if (error) {
      setGoogleStatus("error");
      setGoogleErrorMessage(error);
      return;
    }
    // 成功時はSupabase側がブラウザをGoogleの認可画面へ遷移させるため、
    // ここでのステート更新は不要（このコンポーネント自体が離脱する）。
  }

  async function handleLogout() {
    await signOut();
    setSession(null);
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-md px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-16 flex flex-col gap-6">
        {configError && (
          <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
            Supabaseが未設定のため、ログイン機能はまだ利用できません（開発中のプロトタイプです）。
          </div>
        )}

        {!configError && checkingSession && <p className="text-sm text-muted-foreground">読み込み中…</p>}

        {!configError && !checkingSession && session && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">ログイン中</h1>
            <p className="text-sm text-muted-foreground">{session.user.email} としてログインしています。</p>
            <p className="text-sm text-muted-foreground">まもなく移動します…</p>
            <button
              type="button"
              onClick={handleLogout}
              className="self-start text-sm px-5 py-3 border border-border bg-surface hover:border-foreground/40 transition-colors"
            >
              ログアウト
            </button>
          </section>
        )}

        {!configError && !checkingSession && !session && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">ログイン / 新規登録</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              メールアドレス宛にログイン用リンクをお送りします。未登録のメールアドレスの場合は、
              自動的にアカウントが作成されます。パスワードの入力は不要です。
            </p>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleStatus === "sending"}
              className={`flex items-center justify-center gap-2 text-sm px-5 py-3 border transition-colors ${
                googleStatus === "sending"
                  ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                  : "border-border bg-surface hover:border-foreground/40"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5C29.6 34.7 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.3 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.5C41.5 36.2 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z"
                />
              </svg>
              {googleStatus === "sending" ? "Googleに接続中…" : "Googleでログイン / 新規登録"}
            </button>
            {googleErrorMessage && <p className="text-sm text-red-700">{googleErrorMessage}</p>}

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex-1 border-t border-border" />
              または
              <span className="flex-1 border-t border-border" />
            </div>

            {status === "sent" ? (
              <p className="text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 p-4">
                {email} 宛にログイン用リンクを送信しました。メールをご確認ください。
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  メールアドレス
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className={`text-sm px-5 py-3 border transition-colors ${
                    status === "sending"
                      ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                      : "border-accent bg-accent text-white hover:opacity-90"
                  }`}
                >
                  {status === "sending" ? "送信中…" : "ログインリンクを送る"}
                </button>
                <Link href="/reset-password" className="text-xs text-muted-foreground underline underline-offset-2 self-start">
                  パスワードをお忘れですか？
                </Link>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginPageInner />
    </Suspense>
  );
}
