// ------------------------------------------------------------------
// 貸借対照表・株主資本等変動計算書・個別注記表の簡易生成。
//
// このアプリは銀行口座等の取引明細（フロー情報）しか保持しておらず、
// 資産・負債の期末残高（ストック情報）を単独では算出できない。
// そのため「資本金」と「期首現金残高」の2つだけ利用者に入力してもらい、
// 期首時点で資産＝現金のみ・負債ゼロという単純化を置くことで、
// 期首繰越利益剰余金＝期首現金－資本金 として貸借対照表を必ず一致させている。
// 固定資産・売掛金・借入金等、現金以外の資産負債は反映されない。
// ------------------------------------------------------------------

export interface BalanceSheetInputs {
  capitalStock: number; // 資本金
  openingCash: number; // 期首現金残高
  shareCount?: number; // 発行済株式数（任意、一株当たり情報の計算に使用）
}

export interface BalanceSheetForm {
  capitalStock: number;
  openingCash: number;
  openingRetainedEarnings: number; // 期首繰越利益剰余金（＝期首現金－資本金）
  netIncome: number; // 当期純利益（法人税等・消費税等すべて控除後）
  endingCash: number; // 期末現金及び預金（＝期首現金＋当期収入－当期支出）
  unpaidCorporateTaxes: number; // 未払法人税等（法人税＋地方法人税＋住民税＋事業税等）
  unpaidConsumptionTax: number; // 未払消費税等
  liabilitiesTotal: number;
  retainedEarningsEnding: number;
  netAssetsTotal: number;
  assetsTotal: number;
  balanced: boolean; // 資産合計＝負債＋純資産合計 になっているかの検算
  shareCount?: number;
  netAssetPerShare?: number;
  netIncomePerShare?: number;
}

export function buildBalanceSheetForm(
  inputs: BalanceSheetInputs,
  cashInflow: number,
  cashOutflow: number,
  unpaidCorporateTaxes: number,
  unpaidConsumptionTax: number,
  netIncome: number
): BalanceSheetForm {
  const openingRetainedEarnings = inputs.openingCash - inputs.capitalStock;
  const endingCash = inputs.openingCash + cashInflow - cashOutflow;
  const liabilitiesTotal = unpaidCorporateTaxes + unpaidConsumptionTax;
  const retainedEarningsEnding = openingRetainedEarnings + netIncome;
  const netAssetsTotal = inputs.capitalStock + retainedEarningsEnding;
  const assetsTotal = endingCash;

  const shareCount = inputs.shareCount && inputs.shareCount > 0 ? inputs.shareCount : undefined;

  return {
    capitalStock: inputs.capitalStock,
    openingCash: inputs.openingCash,
    openingRetainedEarnings,
    netIncome,
    endingCash,
    unpaidCorporateTaxes,
    unpaidConsumptionTax,
    liabilitiesTotal,
    retainedEarningsEnding,
    netAssetsTotal,
    assetsTotal,
    balanced: Math.abs(assetsTotal - (liabilitiesTotal + netAssetsTotal)) < 1,
    shareCount,
    netAssetPerShare: shareCount ? Math.round((netAssetsTotal / shareCount) * 100) / 100 : undefined,
    netIncomePerShare: shareCount ? Math.round((netIncome / shareCount) * 100) / 100 : undefined,
  };
}
