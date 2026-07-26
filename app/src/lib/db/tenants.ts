import { getSupabaseClient, Tenant, TenantUser } from "./supabaseClient";

// ------------------------------------------------------------------
// tenants / tenant_users への読み取り専用アクセス。
// schema.sql の tenant_users.user_id は auth.users.id を主キーとするため、
// 1ユーザーにつき所属テナントは常に高々1件（将来の複数テナント対応まではこの前提でよい）。
// 他テーブルのCRUD関数はここで解決した tenantId を引数として受け取り、
// 呼び出し側で明示的にテナントスコープを指定させることで、RLSに加えアプリ層でも
// テナント分離を強制する（docs/cto-tech-architecture.md 4.2）。
// ------------------------------------------------------------------

/**
 * 現在ログイン中のユーザーが所属するテナントの紐付け（tenant_users行）を取得する。
 * 未ログイン・未所属の場合は null を返す。
 */
export async function getMyTenantUser(): Promise<TenantUser | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("tenant_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * テナントIDから tenants 行を取得する。RLSにより所属していないテナントは取得できない。
 */
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}
