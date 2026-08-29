import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "./middleware";

// getSessionFromRequestはSupabase(@supabase/ssr)への実通信を伴うため、
// middleware.tsの分岐ロジック（除外パスの素通り・未ログイン時のリダイレクト・
// リダイレクト先へのredirectクエリパラメータ付与）のみを単体テストする対象として、
// ここではモックに差し替える。
vi.mock("@/lib/auth/middlewareSession", () => ({
  getSessionFromRequest: vi.fn(),
}));

import { getSessionFromRequest } from "@/lib/auth/middlewareSession";

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "https://example.com"));
}

describe("middleware", () => {
  it("認証除外パス（例: /login）は素通りする", async () => {
    const res = await middleware(makeRequest("/login"));
    expect(res.status).toBe(200);
    expect(getSessionFromRequest).not.toHaveBeenCalled();
  });

  it("保護対象パスで未ログインの場合、/login?redirect=<元のパス>へリダイレクトする", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({ session: null, response: NextResponse.next() });

    const res = await middleware(makeRequest("/dashboard"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("保護対象パスでログイン済みの場合、素通りする", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({
      session: { user: { id: "user-1" } },
      response: NextResponse.next(),
    });

    const res = await middleware(makeRequest("/dashboard"));

    expect(res.status).toBe(200);
  });
});
