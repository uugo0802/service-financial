"use client";

import { useEffect, useState } from "react";
import { LedgerBalanceSheetData, loadBalanceSheetDataForCurrentTenant } from "@/lib/db/balanceSheetData";
import { FiscalPeriod } from "@/lib/tax/depreciation";

export interface BalanceSheetDataState {
  data: LedgerBalanceSheetData | null;
  /** trueの間はページ側のサンプルデータ（資本金・期首現金残高等）を表示している */
  isSampleData: boolean;
}

// lib/db/balanceSheetData.ts の loadBalanceSheetDataForCurrentTenant() を
// マウント時に呼び出すだけの薄いラッパー（hooks/useLedgerTransactions.tsと同じ方針）。
// 取得できるまで・取得できなかった場合は data: null（＝サンプルデータ表示）のままにする。
export function useBalanceSheetData(fiscalPeriod: FiscalPeriod): BalanceSheetDataState {
  const [state, setState] = useState<BalanceSheetDataState>({ data: null, isSampleData: true });

  useEffect(() => {
    // pl.periodStart/periodEnd（呼び出し元の一般的な算出元）は、取引が1件もない場合に
    // "-" を返すことがある（plStatement.ts参照）。不正な期間では取得を試みない
    // （サンプルデータ表示のままにする）。
    if (fiscalPeriod.start === "-" || fiscalPeriod.end === "-" || fiscalPeriod.start > fiscalPeriod.end) {
      return;
    }

    let cancelled = false;

    loadBalanceSheetDataForCurrentTenant(fiscalPeriod).then((result) => {
      if (cancelled || !result) return;
      setState({ data: result, isSampleData: false });
    });

    return () => {
      cancelled = true;
    };
    // fiscalPeriodはページ側でpl.periodStart/periodEndから毎レンダー新規オブジェクトとして
    // 作られるため、参照ではなく値で依存配列を組む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalPeriod.start, fiscalPeriod.end]);

  return state;
}
