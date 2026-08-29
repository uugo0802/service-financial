import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/serverSession";

// ------------------------------------------------------------------
// ルートページはUIを持たず、ログイン状態に応じたリダイレクトのみを行う
// （docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ②参照）。
// 旧CSVアップロードツール（明細CSV・レシート画像からの仕訳お試し機能）は
// /quick-estimate に移設済み（ログイン不要・データ非保存のお試し機能として存続）。
// ------------------------------------------------------------------
export default async function RootPage() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/login");
}
