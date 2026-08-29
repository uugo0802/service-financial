import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// ------------------------------------------------------------------
// マジックリンクのメール内リンク（Supabaseの{{ .ConfirmationURL }}）が
// 最終的にたどり着くルートハンドラ。
//
// 2026-08-30発見: emailRedirectToが直接 /login を指していたため、
// メールリンククリック後にSupabaseが付与する認証コード(?code=)を
// 誰も交換(exchangeCodeForSession)しておらず、セッションが一切
// 確立されないままログイン画面に戻っていた。
//
// Route Handlerはnext/headersのcookies()経由でCookieの書き込みができる
// （Server Componentは読み取り専用のため lib/auth/serverSession.ts では
// 書き込めなかった）。ここでセッションをCookieに確立してから、
// nextパラメータ（元々middlewareが付与したredirect先）へリダイレクトする。
// ------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (code && url && anonKey) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
