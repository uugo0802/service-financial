"use client";

import { useState } from "react";
import { enrollTotpFactor, verifyTotpFactor, TwoFactorEnrollment } from "@/lib/auth/twoFactor";

type SetupStep = "idle" | "enrolling" | "awaiting-code" | "verifying" | "verified";

interface TwoFactorSetupFormProps {
  /** 検証済みfactorの登録完了時に呼ばれる（呼び出し側で一覧の再取得等に使う）。 */
  onEnrolled?: () => void;
}

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";

/**
 * TOTPベースの二要素認証(2FA)を設定するフォーム。
 * enroll（QR/シークレット表示）→ 認証アプリでの読み取り → 検証コード入力 → 確認、の流れ。
 */
export function TwoFactorSetupForm({ onEnrolled }: TwoFactorSetupFormProps) {
  const [step, setStep] = useState<SetupStep>("idle");
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStartEnroll() {
    setStep("enrolling");
    setErrorMessage(null);

    const { data, error } = await enrollTotpFactor();

    if (error || !data) {
      setStep("idle");
      setErrorMessage(error ?? "TOTPの登録に失敗しました");
      return;
    }

    setEnrollment(data);
    setStep("awaiting-code");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment || step === "verifying") return;

    setStep("verifying");
    setErrorMessage(null);

    const { error } = await verifyTotpFactor(enrollment.factorId, code);

    if (error) {
      setStep("awaiting-code");
      setErrorMessage(error);
      return;
    }

    setStep("verified");
    setCode("");
    onEnrolled?.();
  }

  function handleReset() {
    setStep("idle");
    setEnrollment(null);
    setCode("");
    setErrorMessage(null);
  }

  if (step === "verified") {
    return (
      <div className="border border-emerald-300 bg-emerald-50 p-5 flex flex-col gap-3">
        <p className="text-sm text-emerald-800">
          二要素認証（TOTP）を設定しました。次回以降のログイン時に認証アプリの確認コードが必要になります。
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="self-start text-xs text-muted-foreground underline underline-offset-2"
        >
          別の端末をもう1つ登録する
        </button>
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="border border-border bg-surface p-5 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Google Authenticator・1Password等の認証アプリを使ったTOTPベースの二要素認証を設定できます。
          記帳データや税務情報など機微な情報を保護するため、設定を推奨します。
        </p>
        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        <button
          type="button"
          onClick={handleStartEnroll}
          className="self-start text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors"
        >
          二要素認証を設定する
        </button>
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <div className="border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">登録準備中…</p>
      </div>
    );
  }

  // step === "awaiting-code" | "verifying"
  return (
    <div className="border border-border bg-surface p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">
          認証アプリでQRコードを読み取るか、シークレットキーを手動で入力してください。
        </p>
        {enrollment && (
          <>
            {/* SupabaseがレスポンスとしてSVG文字列を返すため、data URIとしてそのまま表示する。
                next/image の最適化・リモートパターン設定は不要な動的data URIのため、素のimgタグを使う。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`}
              alt="TOTP設定用QRコード"
              width={180}
              height={180}
              className="border border-stone-300"
            />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              シークレットキー（手動入力用）
              <input
                type="text"
                readOnly
                value={enrollment.secret}
                className={`${inputClass} font-mono`}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          </>
        )}
      </div>

      <form onSubmit={handleVerify} className="flex flex-col gap-3" noValidate>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          認証アプリに表示されている6桁の確認コード
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
        </label>

        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={step === "verifying" || code.length === 0}
            className={`text-sm px-5 py-2.5 border transition-colors ${
              step === "verifying" || code.length === 0
                ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                : "border-accent bg-accent text-white hover:opacity-90"
            }`}
          >
            {step === "verifying" ? "確認中…" : "確認する"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
