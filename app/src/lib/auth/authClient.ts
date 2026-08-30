import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabaseClient";

// ------------------------------------------------------------------
// Supabase Auth（メール+マジックリンク）でのログイン/サインアップ/ログアウト。
// docs/cto-tech-architecture.md の認証方針: 「Supabase Auth（メール+マジックリンク、
// 将来2要素認証）」。マジックリンクは未登録メールに対しては自動的にサインアップも兼ねる
// ため、ログインとサインアップで別APIを分ける必要がない。
// ------------------------------------------------------------------

export interface AuthResult {
  error: string | null;
}

/**
 * 指定メールアドレス宛にマジックリンクを送信する（未登録メールなら新規登録も兼ねる）。
 * @param email 送信先メールアドレス
 * @param redirectTo リンククリック後に戻すURL（未指定ならSupabase側のデフォルト設定に従う）
 */
export async function signInWithMagicLink(email: string, redirectTo?: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });

  return { error: error?.message ?? null };
}

/**
 * Google OAuthでのログイン/サインアップを開始する（SupabaseのGoogleプロバイダ経由）。
 * 呼び出すとブラウザがGoogleの認可画面へ遷移するため、戻り値のerrorはリダイレクト前に
 * 判明した設定不備（プロバイダ未設定等）のみを表す。
 * @param redirectTo 認可完了後に戻すURL（未指定ならSupabase側のデフォルト設定に従う）
 */
export async function signInWithGoogle(redirectTo?: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined,
  });

  return { error: error?.message ?? null };
}

/** 現在のセッションを終了する。 */
export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

/** 現在のセッション（未ログインなら null）を取得する。 */
export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
