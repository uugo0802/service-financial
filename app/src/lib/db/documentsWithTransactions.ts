import { getMyTenantUser } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";
import { listDocuments } from "./documents";
import { AccountRow, JournalEntryRow } from "./supabaseClient";
import { DocumentWithTransaction, LinkedTransactionFields } from "../documents/documentSearch";

// ------------------------------------------------------------------
// documents/page.tsx が求める DocumentWithTransaction（documentSearch.ts）へ、
// documents（lib/db/documents.ts）と journal_entries（lib/db/journalEntries.ts）を
// 突き合わせて組み立てる読み込み関数。ledgerTransactions.ts / balanceSheetData.ts と
// 同じ「ログイン中テナントの実データを取得し、取得できない場合は null を返す」方針。
//
// documents.transaction_id は journal_entries.id を指す（supabaseClient.ts の
// DocumentRow のコメント参照）。documentSearch.ts の LinkedTransactionFields が
// 要求する date・description・amount は journal_entries + accounts から
// deriveFromLedger.ts と同じ変換ルール（貸方がrevenueならプラス、借方がexpenseなら
// マイナス）で組み立てられる。
//
// 一方 counterparty（取引先）は、journal_entries・accounts のどちらのテーブルにも
// それに相当する列が存在しない（schema.sql参照。旧 transactions テーブルの note列に
// 相当するものが複式簿記移行後は無い）。そのため本関数では counterparty を常に null
// として返す。これは実装時に判明した設計上の制約であり、要ユーザー確認事項として
// 報告する（journal_entries に取引先列を追加するかどうかは本specの範囲外の判断のため、
// 勝手に追加しない）。
// ------------------------------------------------------------------

function toLinkedTransactionFields(entry: JournalEntryRow, accountsById: Map<string, AccountRow>): LinkedTransactionFields {
  const debitAccount = accountsById.get(entry.debit_account_id);
  const creditAccount = accountsById.get(entry.credit_account_id);

  // deriveFromLedger.ts の変換ルールに合わせる: 貸方がrevenueならプラス、
  // 借方がexpenseならマイナス。どちらにも該当しない仕訳（固定資産購入・借入金の
  // 元本部分など、貸借対照表側のみに影響する仕訳）は、そのままの金額（常に正）を表示する。
  let amount = entry.amount;
  if (creditAccount?.account_type === "revenue") {
    amount = entry.amount;
  } else if (debitAccount?.account_type === "expense") {
    amount = -entry.amount;
  }

  return {
    date: entry.date,
    description: entry.description ?? "",
    amount,
    // journal_entries / accounts に取引先に相当する列が存在しないため常にnull（上記コメント参照）。
    counterparty: null,
  };
}

/**
 * ログイン中ユーザーの所属テナントの証憑一覧（documents）に、リンク先の仕訳
 * （journal_entries）から取引年月日・摘要・金額を合成した DocumentWithTransaction[] を返す。
 *
 * 以下のいずれかに該当する場合は null を返す（呼び出し側はページ専用のサンプルデータへ
 * フォールバックすること）:
 *   - Supabase未設定（getSupabaseClient()が例外を投げる）
 *   - 未ログイン、またはログイン中ユーザーの所属テナントが見つからない
 *   - 該当テナントの証憑が1件もない（実データがまだアップロードされていない初期状態）
 *   - 取得中に何らかのエラーが発生した
 */
export async function loadDocumentsWithTransactionsForCurrentTenant(): Promise<DocumentWithTransaction[] | null> {
  try {
    const tenantUser = await getMyTenantUser();
    if (!tenantUser) return null;

    const [documents, accounts, entries] = await Promise.all([
      listDocuments(tenantUser.tenant_id),
      listAccounts(tenantUser.tenant_id),
      listJournalEntries(tenantUser.tenant_id),
    ]);

    if (documents.length === 0) return null;

    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

    return documents.map((document) => {
      const entry = document.transaction_id ? entriesById.get(document.transaction_id) : undefined;
      return {
        ...document,
        transaction: entry ? toLinkedTransactionFields(entry, accountsById) : null,
      };
    });
  } catch {
    return null;
  }
}
