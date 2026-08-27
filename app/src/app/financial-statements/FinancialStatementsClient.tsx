"use client";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { buildConsumptionTaxForm } from "@/lib/tax/consumptionTaxForm";
import { buildCorporateTaxForm, buildFinancialStatements } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildBalanceSheetForm } from "@/lib/tax/balanceSheetForm";
import { buildEquityChangeForm } from "@/lib/tax/equityChangeForm";
import { buildNotesForm } from "@/lib/tax/notesForm";
import { EquityChangeStatement } from "@/components/EquityChangeStatement";
import { NotesToFinancialStatements } from "@/components/NotesToFinancialStatements";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { formatFiscalYearRange } from "@/lib/export/printLayout";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";

// このページ専用のサンプルデータ。実データ（journal_entries）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （history/page.tsx・export/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ、金額はサンプル）。
export const SAMPLE_ENTITY_NAME = "今ごえん合同会社";
const SAMPLE_CAPITAL_STOCK = 1_000_000; // 資本金
const SAMPLE_OPENING_CASH = 3_000_000; // 期首現金残高
const SAMPLE_SHARE_COUNT = 100; // 発行済株式数（任意）

// 注: 資本金・期首現金残高・貸借対照表/株主資本等変動計算書の計算ロジックそのものは、
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md のステージ③
// （balanceSheetForm.ts・equityChangeForm.tsの再設計、company_opening_balances/
// fixed_assets/loansからの実残高積み上げ）の対象。lib/tax/balanceSheetForm.ts・
// lib/tax/equityChangeForm.tsは本stage②では無改修のまま呼び出し、資本金・期首現金残高の
// 入力値も従来どおりサンプル値のままとする。実データ化するのはP/L・消費税・法人税本体
// （当期の取引明細）のみ。

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

  const balanceSheet = buildBalanceSheetForm(
    { capitalStock: SAMPLE_CAPITAL_STOCK, openingCash: SAMPLE_OPENING_CASH, shareCount: SAMPLE_SHARE_COUNT },
    pl.incomeTotal,
    pl.expenseTotal,
    fs.taxes,
    consumptionForm.totalDue,
    bsNetIncome
  );

  const equityChange = buildEquityChangeForm({
    capitalStock: SAMPLE_CAPITAL_STOCK,
    openingCash: SAMPLE_OPENING_CASH,
    netIncome: bsNetIncome,
  });

  const notes = buildNotesForm({
    unpaidCorporateTaxes: balanceSheet.unpaidCorporateTaxes,
    unpaidConsumptionTax: balanceSheet.unpaidConsumptionTax,
    equityChange,
    shareCount: SAMPLE_SHARE_COUNT,
  });

  const fiscalYearLabel = formatFiscalYearRange(pl.periodStart, pl.periodEnd);

  const balanceSheetSection = (
    <section>
      <h2 className="text-lg font-semibold mb-3">貸借対照表</h2>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed max-w-2xl">
        固定資産・売掛金・借入金等、現金以外の資産負債はこのアプリでは反映されません。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                <th className="px-3 py-2 font-normal" colSpan={2}>資産の部</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100 dark:border-stone-800 print:break-inside-avoid">
                <td className="px-3 py-2">現金及び預金</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.endingCash)}</td>
              </tr>
              <tr className="print:break-inside-avoid">
                <td className="px-3 py-2 font-semibold">資産の部合計</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.assetsTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal" colSpan={2}>負債の部</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100 dark:border-stone-800 print:break-inside-avoid">
                  <td className="px-3 py-2">未払法人税等</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.unpaidCorporateTaxes)}</td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800 print:break-inside-avoid">
                  <td className="px-3 py-2">未払消費税等</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.unpaidConsumptionTax)}</td>
                </tr>
                <tr className="print:break-inside-avoid">
                  <td className="px-3 py-2 font-semibold">負債の部合計</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.liabilitiesTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal" colSpan={2}>純資産の部</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100 dark:border-stone-800 print:break-inside-avoid">
                  <td className="px-3 py-2">資本金</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.capitalStock)}</td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800 print:break-inside-avoid">
                  <td className="px-3 py-2">繰越利益剰余金</td>
                  <td className="px-3 py-2 text-right tabular-nums">{yen.format(balanceSheet.retainedEarningsEnding)}</td>
                </tr>
                <tr className="print:break-inside-avoid">
                  <td className="px-3 py-2 font-semibold">純資産の部合計</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(balanceSheet.netAssetsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
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
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl -mt-6">
        {isSampleData
          ? `${SAMPLE_ENTITY_NAME}を想定したサンプルデータで当期の損益を表示しています（資本金・期首現金残高もサンプル値）。`
          : "記帳された実データ（当期の損益）を表示しています（資本金・期首現金残高は現時点ではサンプル値のままです）。"}
      </p>

      <PrintableStatementLayout
        tenantName={SAMPLE_ENTITY_NAME}
        fiscalYearLabel={fiscalYearLabel}
        sections={[
          { id: "balance-sheet", content: balanceSheetSection },
          { id: "equity-change", content: <EquityChangeStatement form={equityChange} /> },
          { id: "notes", content: <NotesToFinancialStatements form={notes} />, forceNewPage: true },
        ]}
      />
    </>
  );
}
