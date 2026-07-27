import { getSupabaseClient, AuditLogRow } from "./supabaseClient";

// schema.sql の方針どおり、audit_logs へのINSERTはクライアントからは行わない
// （改ざん防止のためサーバー側のservice roleからのみ許可する運用）。
// ここではテナントメンバーに許可された読み取りのみを提供する。

/** テナントの監査ログを一覧取得する（作成日時降順）。 */
export async function listAuditLogs(tenantId: string): Promise<AuditLogRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`監査ログの取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}
