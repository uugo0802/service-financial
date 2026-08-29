import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ------------------------------------------------------------------
// Server Component（app router）専用のセッション取得ヘルパー。
// docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ②参照。
//
// middleware（lib/auth/middlewareSession.ts）とは実行環境が異なる
// （こちらは next/headers の cookies() を使う、読み取り専用の文脈で使う想定）ため
// 別ファイルに分ける。Cookie書き込み（トークンリフレッシュの反映）はmiddleware側の
// 責務とし、こちらはリダイレクト判定のための読み取りに限定する。
// ------------------------------------------------------------------

/** 現在ログイン中かどうかだけを返す。ユーザー情報自体が必要な場合は個別に取得すること。 */
export async function getServerSession(): Promise<{ userId: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Supabase未設定の環境ではセッション判定自体ができないため、未ログインとして扱う
    // （ルートページのリダイレクト先は /login になる。DB未接続でも /login 自体は
    // マジックリンク未送信の状態で表示できるため、アプリの動作は壊れない）。
    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Componentからはcookieを書き込めないため何もしない
        // （トークンリフレッシュの反映はmiddleware側が担う）。
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { userId: user.id } : null;
}
