// ------------------------------------------------------------------
// アカウント復旧（パスワードリセット）のロジック。
//
// authClient.ts が採用しているSupabase Authのマジックリンク（メールのみ、
// パスワード不要）は便利な反面、メールを受信できない・紛失した等の理由で
// ロックアウトされたユーザーが自己解決できる復旧経路が存在しない。
// このモジュールは、そうしたセルフサービス型のアカウント復旧
// （リセットトークンの発行・検証・新しい認証情報の設定）を提供する。
//
// referral/inviteProgram.ts と同様、実際のDB永続化・メール送信・外部通信は
// 一切行わない純粋関数のみで構成する。トークンレコードの永続化は呼び出し側
// （UI層、将来的なバックエンド実装）の責務とし、ここでは「レコードを受け取り、
// 新しいレコード/判定結果を返す」状態遷移として表現する。時刻は `now` 引数で
// 注入可能にし、テスト容易性を確保する。
// ------------------------------------------------------------------

/** リセットトークンの有効期限（分）。デフォルト値。 */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

/** 新しいパスワードの最小文字数。 */
export const PASSWORD_MIN_LENGTH = 12;

/** リセットトークンの発行・検証に関する不正な状態遷移を表すエラー。 */
export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

/** リセットトークンのレコード（呼び出し側が永続化する想定）。 */
export interface PasswordResetTokenRecord {
  token: string;
  /** 正規化済み（trim + 小文字化）のメールアドレス。 */
  email: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  used: boolean;
  usedAt?: string; // ISO 8601（使用済みになったタイミング）
}

// --------------------------------------------------------------
// トークン発行
// --------------------------------------------------------------

/**
 * Web Crypto（`globalThis.crypto.randomUUID`）を使ってランダムなリセットトークンを生成する。
 * Node/ブラウザの両方で利用可能な標準APIであり、ネットワーク通信は発生しない。
 */
function generateResetToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new PasswordResetError("generateResetToken: crypto.randomUUID is not available in this environment");
  }
  // UUID単体（衝突確率的には十分だが）よりも長く、推測されにくいトークンにするため2つ連結する。
  return `${randomUUID.call(globalThis.crypto)}${randomUUID.call(globalThis.crypto)}`.replace(/-/g, "");
}

/** 表示・比較用にメールアドレスを正規化する（前後空白の除去 + 小文字化）。 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreatePasswordResetRequestParams {
  email: string;
  /** テスト等で時刻を固定したい場合に指定。省略時は `new Date()`。 */
  now?: Date;
  /** テスト等でトークンを固定したい場合に指定。省略時はランダム生成。 */
  token?: string;
  /** 有効期限（分）。省略時は `PASSWORD_RESET_TOKEN_TTL_MINUTES`。 */
  ttlMinutes?: number;
}

/**
 * パスワードリセットの申請を受け付け、新しいトークンレコードを発行する。
 * 実際のメール送信は行わない（呼び出し側UIが、開発時はリンクを直接表示する等で代替する）。
 */
export function createPasswordResetRequest(params: CreatePasswordResetRequestParams): PasswordResetTokenRecord {
  const email = normalizeEmail(params.email);
  if (email.length === 0) {
    throw new PasswordResetError("createPasswordResetRequest: email must not be empty");
  }
  if (!email.includes("@")) {
    throw new PasswordResetError("createPasswordResetRequest: email must be a valid email address");
  }

  const now = params.now ?? new Date();
  const ttlMinutes = params.ttlMinutes ?? PASSWORD_RESET_TOKEN_TTL_MINUTES;
  const token = params.token ?? generateResetToken();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

  return {
    token,
    email,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
  };
}

/**
 * リセットトークンの共有用URL（相対パス）を組み立てる。
 * `origin` を渡すと絶対URLになる（例: クライアント側で `window.location.origin` を渡す）。
 */
export function buildPasswordResetUrl(token: string, origin?: string): string {
  const path = `/reset-password?token=${encodeURIComponent(token)}`;
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}

// --------------------------------------------------------------
// トークン検証
// --------------------------------------------------------------

export type PasswordResetTokenInvalidReason = "invalid" | "expired" | "used";

export type PasswordResetTokenValidation =
  | { valid: true }
  | { valid: false; reason: PasswordResetTokenInvalidReason };

