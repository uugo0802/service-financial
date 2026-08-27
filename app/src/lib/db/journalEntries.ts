import { getSupabaseClient, JournalEntryRow } from "./supabaseClient";

// ------------------------------------------------------------------
// journal_entries（複式簿記仕訳）への読み書きアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ②
// 「ページ側を①の実データ・射影関数に接続」のために必要な一覧取得に加え、
// ステージ③「現金を伴わない仕訳の自動生成バッチ」（lib/db/generatedEntries.ts）が
// 使用する一括書き込み（createJournalEntries）を提供する。CSV取込との接続層は
// 別途実装（本ファイルの対象外）。accounts.ts と同じ形（テナントスコープを
// 明示的な引数として受け取り、RLSに加えアプリ層でもテナント分離を強制する）に
// 合わせている。
// ------------------------------------------------------------------

/** テナントの仕訳（journal_entries）を日付の昇順で一覧取得する。 */
export async function listJournalEntries(tenantId: string): Promise<JournalEntryRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`仕訳の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

/** journal_entries に1行挿入する際の入力（id・created_at等のDB側で決まる列を除く）。 */
export interface NewJournalEntryInput {
  date: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  description?: string | null;
  tax_category: string;
  confidence?: number;
  source: JournalEntryRow["source"];
  personal_deduction_only?: boolean;
  exclude_from_income?: boolean;
}

/**
 * 仕訳を複数行まとめて挿入する。減価償却・借入金返済の自動生成バッチ
 * （lib/db/generatedEntries.ts）が、二重生成でないことを確認した上でまとめて書き込む用途を想定。
 * 空配列を渡した場合は何もせず空配列を返す（不要なリクエストを発行しない）。
 */
export async function createJournalEntries(tenantId: string, inputs: NewJournalEntryInput[]): Promise<JournalEntryRow[]> {
  if (inputs.length === 0) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .insert(
      inputs.map((input) => ({
        tenant_id: tenantId,
        date: input.date,
        debit_account_id: input.debit_account_id,
        credit_account_id: input.credit_account_id,
        amount: input.amount,
        description: input.description ?? null,
        tax_category: input.tax_category,
        confidence: input.confidence ?? 1.0,
        source: input.source,
        personal_deduction_only: input.personal_deduction_only ?? false,
        exclude_from_income: input.exclude_from_income ?? false,
      }))
    )
    .select();

  if (error) {
    throw new Error(`仕訳の作成に失敗しました: ${error.message}`);
  }
  return data ?? [];
}
