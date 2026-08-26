// journal_entries（複式簿記仕訳）を、既存の lib/tax/* モジュールが消費する
// CategorizedTransaction[] へ射影する変換層。
//
// 背景: docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md
// 「既存コードとの接続」節。既存57本の lib/tax/ モジュール（plStatement.ts・corporateForms.ts・
// consumptionTaxForm.ts 等）は CategorizedTransaction[] を受け取るだけの無改修のまま使い続け、
// journal_entries への移行によって生じる差分はすべてこのファイル1本に閉じ込める。
//
// 変換ルール（design doc本文に厳密に従う。ここに書かれていない変換は行わない）:
// - 貸方勘定が account_type === "revenue" の行 → 収益取引として1件
//   （金額はプラス、account = 貸方勘定名）
// - 借方勘定が account_type === "expense" の行 → 費用取引として1件
//   （account = 借方勘定名。金額はマイナス。既存の CategorizedTransaction.amount の符号規約
//   「収入は正、支出は負」（lib/categorize/engine.ts の Transaction 参照）に合わせる）
// - 両建てが asset/liability/equity の行（固定資産購入、借入金の実行・返済の元本部分、
//   出資の払込みなど）は、上記いずれの条件にも一致しないため、そのままP/Lに影響しない
//   （貸借対照表側でのみ扱う）射影対象外として扱われる
// - tax_category・confidence・source・personal_deduction_only・exclude_from_income は
//   そのまま転記する
//
// 上記2条件は独立した判定であり、互いに排他ではない。借方・貸方の双方が
// revenue/expense に該当するような通常はあり得ない仕訳データが渡された場合でも、
// design docの変換ルールを文字通り適用し、収益・費用それぞれの出力行を両方生成する
// （どちらを優先するかを勝手に決め打ちしない）。
//
// 対応する勘定科目がaccountsに見つからない行（データ不整合）は、貸方・借方どちらの
// account_typeも判定できないため、そちらの変換ルールについては何も生成しない
// （黙って読み飛ばす。他方の勘定が見つかっていればそちらは通常通り処理する）。

import { AccountRow, JournalEntryRow } from "../db/supabaseClient";
import { CategorizedTransaction } from "./engine";

function indexAccountsById(accounts: AccountRow[]): Map<string, AccountRow> {
  return new Map(accounts.map((account) => [account.id, account]));
}

/** description列はnull許容（schema.sql）だが、CategorizedTransaction.descriptionは必須文字列のため空文字にフォールバックする */
function toDescription(entry: JournalEntryRow): string {
  return entry.description ?? "";
}

export function deriveCategorizedTransactions(
  entries: JournalEntryRow[],
  accounts: AccountRow[]
): CategorizedTransaction[] {
  const accountsById = indexAccountsById(accounts);
  const result: CategorizedTransaction[] = [];

  for (const entry of entries) {
    const debitAccount = accountsById.get(entry.debit_account_id);
    const creditAccount = accountsById.get(entry.credit_account_id);

    const shared = {
      id: entry.id,
      date: entry.date,
      description: toDescription(entry),
      taxCategory: entry.tax_category as CategorizedTransaction["taxCategory"],
      confidence: entry.confidence,
      source: entry.source,
      personalDeductionOnly: entry.personal_deduction_only,
      excludeFromIncome: entry.exclude_from_income,
    };

    if (creditAccount?.account_type === "revenue") {
      result.push({
        ...shared,
        amount: entry.amount,
        account: creditAccount.name,
      });
    }

    if (debitAccount?.account_type === "expense") {
      result.push({
        ...shared,
        amount: -entry.amount,
        account: debitAccount.name,
      });
    }
  }

  return result;
}
