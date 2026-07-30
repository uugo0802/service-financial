// ------------------------------------------------------------------
// 株主資本等変動計算書の簡易生成。
//
// balanceSheetForm.ts と同じ簡易化を前提にしている：このアプリは銀行口座等の
// 取引明細（フロー情報）しか保持しておらず、期首時点の資本構成（純資産の内訳）を
// 単独では算出できない。そのため「資本金」と「期首現金残高」の2つだけを
// 利用者に入力してもらい、期首時点で資産＝現金のみ・負債ゼロという単純化を置くことで、
// 期首繰越利益剰余金＝期首現金－資本金 として算出する（balanceSheetForm.tsと同一の考え方）。
//
// また、当期中の増資・減資・自己株式の取得等の資本取引は発生していないものとして
// 扱う（資本金は期首・期末で不変）。該当する資本取引がある場合、この書類は
// それを反映できないため、利用者側で別途調整・追記する必要がある。
//
// ここで算出した純資産合計（期末）は、buildBalanceSheetForm() の netAssetsTotal と
// 必ず一致する（同じ capitalStock・openingCash・netIncome から機械的に導出しているため）。
// ------------------------------------------------------------------

export interface EquityChangeInputs {
  capitalStock: number; // 資本金
  openingCash: number; // 期首現金残高（＝balanceSheetFormのopeningCashと同じ入力）
  netIncome: number; // 当期純利益（法人税等・消費税等すべて控除後、balanceSheetFormに渡すnetIncomeと同じ値）
}

export interface EquityChangeLine {
  label: string;
  openingBalance: number; // 当期首残高
  change: number; // 当期変動額
  closingBalance: number; // 当期末残高
}

export interface EquityChangeForm {
  capitalStock: EquityChangeLine; // 資本金
  retainedEarnings: EquityChangeLine; // 利益剰余金（繰越利益剰余金）
  netAssetsTotal: EquityChangeLine; // 純資産合計
}

export function buildEquityChangeForm(inputs: EquityChangeInputs): EquityChangeForm {
  const openingRetainedEarnings = inputs.openingCash - inputs.capitalStock;
  const closingRetainedEarnings = openingRetainedEarnings + inputs.netIncome;

  const openingNetAssets = inputs.capitalStock + openingRetainedEarnings;
  const closingNetAssets = inputs.capitalStock + closingRetainedEarnings;

  return {
    capitalStock: {
      label: "資本金",
      openingBalance: inputs.capitalStock,
      change: 0, // 当期中の増資・減資は発生していないものとして扱う（簡易化）
      closingBalance: inputs.capitalStock,
    },
    retainedEarnings: {
      label: "利益剰余金（繰越利益剰余金）",
      openingBalance: openingRetainedEarnings,
      change: inputs.netIncome,
      closingBalance: closingRetainedEarnings,
    },
    netAssetsTotal: {
      label: "純資産合計",
      openingBalance: openingNetAssets,
      change: inputs.netIncome,
      closingBalance: closingNetAssets,
    },
  };
}
