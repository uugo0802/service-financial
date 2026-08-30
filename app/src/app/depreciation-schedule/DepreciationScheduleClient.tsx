"use client";

import { Asset, FiscalPeriod } from "@/lib/tax/depreciation";
import { buildDepreciationScheduleForm } from "@/lib/tax/depreciationScheduleForm";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { DepreciationScheduleTable } from "@/components/DepreciationScheduleTable";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { ExportDataButton } from "@/components/ExportDataButton";
import { formatFiscalYearRange } from "@/lib/export/printLayout";
import { buildDepreciationScheduleExportCsv } from "@/lib/export/depreciationScheduleCsv";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useDepreciationScheduleData } from "@/hooks/useDepreciationScheduleData";

// このページ専用のサンプルデータ。実データ（fixed_assets・tenants）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （history/page.tsx・financial-statements/FinancialStatementsClient.tsxと同じ
// 「今ごえん合同会社」を想定した小規模法人のデータ（金額はサンプル）。
export const SAMPLE_ENTITY_NAME = "今ごえん合同会社";

const SAMPLE_ASSETS: Asset[] = [
  {
    id: "sample-asset-1",
    name: "ノートパソコン（業務用）",
    acquisitionDate: "2024-01-10",
    acquisitionCost: 480_000,
    usefulLifeYears: 4,
    method: "straight-line",
  },
  {
    id: "sample-asset-2",
    name: "オフィス什器一式",
    acquisitionDate: "2023-06-01",
    acquisitionCost: 200_000,
    usefulLifeYears: 8,
    method: "straight-line",
  },
  {
    id: "sample-asset-3",
    name: "業務用車両",
    acquisitionDate: "2026-07-15",
    acquisitionCost: 2_400_000,
    usefulLifeYears: 6,
    method: "straight-line",
  },
  {
    id: "sample-asset-4",
    name: "サーバー機器（定率法選択）",
    acquisitionDate: "2025-04-01",
    acquisitionCost: 900_000,
    usefulLifeYears: 5,
    method: "declining-balance",
  },
  {
    id: "sample-asset-5",
    name: "複合プリンター",
    acquisitionDate: "2026-05-20",
    acquisitionCost: 180_000,
    usefulLifeYears: 5,
    immediateExpensing: true,
  },
];

// 対象期間（FiscalPeriod）は表示自体には使わず、
// financial-statements/FinancialStatementsClient.tsxと同じ方式
// （buildProfitLossStatement(transactions)が返すpl.periodStart/periodEndから組み立てる）
// で算出するためだけに使う、このページ専用のフォールバック取引データ。
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

export function DepreciationScheduleClient() {
  const { transactions } = useLedgerTransactions(SAMPLE_ENTRIES);
  const pl = buildProfitLossStatement(transactions);
  const fiscalPeriod: FiscalPeriod = { start: pl.periodStart, end: pl.periodEnd };

  const { data, isSampleData } = useDepreciationScheduleData();
  const entityName = data?.entityName ?? SAMPLE_ENTITY_NAME;
  const assets = data?.assets ?? SAMPLE_ASSETS;

  const form = buildDepreciationScheduleForm(assets, fiscalPeriod);
  const fiscalYearLabel = formatFiscalYearRange(fiscalPeriod.start, fiscalPeriod.end);
  const csv = buildDepreciationScheduleExportCsv({ form, entityName });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 -mt-2">
        <p className="text-xs text-stone-500 leading-relaxed max-w-2xl">
          {isSampleData
            ? `${SAMPLE_ENTITY_NAME}を想定したサンプルの固定資産データで別表十六（一）の下書きを表示しています。`
            : "固定資産台帳に登録された実データに基づいて別表十六（一）の下書きを表示しています。"}
        </p>
        <ExportDataButton
          csvContent={csv}
          fileNamePrefix="depreciation-schedule"
          label="CSVをダウンロード（別表十六（一））"
          className="print:hidden shrink-0 rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        />
      </div>

      <PrintableStatementLayout
        tenantName={entityName}
        fiscalYearLabel={fiscalYearLabel}
        printButtonLabel="印刷 / PDFで保存（別表十六（一））"
        sections={[
          { id: "depreciation-schedule", content: <DepreciationScheduleTable form={form} entityName={entityName} /> },
        ]}
      />
    </>
  );
}
