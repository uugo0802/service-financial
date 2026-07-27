import { getSupabaseClient, DocumentRow } from "./supabaseClient";

export interface NewDocumentInput {
  storagePath: string;
  transactionId?: string | null;
}

/** テナントの証憑一覧を取得する（アップロード日時降順）。 */
export async function listDocuments(tenantId: string): Promise<DocumentRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`証憑の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

export async function createDocument(tenantId: string, input: NewDocumentInput): Promise<DocumentRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      tenant_id: tenantId,
      storage_path: input.storagePath,
      transaction_id: input.transactionId ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`証憑の登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function deleteDocument(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("documents").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`証憑の削除に失敗しました: ${error.message}`);
  }
}
