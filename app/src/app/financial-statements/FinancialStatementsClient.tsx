"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { buildConsumptionTaxForm } from "@/lib/tax/consumptionTaxForm";
import { buildCorporateTaxForm, buildFinancialStatements } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildBalanceSheetForm } from "@/lib/tax/balanceSheetForm";
import { buildEquityChangeForm } from "@/lib/tax/equityChangeForm";
import { buildCashFlowStatement } from "@/lib/tax/cashFlowStatement";
import { buildNotesForm } from "@/lib/tax/notesForm";
import { buildAccountBreakdownForms } from "@/lib/tax/accountBreakdownForm";
import { buildMonthlySalesTrend } from "@/lib/tax/businessOverviewForm";
import { EquityChangeStatement } from "@/components/EquityChangeStatement";
import { CashFlowStatement } from "@/components/CashFlowStatement";
import { NotesToFinancialStatements } from "@/components/NotesToFinancialStatements";
import { AccountBreakdownStatement } from "@/components/AccountBreakdownStatement";
import { BusinessOverviewStatement } from "@/components/BusinessOverviewStatement";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { formatFiscalYearRange } from "@/lib/export/printLayout";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useBalanceSheetData } from "@/hooks/useBalanceSheetData";

// このページ専用のサンプルデータ。実データ（journal_entries・company_opening_balances・
// fixed_assets・loans）が取得できない間、または未ログイン・Supabase未設定・
// 期首残高未投入（ステージ④の期首残高投入フォーム未使用）の場合のフォールバック表示に使う
// （history/page.tsx・export/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ、金額はサンプル）。
export const SAMPLE_ENTITY_NAME = "今ごえん合同会社";
const SAMPLE_CAPITAL_STOCK = 1_000_000; // 資本金
const SAMPLE_OPENING_CASH = 3_000_000; // 期首現金残高
const SAMPLE_SHARE_COUNT = 100; // 発行済株式数（任意）

