import { getSupabaseClient, AccountRow } from "./supabaseClient";

export interface NewAccountInput {
  name: string;
  category: AccountRow["category"];
  code?: string | null;
}

export interface AccountPatch {
  name?: string;
  category?: AccountRow["category"];
  code?: string | null;
}

/** テナントの勘定科目マスタを一覧取得する。 */
export async function listAccounts(tenantId: string): Promise<AccountRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`勘定科目の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

export async function createAccount(tenantId: string, input: NewAccountInput): Promise<AccountRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      category: input.category,
      code: input.code ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`勘定科目の作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function updateAccount(tenantId: string, id: string, patch: AccountPatch): Promise<AccountRow> {
  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.code !== undefined) updates.code = patch.code;

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId) // RLSに加えアプリ層でもテナントスコープを明示
    .select()
    .single();

  if (error || !data) {
    throw new Error(`勘定科目の更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function deleteAccount(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`勘定科目の削除に失敗しました: ${error.message}`);
  }
}
