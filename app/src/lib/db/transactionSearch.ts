import { TransactionRow } from "./supabaseClient";
import { listTransactions } from "./transactions";

// ------------------------------------------------------------------
// 電子帳簿保存法（docs/cto-tech-architecture.md 4.1節）が要求する
// 「取引年月日・取引金額・取引先」による検索性を満たすための検索機能。
// listTransactions() が返す一覧をアプリ層でメモリ内フィルタする
// MVP実装（DB側のクエリ最適化はデータ量が増えてから検討する）。
// ------------------------------------------------------------------

export interface TransactionSearchFilters {
  /** 取引年月日（この日付以降、ISO "YYYY-MM-DD"形式、当日を含む） */
  dateFrom?: string;
  /** 取引年月日（この日付以前、ISO "YYYY-MM-DD"形式、当日を含む） */
  dateTo?: string;
  /** 取引金額の下限（この値を含む。収入は正、支出は負の数値で保存されている） */
  minAmount?: number;
  /** 取引金額の上限（この値を含む） */
  maxAmount?: number;
  /** 取引先・摘要に対する部分一致キーワード（大文字小文字を区別しない） */
  keyword?: string;
}

function matchesDateRange(row: TransactionRow, filters: TransactionSearchFilters): boolean {
  if (filters.dateFrom && row.date < filters.dateFrom) return false;
  if (filters.dateTo && row.date > filters.dateTo) return false;
  return true;
}

function matchesAmountRange(row: TransactionRow, filters: TransactionSearchFilters): boolean {
  if (filters.minAmount !== undefined && row.amount < filters.minAmount) return false;
  if (filters.maxAmount !== undefined && row.amount > filters.maxAmount) return false;
  return true;
}

function matchesKeyword(row: TransactionRow, filters: TransactionSearchFilters): boolean {
  const keyword = filters.keyword?.trim().toLowerCase();
  if (!keyword) return true;

  const haystack = `${row.description} ${row.note ?? ""}`.toLowerCase();
  return haystack.includes(keyword);
}

/**
 * 取引一覧を検索条件（取引年月日・取引金額・取引先/摘要キーワード）でフィルタする純粋関数。
 * 条件が未指定の項目はフィルタしない。
 */
export function filterTransactions(
  rows: TransactionRow[],
  filters: TransactionSearchFilters = {}
): TransactionRow[] {
  return rows.filter(
    (row) => matchesDateRange(row, filters) && matchesAmountRange(row, filters) && matchesKeyword(row, filters)
  );
}

/** テナントの取引一覧を取得したうえで、検索条件に一致する行だけを返す。 */
export async function searchTransactions(
  tenantId: string,
  filters: TransactionSearchFilters = {}
): Promise<TransactionRow[]> {
  const rows = await listTransactions(tenantId);
  return filterTransactions(rows, filters);
}
