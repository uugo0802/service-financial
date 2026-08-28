import { getSupabaseClient } from "./supabaseClient";
import { ReceivableInvoiceInput } from "../invoice/receivables";

// ------------------------------------------------------------------
// テナントごとの請求書（invoices）への永続化。未収入金集計（receivables.ts の
// computeReceivablesSummary）や入金消込（invoicePaymentMatching.ts）の入力となる
// ReceivableInvoiceInput をDB行との間で相互変換する薄い層。
// documents.ts / categorizeRules.ts と同じ「テナントIDを明示的に受け取り、
// クエリを .eq("tenant_id", tenantId) でスコープする」規約に従う
// （RLSに加えアプリ層でもテナント分離を強制する。docs/cto-tech-architecture.md 4.2）。
//
// app/src/lib/invoice/receivables.ts はDB非依存の純粋関数群として維持し、
// ここでは ReceivableInvoiceInput に必要な最小フィールドをDB行との間で変換するだけとする。
// 請求書番号の採番規則など、スキーマ（supabase/schema.sql）に書かれていないバリデーションは
// このDB層でも追加しない（呼び出し側の責務）。
// ------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  tenant_id: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string | null;
  grand_total: number;
  paid_at: string | null;
  paid_amount: number | null;
  created_at: string;
}

export interface NewInvoiceInput {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  dueDate?: string | null;
  grandTotal: number;
  paidAt?: string | null;
  paidAmount?: number | null;
}

export interface InvoicePaymentPatch {
  paidAt?: string | null;
  paidAmount?: number | null;
}

function rowToReceivableInvoiceInput(row: InvoiceRow): ReceivableInvoiceInput {
  return {
    invoiceNumber: row.invoice_number,
    clientName: row.client_name,
    issueDate: row.issue_date,
    dueDate: row.due_date ?? undefined,
    grandTotal: row.grand_total,
    paidAt: row.paid_at ?? undefined,
    paidAmount: row.paid_amount ?? undefined,
  };
}

/** テナントの請求書一覧を取得する（発行日の昇順）。 */
export async function listInvoices(tenantId: string): Promise<ReceivableInvoiceInput[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("issue_date", { ascending: true });

  if (error) {
    throw new Error(`請求書の取得に失敗しました: ${error.message}`);
  }
  return ((data ?? []) as InvoiceRow[]).map(rowToReceivableInvoiceInput);
}

/** 請求書を新規登録する。 */
export async function createInvoice(tenantId: string, input: NewInvoiceInput): Promise<ReceivableInvoiceInput> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      invoice_number: input.invoiceNumber.trim(),
      client_name: input.clientName.trim(),
      issue_date: input.issueDate,
      due_date: input.dueDate ?? null,
      grand_total: input.grandTotal,
      paid_at: input.paidAt ?? null,
      paid_amount: input.paidAmount ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`請求書の登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToReceivableInvoiceInput(data as InvoiceRow);
}

/**
 * 請求書の入金状況（入金日・入金済み金額）を更新する（入金消込確定時の利用を想定）。
 * invoiceNumber は tenant_id と組み合わせて一意（supabase/schema.sql の unique 制約）のため、
 * これで対象の請求書を特定する。
 */
export async function updateInvoicePayment(
  tenantId: string,
  invoiceNumber: string,
  patch: InvoicePaymentPatch
): Promise<ReceivableInvoiceInput> {
  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = {};
  if (patch.paidAt !== undefined) updates.paid_at = patch.paidAt;
  if (patch.paidAmount !== undefined) updates.paid_amount = patch.paidAmount;

  const { data, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("invoice_number", invoiceNumber)
    .eq("tenant_id", tenantId) // RLSに加えアプリ層でもテナントスコープを明示
    .select()
    .single();

  if (error || !data) {
    throw new Error(`請求書の入金状況の更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToReceivableInvoiceInput(data as InvoiceRow);
}

/** 請求書を削除する。 */
export async function deleteInvoice(tenantId: string, invoiceNumber: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("invoice_number", invoiceNumber)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`請求書の削除に失敗しました: ${error.message}`);
  }
}
