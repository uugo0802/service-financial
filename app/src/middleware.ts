import { NextResponse, type NextRequest } from "next/server";
import { isAuthExemptPath } from "@/lib/navigation/appShellNav";
import { getSessionFromRequest } from "@/lib/auth/middlewareSession";

// docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ①参照。
// AppShell対象ページ（＝AUTH_EXEMPT_PATHSに含まれないページ）は、未ログイン時に
// /login?redirect=<元のパス> へリダイレクトする。
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthExemptPath(pathname)) {
    return NextResponse.next();
  }

  const { session, response } = await getSessionFromRequest(request);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // 静的アセット・PWA関連ファイル・APIルートはmiddlewareの対象外とする。
  // /api/categorize・/api/ocr は /quick-estimate（未ログインお試し機能）が呼び出すため、
  // 認証必須にすると /quick-estimate 自体が壊れる。
  matcher: [
    "/((?!_next/static|_next/image|api/|favicon\\.ico|apple-icon\\.png|manifest|sw\\.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|webmanifest)$).*)",
  ],
};
