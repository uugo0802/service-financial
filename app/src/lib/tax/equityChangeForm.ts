// ------------------------------------------------------------------
// 株主資本等変動計算書の生成。
//
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③により、
// balanceSheetForm.ts と同じ実残高ベースの考え方に揃えた。期首繰越利益剰余金は
// company_opening_balances.retained_earnings をそのまま受け取る（openingRetainedEarnings）。
// 固定資産・借入金の期首残高を持たない簡易な呼び出し元（DocumentPreview.tsx等）との
// 後方互換のため、openingRetainedEarnings を省略した場合のみ、従来通り
// 「期首は資産＝現金のみ・負債ゼロ」という単純化で openingCash - capitalStock から逆算する。
//
// 当期中の増資・減資・自己株式の取得等の資本取引は発生していないものとして
// 扱う（資本金は期首・期末で不変）。該当する資本取引がある場合、この書類は
// それを反映できないため、利用者側で別途調整・追記する必要がある。
//
// ここで算出した純資産合計（期末）は、buildBalanceSheetForm() の netAssetsTotal と
// 必ず一致する（同じ capitalStock・openingRetainedEarnings・netIncome から機械的に
// 導出しているため。固定資産・借入金の期末残高はどちらも負債・資産の内訳にのみ影響し、
// 純資産合計には影響しない）。
// ------------------------------------------------------------------

export interface EquityChangeInputs {
  capitalStock: number; // 資本金
  openingCash: number; // 期首現金残高（openingRetainedEarnings省略時のみ、逆算に使用）
  /**
   * 期首繰越利益剰余金（company_opening_balances.retained_earnings）。
   * 指定した場合はそのまま使用する。省略した場合は後方互換フォールバックとして
   * openingCash - capitalStock（期首は資産＝現金のみ・負債ゼロという単純化）から逆算する。
   */
  openingRetainedEarnings?: number;
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
  const openingRetainedEarnings = inputs.openingRetainedEarnings ?? inputs.openingCash - inputs.capitalStock;
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
