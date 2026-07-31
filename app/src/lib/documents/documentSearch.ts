import { DocumentRow } from "../db/supabaseClient";

// ------------------------------------------------------------------
// 電子帳簿保存法（docs/cto-tech-architecture.md 4.1節）が要求する
// 「取引年月日・取引金額・取引先」による検索性は、証憑（レシート・請求書）
// にはこのモジュール単体では満たせない。DocumentRow（supabaseClient.ts）は
// storage_path と transaction_id しか持たず、取引年月日・金額・取引先は
// リンク先の取引（TransactionRow）側にしかないためである。
//
// そのため本モジュールでは、証憑にリンク先取引の該当項目を合成した
// DocumentWithTransaction を入力として受け取り、db/transactionSearch.ts と
// 同じ「メモリ内フィルタの純粋関数」パターンで検索を実現する。
// リンク先取引が無い証憑（transaction: null）は、取引年月日・金額・取引先での
// 絞り込みには一致させられない（照合できないため）。誤って「該当なし」として
// 静かに消えてしまうと見落としにつながるため、isUnlinkedDocument /
// selectUnlinkedDocuments で明示的に検知できるようにしている
// （呼び出し側のUIで「未紐付けの証憑」として必ず目立たせること）。
// ------------------------------------------------------------------

/** 証憑にリンクされた取引のうち、検索・表示に使う項目だけを抜き出した型。 */
export interface LinkedTransactionFields {
  /** 取引年月日（ISO "YYYY-MM-DD"形式）。 */
  date: string;
  /** 取引の摘要。 */
  description: string;
  /** 取引金額（収入は正、支出は負）。 */
  amount: number;
  /** 取引先（TransactionRow.note相当）。未設定の場合はnull。 */
  counterparty: string | null;
}

/**
 * 証憑（DocumentRow）に、リンク先取引の年月日・金額・取引先を合成したビュー用の型。
 * transaction_idがnull、またはリンク先取引が見つからなかった場合はtransactionをnullにする
 * （呼び出し側でjoinしてこの形にしてから渡す想定。本モジュール自体はDBアクセスを行わない）。
 */
export interface DocumentWithTransaction extends DocumentRow {
  transaction: LinkedTransactionFields | null;
}

export interface DocumentSearchFilters {
  /** 取引年月日（この日付以降、ISO "YYYY-MM-DD"形式、当日を含む） */
  dateFrom?: string;
  /** 取引年月日（この日付以前、ISO "YYYY-MM-DD"形式、当日を含む） */
  dateTo?: string;
  /** 取引金額の下限（この値を含む） */
  minAmount?: number;
  /** 取引金額の上限（この値を含む） */
  maxAmount?: number;
  /** 取引先・摘要に対する部分一致キーワード（大文字小文字を区別しない） */
  keyword?: string;
}

function matchesDateRange(row: DocumentWithTransaction, filters: DocumentSearchFilters): boolean {
  if (filters.dateFrom === undefined && filters.dateTo === undefined) return true;
  // 日付条件が指定されているのにリンク先取引が無い場合は、年月日を照合できないため除外する。
  if (!row.transaction) return false;
  if (filters.dateFrom && row.transaction.date < filters.dateFrom) return false;
  if (filters.dateTo && row.transaction.date > filters.dateTo) return false;
  return true;
}

function matchesAmountRange(row: DocumentWithTransaction, filters: DocumentSearchFilters): boolean {
  if (filters.minAmount === undefined && filters.maxAmount === undefined) return true;
  if (!row.transaction) return false;
  if (filters.minAmount !== undefined && row.transaction.amount < filters.minAmount) return false;
  if (filters.maxAmount !== undefined && row.transaction.amount > filters.maxAmount) return false;
  return true;
}

function matchesKeyword(row: DocumentWithTransaction, filters: DocumentSearchFilters): boolean {
  const keyword = filters.keyword?.trim().toLowerCase();
  if (!keyword) return true;
  if (!row.transaction) return false;

  const haystack = `${row.transaction.description} ${row.transaction.counterparty ?? ""}`.toLowerCase();
  return haystack.includes(keyword);
}

/**
 * 証憑一覧を検索条件（取引年月日・取引金額・取引先/摘要キーワード）でフィルタする純粋関数。
 * 条件が未指定の項目はフィルタしない。リンク先取引の無い証憑は、いずれかの条件が
 * 指定されている場合は照合できないため結果から除外される（条件が何も無ければ含まれる）。
 */
export function filterDocuments(
  rows: DocumentWithTransaction[],
  filters: DocumentSearchFilters = {}
): DocumentWithTransaction[] {
  return rows.filter(
    (row) => matchesDateRange(row, filters) && matchesAmountRange(row, filters) && matchesKeyword(row, filters)
  );
}

/**
 * リンク先の取引が無い（取引年月日・取引金額・取引先を照合できない）証憑かどうかを判定する。
 * transaction_idが無い、またはtransaction_idはあるがjoin時にリンク先取引が見つからなかった
 * （データ不整合等）場合の両方を「未紐付け」として扱う。
 */
export function isUnlinkedDocument(row: DocumentWithTransaction): boolean {
  return row.transaction_id === null || row.transaction === null;
}

/** 証憑一覧のうち、未紐付け（取引年月日・金額・取引先を照合できない）ものだけを抜き出す。 */
export function selectUnlinkedDocuments(rows: DocumentWithTransaction[]): DocumentWithTransaction[] {
  return rows.filter(isUnlinkedDocument);
}

/** 証憑一覧のうち、未紐付けの件数を数える。 */
export function countUnlinkedDocuments(rows: DocumentWithTransaction[]): number {
  return selectUnlinkedDocuments(rows).length;
}

/**
 * storage_path（例: "tenant-1/2026/receipt-001.jpg"）から、一覧表示に使う
 * ファイル名部分だけを取り出す。区切り文字が無い場合はstorage_pathをそのまま返す。
 * 空文字列やスラッシュのみのパスは「(ファイル名不明)」を返す。
 */
export function extractFileNameFromStoragePath(storagePath: string): string {
  const segments = storagePath.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : "(ファイル名不明)";
}
