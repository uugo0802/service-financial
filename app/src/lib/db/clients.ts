import { getSupabaseClient } from "./supabaseClient";
import { Counterparty, CounterpartyDraft } from "../clients/clientMaster";

// ------------------------------------------------------------------
// テナントごとの取引先マスタ（counterparties）への永続化。
// documents.ts / categorizeRules.ts と同じ「テナントIDを明示的に受け取り、
// クエリを .eq("tenant_id", tenantId) でスコープする」規約に従う
// （RLSに加えアプリ層でもテナント分離を強制する。docs/cto-tech-architecture.md 4.2）。
//
// app/src/lib/clients/clientMaster.ts はDB非依存の純粋関数群として維持し、
// ここでは Counterparty に必要な最小フィールドをDB行との間で相互変換するだけの薄い層とする
// （createCounterparty/updateCounterparty 自体はここでは呼び出さず、呼び出し側で
// 事前にバリデーション・正規化済みの CounterpartyDraft を受け取る前提とする）。
// ------------------------------------------------------------------

export interface CounterpartyRow {
  id: string;
  tenant_id: string;
  name: string;
  kind: Counterparty["kind"];
  default_account_name: string | null;
  invoice_registration_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCounterparty(row: CounterpartyRow): Counterparty {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    defaultAccountName: row.default_account_name ?? undefined,
    invoiceRegistrationNumber: row.invoice_registration_number ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** テナントの取引先マスタ一覧を取得する（名称の昇順）。 */
export async function listCounterparties(tenantId: string): Promise<Counterparty[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("counterparties")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`取引先の取得に失敗しました: ${error.message}`);
  }
  return ((data ?? []) as CounterpartyRow[]).map(rowToCounterparty);
}

/**
 * 取引先を新規登録する。
 * 呼び出し側は事前に clientMaster.ts の validateCounterpartyDraft でエラーがないことを
 * 確認しておくこと（このDB層はバリデーション済みの入力を前提とする）。
 */
export async function createCounterparty(tenantId: string, draft: CounterpartyDraft): Promise<Counterparty> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("counterparties")
    .insert({
      tenant_id: tenantId,
      name: draft.name.trim(),
      kind: draft.kind,
      default_account_name: draft.defaultAccountName?.trim() || null,
      invoice_registration_number: draft.invoiceRegistrationNumber?.trim() || null,
      notes: draft.notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`取引先の登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToCounterparty(data as CounterpartyRow);
}

/** 既存の取引先を更新する。 */
export async function updateCounterparty(
  tenantId: string,
  id: string,
  draft: CounterpartyDraft
): Promise<Counterparty> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("counterparties")
    .update({
      name: draft.name.trim(),
      kind: draft.kind,
      default_account_name: draft.defaultAccountName?.trim() || null,
      invoice_registration_number: draft.invoiceRegistrationNumber?.trim() || null,
      notes: draft.notes?.trim() || null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId) // RLSに加えアプリ層でもテナントスコープを明示
    .select()
    .single();

  if (error || !data) {
    throw new Error(`取引先の更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToCounterparty(data as CounterpartyRow);
}

/** 取引先を削除する。 */
export async function deleteCounterparty(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("counterparties").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`取引先の削除に失敗しました: ${error.message}`);
  }
}
