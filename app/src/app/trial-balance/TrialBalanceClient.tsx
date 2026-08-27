"use client";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildTrialBalance, DEFAULT_CASH_ACCOUNT } from "@/lib/tax/trialBalance";
import { TrialBalanceTable } from "@/components/TrialBalanceTable";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";

// このページ専用のサンプルデータ。実データ（journal_entries）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （financial-statements/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ、金額はサンプル）。
export const SAMPLE_ENTITY_NAME = "今ごえん合同会社";
const SAMPLE_CAPITAL_STOCK = 1_000_000; // 資本金（前期繰越高・貸方）
const SAMPLE_OPENING_CASH = 3_000_000; // 期首現金残高（前期繰越高・借方）

// 注: 期首残高（前期繰越高）は company_opening_balances テーブル（ステージ①で追加済み）
// から本来取得すべきだが、それを実際の貸借対照表計算に反映する設計は
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md のステージ③
// （balanceSheetForm.ts等の再設計）の範囲。本ページはステージ②の範囲内に留め、
// 期首残高は従来どおりサンプル値のまま、当期の取引明細（journal_entries由来）のみを
// 実データに差し替える。

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

export function TrialBalanceClient() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_ENTRIES);

  // balanceSheetForm.ts / equityChangeForm.tsと同じ簡易化：期首時点は
  // 「資産＝現金のみ・負債ゼロ」と仮定し、期首繰越利益剰余金＝期首現金－資本金として
  // 前期繰越高を組み立てる。これにより前期繰越高段階から借方合計＝貸方合計になる。
  const openingRetainedEarnings = SAMPLE_OPENING_CASH - SAMPLE_CAPITAL_STOCK;

  const tb = buildTrialBalance(transactions, {
    openingBalances: {
      [DEFAULT_CASH_ACCOUNT]: { debit: SAMPLE_OPENING_CASH },
      資本金: { credit: SAMPLE_CAPITAL_STOCK },
      繰越利益剰余金: { credit: openingRetainedEarnings },
    },
  });

  return (
    <>
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl -mt-6">
        {isSampleData
          ? `${SAMPLE_ENTITY_NAME}を想定したサンプルデータで当期の取引を表示しています（前期繰越高もサンプル値）。`
          : "記帳された実データ（当期の取引）を表示しています（前期繰越高は現時点ではサンプル値のままです）。"}
      </p>
      <TrialBalanceTable tb={tb} />
    </>
  );
}
