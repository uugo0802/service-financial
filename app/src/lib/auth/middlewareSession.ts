import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ------------------------------------------------------------------
// middleware（Edge Runtime）専用のSupabaseセッション検証ヘルパー。
// docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ①参照。
//
// Next.jsのmiddlewareはcookieの読み書きをNextRequest/NextResponse経由で行う必要が
// あるため、lib/db/supabaseClient.ts のブラウザ用クライアント（createClient）とは
// 別に、@supabase/ssr の createServerClient を使う。認証Cookieが更新された場合
// （トークンのリフレッシュ等）は、返す response 側にも同じcookieを反映する。
// ------------------------------------------------------------------

/**
 * リクエストのCookieからSupabaseセッションを検証する。
 * 戻り値の response は、Supabase側でリフレッシュされたcookieを反映済みのため、
 * middleware側は（リダイレクトしない場合）この response をそのまま返すこと。
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<{ session: { user: { id: string } } | null; response: NextResponse }> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Supabase未設定の環境（ローカル開発等）ではセッション検証自体をスキップし、
    // 未ログイン扱いにはしない（DB未接続でもアプリが動作する既存方針に合わせる）。
    return { session: { user: { id: "supabase-not-configured" } }, response };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { session: user ? { user: { id: user.id } } : null, response };
}
