import { getSupabaseClient, JournalEntryRow } from "./supabaseClient";

// ------------------------------------------------------------------
// journal_entries（複式簿記仕訳）への読み取りアクセス。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ②
// 「ページ側を①の実データ・射影関数に接続」のために必要な最小限のCRUD
// （現時点では一覧取得のみ。書き込み経路はCSV取込との接続層〈別途実装〉が担う）。
// accounts.ts と同じ形（テナントスコープを明示的な引数として受け取り、
// RLSに加えアプリ層でもテナント分離を強制する）に合わせている。
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
