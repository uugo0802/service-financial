import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/serverSession";

// ------------------------------------------------------------------
// ルートページはUIを持たず、ログイン状態に応じたリダイレクトのみを行う
// （docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ②参照）。
// 旧CSVアップロードツール（明細CSV・レシート画像からの仕訳お試し機能）は
// 一時 /quick-estimate に移設していたが、実際の記帳フロー（/transactions）と
// 機能が重複し、Supabaseへ保存もされない非接続のデモになっていたため削除した
// （docs/superpowers/specs/2026-08-30-nav-slimdown-and-entity-simplify-design.md ③参照）。
// ------------------------------------------------------------------
export default async function RootPage() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/login");
}
