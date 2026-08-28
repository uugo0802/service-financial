"use client";

import { useEffect, useState } from "react";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";
import { loadDocumentsWithTransactionsForCurrentTenant } from "@/lib/db/documentsWithTransactions";

export interface DocumentsState {
  documents: DocumentWithTransaction[];
  /** trueの間はページ側のサンプルデータを表示している（実データ取得前、または取得できなかった場合） */
  isSampleData: boolean;
}

// lib/db/documentsWithTransactions.ts の loadDocumentsWithTransactionsForCurrentTenant() を
// マウント時に呼び出すだけの薄いラッパー（hooks/useLedgerTransactions.tsと同じ方針）。
// 取得できるまで・取得できなかった場合はsampleDataを表示し続ける。
export function useDocuments(sampleData: DocumentWithTransaction[]): DocumentsState {
  const [state, setState] = useState<DocumentsState>({
    documents: sampleData,
    isSampleData: true,
  });

  useEffect(() => {
    let cancelled = false;

    loadDocumentsWithTransactionsForCurrentTenant().then((documents) => {
      if (cancelled || !documents) return;
      setState({ documents, isSampleData: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
