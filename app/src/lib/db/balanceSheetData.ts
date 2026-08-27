import { getMyTenantUser, getTenant } from "./tenants";
import { listAccounts } from "./accounts";
import { listJournalEntries } from "./journalEntries";
import { listFixedAssets, toDepreciationAsset } from "./fixedAssets";
import { listLoans, toAmortizationLoan } from "./loans";
import { getCompanyOpeningBalance } from "./openingBalances";
import { ensureGeneratedEntries } from "./generatedEntries";
import { sumCashLedgerMovement } from "../tax/balanceSheetForm";
import { Asset, FiscalPeriod } from "../tax/depreciation";
import { Loan } from "../tax/loanAmortization";
import { DEFAULT_CASH_ACCOUNT } from "../tax/trialBalance";

// ------------------------------------------------------------------
// company_opening_balances・journal_entries・fixed_assets・loans・
// tenants.capital_amount から、balanceSheetForm.ts / equityChangeForm.ts に渡す実データを
// 組み立てる読み込み関数。docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md
// ステージ③「trial-balance/financial-statementsページの実データ接続」に対応する。
//
// ledgerTransactions.ts（ステージ②）と同じ方針を踏襲する：
//   - Supabase未設定・未ログイン・実データ未投入の場合は null を返し、
//     呼び出し側（各ページ）はページ専用のサンプルデータへフォールバックする。
//   - 呼び出し前に、対象事業年度の「現金を伴わない仕訳の自動生成バッチ」
//     （減価償却・借入金返済、lib/db/generatedEntries.ts）を実行し、生成済み仕訳が
//     揃っていることを保証してから現金残高を積み上げる（balanceSheetForm.tsファイル冒頭の
//     コメント参照。生成バッチが未実行だと固定資産・借入金の帳簿価額とキャッシュフローの
//     整合が取れない）。
// ------------------------------------------------------------------

export interface LedgerBalanceSheetData {
  capitalStock: number; // tenants.capital_amount
  openingCash: number; // company_opening_balances.cash_balance
  openingRetainedEarnings: number; // company_opening_balances.retained_earnings
  fixedAssets: Asset[];
  loans: Loan[];
  cashInflow: number; // 対象期間の現金・預金勘定への借方計上額合計
  cashOutflow: number; // 対象期間の現金・預金勘定への貸方計上額合計
  fiscalPeriod: FiscalPeriod;
}

/**
 * ログイン中ユーザーの所属テナントの実データを取得し、balanceSheetForm.ts /
 * equityChangeForm.ts に渡せる形に組み立てて返す。
 *
 * 以下のいずれかに該当する場合は null を返す（呼び出し側はページ専用のサンプルデータへ
 * フォールバックすること）:
 *   - Supabase未設定（getSupabaseClient()が例外を投げる）
 *   - 未ログイン、またはログイン中ユーザーの所属テナントが見つからない
 *   - company_opening_balances が未投入（ステージ④の期首残高投入フォーム未使用のテナント）
 *   - 現金・預金勘定として使える資産科目が1つも見つからない（accountsが未整備）
 *   - 取得・計算中に何らかのエラーが発生した
 */
export async function loadBalanceSheetDataForCurrentTenant(fiscalPeriod: FiscalPeriod): Promise<LedgerBalanceSheetData | null> {
  try {
    const tenantUser = await getMyTenantUser();
    if (!tenantUser) return null;

    const [tenant, openingBalance, accounts, fixedAssetRows, loanRows] = await Promise.all([
      getTenant(tenantUser.tenant_id),
      getCompanyOpeningBalance(tenantUser.tenant_id),
      listAccounts(tenantUser.tenant_id),
      listFixedAssets(tenantUser.tenant_id),
      listLoans(tenantUser.tenant_id),
    ]);

    if (!tenant || !openingBalance) return null;

    const fixedAssetAccountIds = fixedAssetRows.map((row) => row.asset_account_id);
    const cashLikeAccounts = accounts.filter((account) => account.account_type === "asset" && !fixedAssetAccountIds.includes(account.id));
    // 現金・預金勘定が複数ある場合は、既定名（DEFAULT_CASH_ACCOUNT="現金及び預金"）を優先する。
    // 見つからない場合は最初に見つかった現金・預金勘定にフォールバックする。
    const cashAccount = cashLikeAccounts.find((account) => account.name === DEFAULT_CASH_ACCOUNT) ?? cashLikeAccounts[0];
    if (!cashAccount) return null;

    await ensureGeneratedEntries(tenantUser.tenant_id, fiscalPeriod, { cashAccountId: cashAccount.id });

    const entries = await listJournalEntries(tenantUser.tenant_id);
    const cash = sumCashLedgerMovement(entries, accounts, fixedAssetAccountIds, openingBalance.as_of_date, fiscalPeriod.end);

    return {
      capitalStock: tenant.capital_amount ?? 0,
      openingCash: openingBalance.cash_balance,
      openingRetainedEarnings: openingBalance.retained_earnings,
      fixedAssets: fixedAssetRows.map(toDepreciationAsset),
      loans: loanRows.map(toAmortizationLoan),
      cashInflow: cash.inflow,
      cashOutflow: cash.outflow,
      fiscalPeriod,
    };
  } catch {
    return null;
  }
}
