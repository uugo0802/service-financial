import { getSupabaseClient } from "../db/supabaseClient";

// ------------------------------------------------------------------
// Supabase Auth MFA（TOTPによる二要素認証）の薄いラッパー。
// docs/cto-tech-architecture.md §4.2「データセキュリティ最低要件」の
// アクセス制御強化の一環として、authClient.ts のマジックリンク認証に
// 加えてTOTPベースの2FAのenroll/verify/list/unenrollを提供する。
// authClient.ts と同じく、Supabaseクライアントの薄いラッパーに徹し、
// 業務ロジックは持たない。
// ------------------------------------------------------------------

const TOTP_ISSUER = "税務申告AI（ジャービス）";

/** enrollTotpFactor が返すTOTP登録情報。 */
export interface TwoFactorEnrollment {
  /** 登録されたfactorのID（verify/unenrollで使用）。 */
  factorId: string;
  /** 認証アプリで読み取るQRコード（SVG文字列）。 */
  qrCode: string;
  /** QRコードが読み取れない場合の手動入力用シークレット。 */
  secret: string;
  /** QRコードに埋め込まれているotpauth:// URI。 */
  uri: string;
}

export interface TwoFactorEnrollResult {
  data: TwoFactorEnrollment | null;
  error: string | null;
}

export interface TwoFactorActionResult {
  error: string | null;
}

/** 登録済みのTOTP factor（一覧表示用）。 */
export interface TwoFactorFactor {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
  updatedAt: string;
}

export interface TwoFactorListResult {
  data: TwoFactorFactor[] | null;
  error: string | null;
}

/**
 * 新しいTOTP factorの登録を開始する。QRコード・シークレットを含む結果を返す。
 * この時点ではfactorは未検証（unverified）で、verifyTotpFactor()で検証コードを
 * 照合するまで有効な2FA要素としては扱われない。
 * @param friendlyName 複数端末を区別するための表示名（任意）
 */
export async function enrollTotpFactor(friendlyName?: string): Promise<TwoFactorEnrollResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: TOTP_ISSUER,
    ...(friendlyName ? { friendlyName } : {}),
  });

  if (error || !data) {
    return { data: null, error: error?.message ?? "TOTPの登録に失敗しました" };
  }

  return {
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
    error: null,
  };
}

/**
 * 認証アプリに表示された検証コードを照合し、factorを検証済み状態にする。
 * 内部的にはチャレンジの発行と検証を1回のSupabase呼び出し（challengeAndVerify）
 * で行う。
 * @param factorId enrollTotpFactor() で得たfactor ID
 * @param code 認証アプリに表示されている6桁の検証コード
 */
export async function verifyTotpFactor(factorId: string, code: string): Promise<TwoFactorActionResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return { error: error?.message ?? null };
}

/** 現在ログイン中ユーザーに登録されているTOTP factor（検証済み・未検証を含む）の一覧を返す。 */
export async function listTotpFactors(): Promise<TwoFactorListResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error || !data) {
    return { data: null, error: error?.message ?? "2要素認証の一覧取得に失敗しました" };
  }

  const factors: TwoFactorFactor[] = data.all
    .filter((factor) => factor.factor_type === "totp")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      status: factor.status,
      createdAt: factor.created_at,
      updatedAt: factor.updated_at,
    }));

  return { data: factors, error: null };
}

/**
 * 登録済みのTOTP factorを解除する。
 * @param factorId 解除対象のfactor ID
 */
export async function unenrollTotpFactor(factorId: string): Promise<TwoFactorActionResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { error: error?.message ?? null };
}
