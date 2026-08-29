"use client";

import { useEffect, useState } from "react";
import {
  LedgerDepreciationScheduleData,
  loadDepreciationScheduleDataForCurrentTenant,
} from "@/lib/db/depreciationScheduleData";

export interface DepreciationScheduleDataState {
  data: LedgerDepreciationScheduleData | null;
  /** trueの間はページ側のサンプルデータ（会社名・固定資産一覧）を表示している */
  isSampleData: boolean;
}

// lib/db/depreciationScheduleData.ts の loadDepreciationScheduleDataForCurrentTenant() を
// マウント時に呼び出すだけの薄いラッパー（hooks/useBalanceSheetData.tsと同じ方針）。
// 取得できるまで・取得できなかった場合は data: null（＝サンプルデータ表示）のままにする。
export function useDepreciationScheduleData(): DepreciationScheduleDataState {
  const [state, setState] = useState<DepreciationScheduleDataState>({ data: null, isSampleData: true });

  useEffect(() => {
    let cancelled = false;

    loadDepreciationScheduleDataForCurrentTenant().then((result) => {
      if (cancelled || !result) return;
      setState({ data: result, isSampleData: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
