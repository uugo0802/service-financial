import { AccountRow, JournalEntryRow } from "./supabaseClient";
import { CategorizedTransaction } from "../categorize/engine";
import { listAccounts, createAccount } from "./accounts";
import { createJournalEntries, NewJournalEntryInput } from "./journalEntries";

// ------------------------------------------------------------------
// CSV取込（ルールベース/AI分類済みの CategorizedTransaction[]）を journal_entries へ
// 書き込むための変換層。docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md
// 「CSV取込との接続」節に対応する（既存の app/api/categorize/route.ts は無改修のまま、
// その出力＝CategorizedTransaction[] を受け取ってから先の変換をここに閉じ込める）。
//
// 変換ルール（deriveFromLedger.ts の逆変換）:
//   - amount > 0（収入）→ 借方: 現金・預金勘定（引数 cashAccountId） / 貸方: account名の
//     revenue勘定
//   - amount < 0（支出）→ 借方: account名のexpense勘定 / 貸方: 現金・預金勘定
//   - amount === 0 の行は仕訳として意味を持たないため読み飛ばす
//
// account名に一致する勘定科目（同名・同account_type）がまだ存在しない場合は、その場で
// accounts に新規作成してから使う（初回インポート時に勘定科目マスタが空でも取り込めるように
// するため）。tax_category・confidence・source・personal_deduction_only・exclude_from_income は
// そのまま転記する（deriveFromLedger.ts と対称的な方針）。
// ------------------------------------------------------------------

export interface CsvJournalImportResult {
  created: JournalEntryRow[];
  createdAccountCount: number;
}

function accountKey(accountType: AccountRow["account_type"], name: string): string {
  return `${accountType}:${name}`;
}

/**
 * ルールベース/AI分類済みのCSV明細（CategorizedTransaction[]）を、指定した現金・預金勘定と
 * 組み合わせて journal_entries に書き込む。相手勘定（収益/費用）が accounts にまだ無ければ
 * 作成する。
 */
export async function importCategorizedTransactionsAsJournalEntries(
  tenantId: string,
  transactions: CategorizedTransaction[],
  cashAccountId: string
): Promise<CsvJournalImportResult> {
  const accounts = await listAccounts(tenantId);
  const accountsByKey = new Map<string, AccountRow>(accounts.map((a) => [accountKey(a.account_type, a.name), a]));

  let createdAccountCount = 0;
  const inputs: NewJournalEntryInput[] = [];

  for (const tx of transactions) {
    if (tx.amount === 0) continue;

    const isIncome = tx.amount > 0;
    const counterpartType: AccountRow["account_type"] = isIncome ? "revenue" : "expense";
    const key = accountKey(counterpartType, tx.account);

    let counterpart = accountsByKey.get(key);
    if (!counterpart) {
      counterpart = await createAccount(tenantId, { name: tx.account, account_type: counterpartType });
      accountsByKey.set(key, counterpart);
      createdAccountCount++;
    }

    inputs.push({
      date: tx.date,
      debit_account_id: isIncome ? cashAccountId : counterpart.id,
      credit_account_id: isIncome ? counterpart.id : cashAccountId,
      amount: Math.abs(tx.amount),
      description: tx.description,
      tax_category: tx.taxCategory,
      confidence: tx.confidence,
      source: tx.source,
      personal_deduction_only: tx.personalDeductionOnly ?? false,
      exclude_from_income: tx.excludeFromIncome ?? false,
    });
  }

  const created = await createJournalEntries(tenantId, inputs);
  return { created, createdAccountCount };
}
