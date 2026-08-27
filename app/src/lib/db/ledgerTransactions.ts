import { CategorizedTransaction } from "../categorize/engine";
import { deriveCategorizedTransactions } from "../categorize/deriveFromLedger";
import { getMyTenantUser } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";

// ------------------------------------------------------------------
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ②
// 「ページ側を①の実データ・射影関数に接続」の中心となる関数。
// ログイン中ユーザーの所属テナントの journal_entries + accounts を取得し、
// deriveFromLedger.ts の deriveCategorizedTransactions() で既存の
// CategorizedTransaction[] へ射影して返す。
//
// 呼び出し側（各ページ）は、この関数が null を返した場合にそのページ専用の
// SAMPLE_ENTRIES へフォールバックする（login/page.tsxで確立されている
// 「Supabase未設定・未ログインはエラーとして扱わず機能を諦める」方針を踏襲）。
// null を返すケース:
//   - Supabase未設定（getSupabaseClient()が例外を投げる）
//   - 未ログイン、またはログイン中ユーザーの所属テナントが見つからない
//   - 取得・射影自体には成功したが、該当テナントの仕訳が1件もない
//     （実データがまだ1件も記帳されていない、初期状態のテナント）
//   - 取得中に何らかのエラーが発生した
// ------------------------------------------------------------------

export async function loadLedgerTransactionsForCurrentTenant(): Promise<CategorizedTransaction[] | null> {
  try {
    const tenantUser = await getMyTenantUser();
    if (!tenantUser) return null;

    const [accounts, entries] = await Promise.all([
      listAccounts(tenantUser.tenant_id),
      listJournalEntries(tenantUser.tenant_id),
    ]);

    if (entries.length === 0) return null;

    return deriveCategorizedTransactions(entries, accounts);
  } catch {
    return null;
  }
}
