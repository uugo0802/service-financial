// ------------------------------------------------------------------
// 貸借対照表・株主資本等変動計算書・個別注記表の生成。
//
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③により、
// company_opening_balances（期首残高）＋ journal_entries（全期間）＋ fixed_assets ＋ loans
// から実際の資産・負債残高を積み上げて計算するよう再設計した。固定資産は depreciation.ts、
// 借入金は loanAmortization.ts の計算結果を積み上げる。
//
// 現金及び預金の期末残高は、company_opening_balances.cash_balance を起点に、
// journal_entries のうち「現金・預金勘定（＝固定資産科目ではない資産科目）」を
// 借方・貸方に持つ全ての仕訳を積み上げて計算する（sumCashLedgerMovement）。これにより
// 通常の収益・費用の入出金だけでなく、固定資産の現金購入・借入金の元利返済など
// P/Lに現れない現金の動きも正しく反映される。
//
// 固定資産の期末帳簿価額・借入金の期末元本残高は、journal_entries に「現金を伴わない
// 仕訳の自動生成バッチ」（lib/db/generatedEntries.ts）が生成した仕訳が実際に存在するかに
// 依存せず、fixed_assets / loans の台帳データから depreciation.ts / loanAmortization.ts の
// 計算式で直接算出する（常に正しい残高を返せるようにするため）。ただし、現金の期末残高は
// 実際に記録された journal_entries から積み上げるため、対象期間の現金を伴わない仕訳の
// 自動生成バッチが未実行の場合、固定資産・借入金の帳簿価額とキャッシュフローの整合が
// 取れず、balanced が false になることがある（バッチを先に実行してから計算すること）。
//
// journal_entries を渡さない・fixedAssets/loansを渡さない呼び出し（DocumentPreview.tsx等、
// 手入力の資本金・期首現金残高のみを使う簡易フロー）とも後方互換を保つため、
// 従来通り cashInflow・cashOutflow を明示的な引数として受け取る形は維持している
// （実データ利用時は、呼び出し側が sumCashLedgerMovement 等で計算した値を渡すこと）。
// ------------------------------------------------------------------

import { AccountRow, JournalEntryRow } from "../db/supabaseClient";
import { Asset, calculateAssetDepreciation, FiscalPeriod } from "./depreciation";
import { Loan, outstandingPrincipalAsOf } from "./loanAmortization";

export interface BalanceSheetInputs {
  capitalStock: number; // 資本金（tenants.capital_amount）
  openingCash: number; // 期首現金及び預金残高（company_opening_balances.cash_balance）
  /**
   * 期首繰越利益剰余金（company_opening_balances.retained_earnings）。
   * 指定した場合はそのまま使用する。省略した場合は、固定資産・借入金等の期首残高を
   * 持たない簡易な呼び出し元向けの後方互換フォールバックとして、
   * 従来通り openingCash - capitalStock（期首は資産＝現金のみ・負債ゼロという単純化）
   * から逆算する。
   */
  openingRetainedEarnings?: number;
  shareCount?: number; // 発行済株式数（任意、一株当たり情報の計算に使用）
  /** 固定資産一覧（lib/tax/depreciation.tsのAsset）。指定時は期末帳簿価額を資産の部に積み上げる */
  fixedAssets?: Asset[];
  /** 借入金一覧（lib/tax/loanAmortization.tsのLoan）。指定時は期末元本残高を負債の部に積み上げる */
  loans?: Loan[];
  /** fixedAssets・loansの期末残高計算の基準となる対象期間。fixedAssets・loansを指定する場合は必須 */
  fiscalPeriod?: FiscalPeriod;
}

export interface BalanceSheetForm {
  capitalStock: number;
  openingCash: number;
  openingRetainedEarnings: number; // 期首繰越利益剰余金
  netIncome: number; // 当期純利益（法人税等・消費税等すべて控除後）
  endingCash: number; // 期末現金及び預金（＝期首現金＋当期収入－当期支出）
  fixedAssetsBookValue: number; // 固定資産期末帳簿価額合計（fixedAssets未指定時は0）
  loansBalance: number; // 借入金期末元本残高合計（loans未指定時は0）
  unpaidCorporateTaxes: number; // 未払法人税等（法人税＋地方法人税＋住民税＋事業税等）
  unpaidConsumptionTax: number; // 未払消費税等
  liabilitiesTotal: number; // unpaidCorporateTaxes + unpaidConsumptionTax + loansBalance
  retainedEarningsEnding: number;
  netAssetsTotal: number;
  assetsTotal: number; // endingCash + fixedAssetsBookValue
  balanced: boolean; // 資産合計＝負債＋純資産合計 になっているかの検算
  shareCount?: number;
  netAssetPerShare?: number;
  netIncomePerShare?: number;
}

