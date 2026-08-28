"use client";

import { useEffect, useState } from "react";
import { TransactionRow } from "@/lib/db/supabaseClient";
import { loadTransactionsForCurrentTenant } from "@/lib/db/transactions";

export interface TransactionRowsState {
  transactions: TransactionRow[];
  /** trueの間はページ側のサンプルデータを表示している（実データ取得前、または取得できなかった場合） */
  isSampleData: boolean;
}

// lib/db/transactions.ts の loadTransactionsForCurrentTenant() をマウント時に呼び出すだけの
// 薄いラッパー（hooks/useLedgerTransactions.tsと同じ方針）。TransactionRow は journal_entries由来の
// CategorizedTransaction とは異なる型（transactionsテーブル由来）のため、useLedgerTransactionsは
// そのまま使えず、同スタイルで専用フックを新設した。取得できるまで・取得できなかった場合は
// sampleDataを表示し続ける。
export function useTransactionRows(sampleData: TransactionRow[]): TransactionRowsState {
  const [state, setState] = useState<TransactionRowsState>({
    transactions: sampleData,
    isSampleData: true,
  });

  useEffect(() => {
    let cancelled = false;

    loadTransactionsForCurrentTenant().then((rows) => {
      if (cancelled || !rows) return;
      setState({ transactions: rows, isSampleData: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
