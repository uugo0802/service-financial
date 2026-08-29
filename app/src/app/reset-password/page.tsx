"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PasswordResetError,
  PasswordResetTokenRecord,
  buildPasswordResetUrl,
  checkPasswordStrength,
  createPasswordResetRequest,
  describeInvalidReason,
  resetPassword,
  validatePasswordResetToken,
} from "@/lib/auth/passwordReset";

// ------------------------------------------------------------------
// パスワード再設定（アカウント復旧）ページ。
//
// lib/auth/passwordReset.ts は実際のDB永続化・メール送信を行わない純粋関数群のため、
// このページでは「発行したトークンをどこかに一時保存し、リンクを踏んだときに
// 同じトークンを引けるようにする」ための最小限の受け皿として localStorage を使う。
// これは authClient.ts が接続する Supabase のような本物のバックエンドの代わりに
// 開発中のプロトタイプとして用意した仕組みであり、本番運用にはサーバー側での
// トークン発行・メール送信・パスワード永続化への置き換えが必要（他ページの
// 「開発中のプロトタイプです」表示と同様の位置づけ）。
// ------------------------------------------------------------------

const RESET_TOKENS_STORAGE_KEY = "passwordReset.tokens.v1";

function loadResetTokenRecords(): Record<string, PasswordResetTokenRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RESET_TOKENS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PasswordResetTokenRecord>) : {};
  } catch {
    return {};
  }
}

function saveResetTokenRecord(record: PasswordResetTokenRecord): void {
  if (typeof window === "undefined") return;
  const all = loadResetTokenRecords();
  all[record.token] = record;
  window.localStorage.setItem(RESET_TOKENS_STORAGE_KEY, JSON.stringify(all));
}

function findResetTokenRecord(token: string): PasswordResetTokenRecord | null {
  return loadResetTokenRecords()[token] ?? null;
}

const inputClass = "border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40";

function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-md px-6 py-4">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-16 flex flex-col gap-6">{children}</main>
    </div>
  );
}

type RequestStatus = "idle" | "submitting" | "sent" | "error";

function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const record = createPasswordResetRequest({ email });
      saveResetTokenRecord(record);
      // 実際のメール送信は行わないため、開発中の代替表示として相対パスのリンクを組み立てる
      // （本番実装では、これをメール本文内の絶対URLとして送信する）。
      setDevResetUrl(buildPasswordResetUrl(record.token));
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof PasswordResetError ? "メールアドレスの形式が正しくありません。" : "パスワード再設定のリクエストに失敗しました。",
      );
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">パスワードをお忘れの方</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
      </p>

      {status === "sent" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 p-4">
            {email} 宛にパスワード再設定用のリンクを送信しました。メールをご確認ください。
          </p>
          {devResetUrl && (
            <div className="border border-amber-300 bg-amber-50 text-amber-800 text-xs p-4 leading-relaxed break-all">
              開発中のプロトタイプのため、メール送信の代わりにここにリンクを表示しています。
              <br />
              <Link href={devResetUrl} className="underline underline-offset-2">
                {devResetUrl}
              </Link>
            </div>
          )}
        </div>
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
              className={inputClass}
            />
          </label>
          {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className={`text-sm px-5 py-3 border transition-colors ${
              status === "submitting"
                ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                : "border-accent bg-accent text-white hover:opacity-90"
            }`}
          >
            {status === "submitting" ? "送信中…" : "再設定用リンクを送る"}
          </button>
        </form>
      )}

      <Link href="/login" className="text-xs text-muted-foreground underline underline-offset-2 self-start">
        ← ログインに戻る
      </Link>
    </section>
  );
}

type TokenCheckStatus = "checking" | "valid" | "invalid";
type SubmitStatus = "idle" | "submitting" | "success" | "error";

function SetNewPasswordForm({ token }: { token: string }) {
  const [checkStatus, setCheckStatus] = useState<TokenCheckStatus>("checking");
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [record, setRecord] = useState<PasswordResetTokenRecord | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // login/page.tsx や settings/security/page.tsx と同様、エフェクト本体での
    // 同期的なsetStateを避けるため、マイクロタスク経由で呼び出す。
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const found = findResetTokenRecord(token);
      const validation = validatePasswordResetToken(found, token);
      if (validation.valid) {
        setRecord(found);
        setCheckStatus("valid");
      } else {
        setInvalidMessage(describeInvalidReason(validation.reason));
        setCheckStatus("invalid");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    setErrorMessage(null);

    const result = resetPassword({ record, token, newPassword, confirmPassword });

    if (!result.success) {
      setSubmitStatus("error");
      setErrorMessage(result.error);
      return;
    }

    saveResetTokenRecord(result.record);
    setSubmitStatus("success");
  }

  if (checkStatus === "checking") {
    return <p className="text-sm text-muted-foreground">確認中…</p>;
  }

  if (checkStatus === "invalid") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">パスワードの再設定</h1>
        <p className="text-sm text-red-700 border border-red-300 bg-red-50 p-4">{invalidMessage}</p>
        <Link href="/reset-password" className="text-sm px-5 py-3 border border-accent bg-accent text-white hover:opacity-90 transition-colors self-start">
          もう一度リクエストする
        </Link>
      </section>
    );
  }

  if (submitStatus === "success") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">パスワードの再設定</h1>
        <p className="text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 p-4">
          パスワードを再設定しました。新しいパスワードでログインしてください。
        </p>
        <Link href="/login" className="text-sm px-5 py-3 border border-accent bg-accent text-white hover:opacity-90 transition-colors self-start">
          ログインへ進む
        </Link>
      </section>
    );
  }

  const strength = checkPasswordStrength(newPassword);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">パスワードの再設定</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">新しいパスワードを入力してください。</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          新しいパスワード
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          新しいパスワード（確認）
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {newPassword.length > 0 && !strength.valid && (
          <ul className="text-xs text-muted-foreground list-disc pl-4 flex flex-col gap-0.5">
            {strength.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

        <button
          type="submit"
          disabled={submitStatus === "submitting"}
          className={`text-sm px-5 py-3 border transition-colors ${
            submitStatus === "submitting"
              ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
              : "border-accent bg-accent text-white hover:opacity-90"
          }`}
        >
          {submitStatus === "submitting" ? "設定中…" : "パスワードを設定する"}
        </button>
      </form>
    </section>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return token ? <SetNewPasswordForm token={token} /> : <RequestResetForm />;
}

export default function ResetPasswordPage() {
  return (
    <PageChrome>
      <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
        <ResetPasswordContent />
      </Suspense>
    </PageChrome>
  );
}
