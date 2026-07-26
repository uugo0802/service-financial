import { getSupabaseClient, TransactionRow } from "./supabaseClient";

export interface NewTransactionInput {
  date: string;
  description: string;
  amount: number;
  taxCategory: string;
  source: TransactionRow["source"];
  accountId?: string | null;
  confidence?: number;
  note?: string | null;
  personalDeductionOnly?: boolean;
}

export interface TransactionPatch {
  date?: string;
  description?: string;
  amount?: number;
  taxCategory?: string;
  source?: TransactionRow["source"];
  accountId?: string | null;
  confidence?: number;
  note?: string | null;
  personalDeductionOnly?: boolean;
}

/** テナントの取引明細を一覧取得する（日付降順）。 */
export async function listTransactions(tenantId: string): Promise<TransactionRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false });

  if (error) {
    throw new Error(`取引データの取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

/** 単一の取引明細を取得する。他テナントの行は取得できない（RLS + テナントスコープ）。 */
export async function getTransaction(tenantId: string, id: string): Promise<TransactionRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`取引データの取得に失敗しました: ${error.message}`);
  }
  return data ?? null;
}

export async function createTransaction(tenantId: string, input: NewTransactionInput): Promise<TransactionRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      tenant_id: tenantId,
      date: input.date,
      description: input.description,
      amount: input.amount,
      tax_category: input.taxCategory,
      source: input.source,
      account_id: input.accountId ?? null,
      confidence: input.confidence ?? 0,
      note: input.note ?? null,
      personal_deduction_only: input.personalDeductionOnly ?? false,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`取引データの作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function updateTransaction(
  tenantId: string,
  id: string,
  patch: TransactionPatch
): Promise<TransactionRow> {
  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = {};
  if (patch.date !== undefined) updates.date = patch.date;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.taxCategory !== undefined) updates.tax_category = patch.taxCategory;
  if (patch.source !== undefined) updates.source = patch.source;
  if (patch.accountId !== undefined) updates.account_id = patch.accountId;
  if (patch.confidence !== undefined) updates.confidence = patch.confidence;
  if (patch.note !== undefined) updates.note = patch.note;
  if (patch.personalDeductionOnly !== undefined) updates.personal_deduction_only = patch.personalDeductionOnly;

  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId) // RLSに加えアプリ層でもテナントスコープを明示
    .select()
    .single();

  if (error || !data) {
    throw new Error(`取引データの更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function deleteTransaction(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`取引データの削除に失敗しました: ${error.message}`);
  }
}