/** journal_entries全体の中から「現金・預金勘定」とみなす資産科目のID集合を求める。 */
function resolveCashAccountIds(accounts: AccountRow[], fixedAssetAccountIds: ReadonlySet<string>): Set<string> {
  return new Set(
    accounts.filter((account) => account.account_type === "asset" && !fixedAssetAccountIds.has(account.id)).map((a) => a.id)
  );
}

export interface CashLedgerMovement {
  inflow: number; // 現金・預金勘定への当期の借方計上額合計
  outflow: number; // 現金・預金勘定への当期の貸方計上額合計
}

/**
 * journal_entries（全期間）から、「現金及び預金」とみなす勘定科目
 * （account_type === "asset" かつ fixed_assets.asset_account_id として登録されていない
 * 資産科目）への入出金合計を計算する。company_opening_balances.as_of_date より後、
 * 対象期間の終了日（periodEnd）までの仕訳のみを対象とする（as_of_date以前の分は
 * 期首残高（openingCash）に反映済みのため、二重計上を避ける）。
 *
 * 現金・預金勘定同士の振替仕訳（例: 現金→普通預金）は、借方・貸方の双方が
 * cashAccountIdsに含まれるため inflow・outflow の両方に同額が計上され、
 * 差し引きゼロになる（現金・預金全体をひとつのプールとして扱う設計）。
 */
export function sumCashLedgerMovement(
  entries: JournalEntryRow[],
  accounts: AccountRow[],
  fixedAssetAccountIds: Iterable<string>,
  asOfDate: string,
  periodEnd: string
): CashLedgerMovement {
  const cashAccountIds = resolveCashAccountIds(accounts, new Set(fixedAssetAccountIds));

  let inflow = 0;
  let outflow = 0;
  for (const entry of entries) {
    if (entry.date <= asOfDate || entry.date > periodEnd) continue;
    if (cashAccountIds.has(entry.debit_account_id)) inflow += entry.amount;
    if (cashAccountIds.has(entry.credit_account_id)) outflow += entry.amount;
  }
  return { inflow, outflow };
}

/**
 * 固定資産一覧の期末帳簿価額合計を計算する。対象期間末までに取得済みの資産のみを対象とし、
 * 各資産の帳簿価額は depreciation.ts の calculateAssetDepreciation() で算出する
 * （journal_entries に減価償却の生成仕訳が実際にあるかどうかには依存しない）。
 */
export function sumFixedAssetsBookValue(fixedAssets: Asset[], period: FiscalPeriod): number {
  return fixedAssets
    .filter((asset) => asset.acquisitionDate <= period.end)
    .reduce((sum, asset) => sum + calculateAssetDepreciation(asset, period).endingBookValue, 0);
}

/**
 * 借入金一覧の期末元本残高合計を計算する。各借入金の残高は loanAmortization.ts の
 * outstandingPrincipalAsOf() で算出する（journal_entries に返済の生成仕訳が実際に
 * あるかどうかには依存しない）。
 */
export function sumLoansBalance(loans: Loan[], periodEnd: string): number {
  return loans.reduce((sum, loan) => sum + outstandingPrincipalAsOf(loan, periodEnd), 0);
}

export function buildBalanceSheetForm(
  inputs: BalanceSheetInputs,
  cashInflow: number,
  cashOutflow: number,
  unpaidCorporateTaxes: number,
  unpaidConsumptionTax: number,
  netIncome: number
): BalanceSheetForm {
  const openingRetainedEarnings = inputs.openingRetainedEarnings ?? inputs.openingCash - inputs.capitalStock;
  const endingCash = inputs.openingCash + cashInflow - cashOutflow;

  const fixedAssetsBookValue =
    inputs.fixedAssets && inputs.fiscalPeriod ? sumFixedAssetsBookValue(inputs.fixedAssets, inputs.fiscalPeriod) : 0;
  const loansBalance = inputs.loans && inputs.fiscalPeriod ? sumLoansBalance(inputs.loans, inputs.fiscalPeriod.end) : 0;

  const liabilitiesTotal = unpaidCorporateTaxes + unpaidConsumptionTax + loansBalance;
  const retainedEarningsEnding = openingRetainedEarnings + netIncome;
  const netAssetsTotal = inputs.capitalStock + retainedEarningsEnding;
  const assetsTotal = endingCash + fixedAssetsBookValue;

  const shareCount = inputs.shareCount && inputs.shareCount > 0 ? inputs.shareCount : undefined;

  return {
    capitalStock: inputs.capitalStock,
    openingCash: inputs.openingCash,
    openingRetainedEarnings,
    netIncome,
    endingCash,
    fixedAssetsBookValue,
    loansBalance,
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