const SAMPLE_ENTRIES: CategorizedTransaction[] = [
  {
    id: "sample-1",
    date: "2026-04-10",
    description: "コンサルティングフィー入金（A社）",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-2",
    date: "2026-04-15",
    description: "コワーキングスペース利用料",
    amount: -32_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "WeWork月額利用料",
  },
  {
    id: "sample-3",
    date: "2026-05-02",
    description: "取引先との会食, 打ち合わせ費用",
    amount: -8_800,
    account: "接待交際費",
    taxCategory: "課税仕入10%",
    confidence: 0.82,
    source: "ai",
    note: "領収書に \"接待\" の記載あり",
  },
  {
    id: "sample-4",
    date: "2026-05-20",
    description: "会計ソフト・クラウドサービス利用料",
    amount: -12_400,
    account: "支払手数料(ソフトウェア利用料)",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-5",
    date: "2026-06-01",
    description: "資産管理コンサルティングフィー入金（B社）",
    amount: 780_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function FinancialStatementsClient() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_ENTRIES);

  const estimate = estimateForMicroCorp(transactions);
  const pl = buildProfitLossStatement(transactions);
  const consumptionForm = buildConsumptionTaxForm(transactions);
  const taxForm = buildCorporateTaxForm(estimate);
  const localTaxForm = buildLocalCorporateTaxForm(estimate, taxForm);
  const fs = buildFinancialStatements(pl, taxForm, SAMPLE_ENTITY_NAME, localTaxForm.grandTotal);

  // 貸借対照表・株主資本等変動計算書は、税込経理の慣行に合わせ
  // 未払消費税等も反映した「調整後・当期純利益」で繰越利益剰余金を計算する
  // （DocumentPreview.tsxの決算報告書タブと同じ考え方）。
  const bsNetIncome = fs.incomeBeforeTax - fs.taxes - consumptionForm.totalDue;

  // 資本金・期首残高・固定資産・借入金は company_opening_balances / fixed_assets / loans /
  // tenants.capital_amount から実データを取得する（ledgerTransactions.tsと同じ、
  // Supabase未設定・未ログイン・期首残高未投入時はnullを返しサンプル値へフォールバックする方針）。
  const { data: bsData, isSampleData: isSampleBalanceSheetData } = useBalanceSheetData({
    start: pl.periodStart,
    end: pl.periodEnd,
  });

  const balanceSheet = bsData
    ? buildBalanceSheetForm(
        {
          capitalStock: bsData.capitalStock,
          openingCash: bsData.openingCash,
          openingRetainedEarnings: bsData.openingRetainedEarnings,
          shareCount: SAMPLE_SHARE_COUNT,
          fixedAssets: bsData.fixedAssets,
          loans: bsData.loans,
          fiscalPeriod: bsData.fiscalPeriod,
        },
        bsData.cashInflow,
        bsData.cashOutflow,
        fs.taxes,
        consumptionForm.totalDue,
        bsNetIncome
      )
    : buildBalanceSheetForm(
        { capitalStock: SAMPLE_CAPITAL_STOCK, openingCash: SAMPLE_OPENING_CASH, shareCount: SAMPLE_SHARE_COUNT },
        pl.incomeTotal,
        pl.expenseTotal,
        fs.taxes,
        consumptionForm.totalDue,
        bsNetIncome
      );

  const equityChange = bsData
    ? buildEquityChangeForm({
        capitalStock: bsData.capitalStock,
        openingCash: bsData.openingCash,
        openingRetainedEarnings: bsData.openingRetainedEarnings,
        netIncome: bsNetIncome,
      })
    : buildEquityChangeForm({
        capitalStock: SAMPLE_CAPITAL_STOCK,
        openingCash: SAMPLE_OPENING_CASH,
        netIncome: bsNetIncome,
      });

  // キャッシュ・フロー計算書（簡易・間接法）。fixedAssets・loans・fiscalPeriodはbsDataが
  // 無い（サンプルデータ表示の）間は空配列・pl由来の期間にフォールバックする
  // （balanceSheet・equityChangeと同じ方針）。
  const cashFlow = buildCashFlowStatement({
    fiscalPeriod: bsData?.fiscalPeriod ?? { start: pl.periodStart, end: pl.periodEnd },
    netIncome: bsNetIncome,
    unpaidCorporateTaxes: balanceSheet.unpaidCorporateTaxes,
    unpaidConsumptionTax: balanceSheet.unpaidConsumptionTax,
    fixedAssets: bsData?.fixedAssets ?? [],
    loans: bsData?.loans ?? [],
    openingCash: balanceSheet.openingCash,
    balanceSheetEndingCash: balanceSheet.endingCash,
  });

  const notes = buildNotesForm({
    unpaidCorporateTaxes: balanceSheet.unpaidCorporateTaxes,
    unpaidConsumptionTax: balanceSheet.unpaidConsumptionTax,
    equityChange,
    shareCount: SAMPLE_SHARE_COUNT,
  });

  // 勘定科目内訳明細書・法人事業概況説明書（売上高の月別推移）は、貸借対照表等と異なり
  // 期首残高等を必要とせず取引明細（transactions）だけから機械的に算出できるため、
  // isSampleData（transactions自体のサンプル/実データ切替）にそのまま従う。
  const accountBreakdowns = buildAccountBreakdownForms(transactions);
  const monthlySales = buildMonthlySalesTrend(transactions);

  const fiscalYearLabel = formatFiscalYearRange(pl.periodStart, pl.periodEnd);

  const balanceSheetSection = (
    <section>
      <h2 className="text-lg font-semibold mb-3">貸借対照表</h2>
      <p className="text-xs text-stone-500 mb-3 leading-relaxed max-w-2xl">
        {bsData
          ? "固定資産・借入金は台帳データ（減価償却・返済スケジュールの計算結果）から積み上げています。売掛金・買掛金等、これら以外の資産負債はこのアプリでは反映されません。"
          : "固定資産・売掛金・借入金等、現金以外の資産負債はこのアプリでは反映されません。"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TableScrollArea innerClassName="border border-stone-300 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                <th className="px-3 py-2 font-normal" colSpan={2}>資産の部</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100 print:break-inside-avoid">
                <td className="px-3 py-2">現金及び預金</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.endingCash)}</td>
              </tr>
              {balanceSheet.fixedAssetsBookValue > 0 && (
                <tr className="border-b border-stone-100 print:break-inside-avoid">
                  <td className="px-3 py-2">固定資産（期末帳簿価額）</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.fixedAssetsBookValue)}</td>
                </tr>
              )}
              <tr className="print:break-inside-avoid">
                <td className="px-3 py-2 font-semibold">資産の部合計</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.assetsTotal)}</td>
              </tr>
            </tbody>
          </table>
        </TableScrollArea>
        <div className="flex flex-col gap-4">
          <TableScrollArea innerClassName="border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal" colSpan={2}>負債の部</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100 print:break-inside-avoid">
                  <td className="px-3 py-2">未払法人税等</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.unpaidCorporateTaxes)}</td>
                </tr>
                <tr className="border-b border-stone-100 print:break-inside-avoid">
                  <td className="px-3 py-2">未払消費税等</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.unpaidConsumptionTax)}</td>
                </tr>
                {balanceSheet.loansBalance > 0 && (
                  <tr className="border-b border-stone-100 print:break-inside-avoid">
                    <td className="px-3 py-2">借入金</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.loansBalance)}</td>
                  </tr>
                )}
                <tr className="print:break-inside-avoid">
                  <td className="px-3 py-2 font-semibold">負債の部合計</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.liabilitiesTotal)}</td>
                </tr>
              </tbody>
            </table>
          </TableScrollArea>
          <TableScrollArea innerClassName="border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal" colSpan={2}>純資産の部</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100 print:break-inside-avoid">
                  <td className="px-3 py-2">資本金</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.capitalStock)}</td>
                </tr>
                <tr className="border-b border-stone-100 print:break-inside-avoid">
                  <td className="px-3 py-2">繰越利益剰余金</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.retainedEarningsEnding)}</td>
                </tr>
                <tr className="print:break-inside-avoid">
                  <td className="px-3 py-2 font-semibold">純資産の部合計</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.netAssetsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </TableScrollArea>
        </div>
      </div>
      <p className={`text-xs mt-3 ${balanceSheet.balanced ? "text-stone-400" : "text-red-700"}`}>
        {balanceSheet.balanced
          ? "検算: 資産合計＝負債＋純資産合計（一致）"
          : "検算エラー: 資産合計と負債＋純資産合計が一致していません。入力値をご確認ください。"}
      </p>
    </section>
  );

  return (
    <>
      <p className="text-xs text-stone-500 leading-relaxed max-w-2xl">
        {isSampleData
          ? `${SAMPLE_ENTITY_NAME}を想定したサンプルデータで当期の損益を表示しています（資本金・期首残高もサンプル値）。`
          : isSampleBalanceSheetData
            ? "記帳された実データ（当期の損益）を表示しています（期首残高が未投入のため、資本金・期首現金残高は現時点ではサンプル値のままです）。"
            : "記帳された実データ（当期の損益・貸借対照表とも）を表示しています。"}
      </p>

      <PrintableStatementLayout
        tenantName={SAMPLE_ENTITY_NAME}
        fiscalYearLabel={fiscalYearLabel}
        sections={[
          { id: "balance-sheet", content: balanceSheetSection },
          { id: "equity-change", content: <EquityChangeStatement form={equityChange} /> },
          { id: "cash-flow", content: <CashFlowStatement form={cashFlow} /> },
          { id: "notes", content: <NotesToFinancialStatements form={notes} />, forceNewPage: true },
          {
            id: "account-breakdown",
            content: <AccountBreakdownStatement breakdowns={accountBreakdowns} />,
            forceNewPage: true,
          },
          {
            id: "business-overview",
            content: <BusinessOverviewStatement monthlySales={monthlySales} />,
            forceNewPage: true,
          },
        ]}
      />
    </>
  );
}