/** トークンが期限切れかどうかを判定する。 */
export function isPasswordResetTokenExpired(record: PasswordResetTokenRecord, now: Date = new Date()): boolean {
  return now.getTime() > new Date(record.expiresAt).getTime();
}

/**
 * リセットトークンの有効性を検証する（副作用なし）。
 * `record` は呼び出し側が永続化から取得してきたレコード（見つからなければ `null`/`undefined`）。
 *
 * 判定順序: レコードが存在しトークン文字列が一致するか → 使用済みでないか → 期限切れでないか。
 */
export function validatePasswordResetToken(
  record: PasswordResetTokenRecord | null | undefined,
  token: string,
  now: Date = new Date(),
): PasswordResetTokenValidation {
  if (!record || record.token !== token) {
    return { valid: false, reason: "invalid" };
  }
  if (record.used) {
    return { valid: false, reason: "used" };
  }
  if (isPasswordResetTokenExpired(record, now)) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true };
}

/** `PasswordResetTokenValidation` の不正理由を、UI表示用の日本語メッセージに変換する。 */
export function describeInvalidReason(reason: PasswordResetTokenInvalidReason): string {
  switch (reason) {
    case "expired":
      return "このリンクの有効期限が切れています。もう一度パスワード再設定をリクエストしてください。";
    case "used":
      return "このリンクはすでに使用されています。もう一度パスワード再設定をリクエストしてください。";
    case "invalid":
    default:
      return "このリンクは無効です。URLをご確認いただくか、もう一度パスワード再設定をリクエストしてください。";
  }
}

// --------------------------------------------------------------
// パスワード強度チェック
// --------------------------------------------------------------

export interface PasswordStrengthResult {
  valid: boolean;
  /** 満たしていない要件ごとの日本語メッセージ（valid が true のときは空配列）。 */
  reasons: string[];
}

/**
 * 新しいパスワードの強度を検証する（副作用なし）。
 * 記帳データ・税務情報など機微な情報を扱うサービスであるため、以下を最低要件とする:
 * - {@link PASSWORD_MIN_LENGTH} 文字以上
 * - 小文字・大文字・数字・記号をそれぞれ1文字以上含む
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const reasons: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    reasons.push(`パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`);
  }
  if (!/[a-z]/.test(password)) {
    reasons.push("小文字を1文字以上含めてください。");
  }
  if (!/[A-Z]/.test(password)) {
    reasons.push("大文字を1文字以上含めてください。");
  }
  if (!/[0-9]/.test(password)) {
    reasons.push("数字を1文字以上含めてください。");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    reasons.push("記号を1文字以上含めてください。");
  }

  return { valid: reasons.length === 0, reasons };
}

// --------------------------------------------------------------
// パスワードの再設定
// --------------------------------------------------------------

export interface ResetPasswordParams {
  /** 呼び出し側が永続化から取得してきたトークンレコード（見つからなければ `null`/`undefined`）。 */
  record: PasswordResetTokenRecord | null | undefined;
  token: string;
  newPassword: string;
  confirmPassword: string;
  /** テスト等で時刻を固定したい場合に指定。省略時は `new Date()`。 */
  now?: Date;
}

export type ResetPasswordResult =
  | { success: true; record: PasswordResetTokenRecord }
  | { success: false; error: string };

/**
 * 有効なリセットトークンを使って新しいパスワードを設定する。
 *
 * 実際の認証情報の永続化（DB更新等）は行わない。成功時は「使用済み」に
 * 遷移した新しいトークンレコードを返すので、呼び出し側でそれを保存し
 * （＝以後同じトークンを再利用できないようにし）、別途パスワードの永続化を行う。
 */
export function resetPassword(params: ResetPasswordParams): ResetPasswordResult {
  const { record, token, newPassword, confirmPassword, now = new Date() } = params;

  const tokenCheck = validatePasswordResetToken(record, token, now);
  if (!tokenCheck.valid) {
    return { success: false, error: describeInvalidReason(tokenCheck.reason) };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "確認用パスワードが一致しません。" };
  }

  const strength = checkPasswordStrength(newPassword);
  if (!strength.valid) {
    return { success: false, error: strength.reasons.join(" ") };
  }

  // tokenCheck.valid が true の場合、record は必ず non-null（validatePasswordResetToken の実装より）。
  const usedRecord: PasswordResetTokenRecord = {
    ...(record as PasswordResetTokenRecord),
    used: true,
    usedAt: now.toISOString(),
  };

  return { success: true, record: usedRecord };
}
