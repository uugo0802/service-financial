// ------------------------------------------------------------------
// 総勘定元帳（General Ledger）生成ロジック。
//
// このアプリの仕訳データ（CategorizedTransaction、journal/entries.ts が読み書きする型）は
// 1行につき「勘定科目1つ＋金額1つ（収入は正、支出は負）」という単式簿記寄りの単純なモデルで、
// 相手科目（貸借の相手勘定）は保持していない。そのため総勘定元帳の各行は、選択した勘定科目に
// ついて「マイナスの金額＝借方（費用・資産の増加側）」「プラスの金額＝貸方（収益・負債・
// 元入金等の増加側）」という、金額の符号（app/src/lib/categorize/engine.ts の
// Transaction.amount コメントに準拠）から機械的に借方・貸方へ振り分ける。
//
// 残高（残高欄）は「前期繰越（openingBalance）＋ 借方累計 − 貸方累計」として計算する。
// 勘定科目ごとの正常残高（借方残高が正常な勘定か、貸方残高が正常な勘定か）を判定する
// 勘定科目マスタはこのアプリにまだ存在しないため、正負の解釈（借方超過ならプラス、
// 貸方超過ならマイナス）は呼び出し側（画面）で行う想定。
// ------------------------------------------------------------------

import { CategorizedTransaction } from "../categorize/engine";

/** 総勘定元帳1行分（選択した勘定科目に紐づく仕訳1件） */
export interface GeneralLedgerRow {
  id: string;
  date: string;
  description: string;
  /** 借方金額（円）。該当しない行は0 */
  debit: number;
  /** 貸方金額（円）。該当しない行は0 */
  credit: number;
  /** この行までの累計残高（円）＝前期繰越＋借方累計−貸方累計 */
  balance: number;
  taxCategory: CategorizedTransaction["taxCategory"];
  source: CategorizedTransaction["source"];
  note?: string;
}

export interface GeneralLedgerResult {
  /** 対象の勘定科目名（コード体系はまだ存在しないため科目名そのものをidとして扱う） */
  account: string;
  /** 前期繰越（開始残高、円）。指定がなければ0 */
  openingBalance: number;
  rows: GeneralLedgerRow[];
  /** 借方合計（円） */
  totalDebit: number;
  /** 貸方合計（円） */
  totalCredit: number;
  /** 期末残高（円）＝前期繰越＋借方合計−貸方合計 */
  closingBalance: number;
}

export interface GeneralLedgerOptions {
  /** 前期繰越（開始残高、円）。未指定の場合は0として扱う */
  openingBalance?: number;
  /** 取引年月日（この日付以降、ISO "YYYY-MM-DD"形式、当日を含む）でこの科目の元帳を絞り込む */
  dateFrom?: string;
  /** 取引年月日（この日付以前、ISO "YYYY-MM-DD"形式、当日を含む）でこの科目の元帳を絞り込む */
  dateTo?: string;
}

function matchesDateRange(entry: CategorizedTransaction, options: GeneralLedgerOptions): boolean {
  if (options.dateFrom && entry.date < options.dateFrom) return false;
  if (options.dateTo && entry.date > options.dateTo) return false;
  return true;
}

/**
 * 日付の昇順で安定ソートするための比較関数。
 * ISO "YYYY-MM-DD" 形式であれば文字列比較がそのまま時系列比較になる
 * （app/src/lib/db/transactionSearch.ts の日付範囲フィルタと同じ前提）。
 * 同日の仕訳は Array.prototype.sort の安定性により、入力配列（＝入力順）の順序を保つ。
 */
function compareByDate(a: CategorizedTransaction, b: CategorizedTransaction): number {
  if (a.date === b.date) return 0;
  return a.date < b.date ? -1 : 1;
}

/**
 * 指定した勘定科目について、日付順に並べた総勘定元帳（借方・貸方・累計残高つき）を組み立てる。
 * 例外は投げない純粋関数。該当する仕訳がなければ rows は空配列になり、
 * closingBalance は openingBalance（前期繰越）のみを返す。
 */
export function buildGeneralLedger(
  entries: CategorizedTransaction[],
  account: string,
  options: GeneralLedgerOptions = {}
): GeneralLedgerResult {
  const targetAccount = account.trim();
  const openingBalance = options.openingBalance ?? 0;

  // entry.account 側も trim して比較する。listLedgerAccounts() は科目セレクタ向けに
  // 前後の空白を trim した値を選択肢として返すため、もしここで entry.account を
  // trim せずに厳密一致で比較すると、空白付きの科目名を持つ仕訳（例: OCR由来の
  // ReceiptJournalCandidate.account 等、必ずしも trim 済みとは限らない入力元がある）が
  // セレクタには表示されるのに元帳には1件も出てこない、という無言のデータ欠落を招く。
  const matched = (entries ?? []).filter(
    (entry) => entry.account?.trim() === targetAccount && matchesDateRange(entry, options)
  );
  const sorted = [...matched].sort(compareByDate);

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: GeneralLedgerRow[] = sorted.map((entry) => {
    const debit = entry.amount < 0 ? Math.abs(entry.amount) : 0;
    const credit = entry.amount > 0 ? entry.amount : 0;
    totalDebit += debit;
    totalCredit += credit;
    runningBalance = runningBalance + debit - credit;

    return {
      id: entry.id,
      date: entry.date,
      description: entry.description,
      debit,
      credit,
      balance: runningBalance,
      taxCategory: entry.taxCategory,
      source: entry.source,
      note: entry.note,
    };
  });

  return {
    account: targetAccount,
    openingBalance,
    rows,
    totalDebit,
    totalCredit,
    closingBalance: runningBalance,
  };
}

/**
 * 仕訳データ全体から、元帳の対象として選択できる勘定科目名の一覧を返す
 * （50音・アルファベット順、重複なし）。画面の科目セレクタに利用する。
 */
export function listLedgerAccounts(entries: CategorizedTransaction[]): string[] {
  const accounts = new Set<string>();
  for (const entry of entries ?? []) {
    const trimmed = entry.account?.trim();
    if (trimmed) accounts.add(trimmed);
  }
  return Array.from(accounts).sort((a, b) => a.localeCompare(b, "ja"));
}
