"use client";

import { useEffect, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { loadLedgerTransactionsForCurrentTenant } from "@/lib/db/ledgerTransactions";

export interface LedgerTransactionsState {
  transactions: CategorizedTransaction[];
  /** trueの間はページ側のサンプルデータを表示している（実データ取得前、または取得できなかった場合） */
  isSampleData: boolean;
}

// lib/db/ledgerTransactions.ts の loadLedgerTransactionsForCurrentTenant() を
// マウント時に呼び出すだけの薄いラッパー（hooks/useSubmissionWizard.tsと同じ方針:
// テスト可能なロジックは呼び出し先のプレーンな関数に持たせ、hook自体はReactへの
// 配線のみを担う）。取得できるまで・取得できなかった場合はsampleDataを表示し続ける。
export function useLedgerTransactions(sampleData: CategorizedTransaction[]): LedgerTransactionsState {
  const [state, setState] = useState<LedgerTransactionsState>({
    transactions: sampleData,
    isSampleData: true,
  });

  useEffect(() => {
    let cancelled = false;

    loadLedgerTransactionsForCurrentTenant().then((entries) => {
      if (cancelled || !entries) return;
      setState({ transactions: entries, isSampleData: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
