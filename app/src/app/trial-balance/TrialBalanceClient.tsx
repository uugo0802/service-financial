"use client";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildTrialBalance, DEFAULT_CASH_ACCOUNT } from "@/lib/tax/trialBalance";
import { TrialBalanceTable } from "@/components/TrialBalanceTable";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useBalanceSheetData } from "@/hooks/useBalanceSheetData";

// このページ専用のサンプルデータ。実データ（journal_entries）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （financial-statements/page.tsxと同じ「今ごえん合同会社」を想定した小規模法人のデータ、金額はサンプル）。
export const SAMPLE_ENTITY_NAME = "今ごえん合同会社";
const SAMPLE_CAPITAL_STOCK = 1_000_000; // 資本金（前期繰越高・貸方）
const SAMPLE_OPENING_CASH = 3_000_000; // 期首現金残高（前期繰越高・借方）

// 注: 前期繰越高（資本金・期首現金残高・期首繰越利益剰余金）は company_opening_balances /
// tenants.capital_amount から取得する（lib/db/balanceSheetData.tsのステージ③実装）。
// このページの試算表は deriveCategorizedTransactions() が射影した単式簿記近似の
// CategorizedTransaction[] を集計しているため（固定資産購入・借入金返済の元本部分等、
// 資産・負債の両建て仕訳は射影対象外）、固定資産・借入金そのものを独立の科目残高としては
// まだ表示できない。あくまで「現金及び預金・資本金・繰越利益剰余金」の前期繰越高を
// 実データに揃えるところまでがこのページの対象（残りは今後の拡張課題）。

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

  const { data: bsData, isSampleData: isSampleBalanceSheetData } = useBalanceSheetData({
    start: transactions[0]?.date ?? "-",
    end: transactions[transactions.length - 1]?.date ?? "-",
  });

  const capitalStock = bsData?.capitalStock ?? SAMPLE_CAPITAL_STOCK;
  const openingCash = bsData?.openingCash ?? SAMPLE_OPENING_CASH;
  // company_opening_balances.retained_earnings が取得できた場合はそのまま使用する。
  // 未投入（サンプル値）の場合のみ、balanceSheetForm.ts等と同じ後方互換の単純化
  // （期首は資産＝現金のみ・負債ゼロ）で openingCash - capitalStock から逆算する。
  const openingRetainedEarnings = bsData?.openingRetainedEarnings ?? openingCash - capitalStock;

  const tb = buildTrialBalance(transactions, {
    openingBalances: {
      [DEFAULT_CASH_ACCOUNT]: { debit: openingCash },
      資本金: { credit: capitalStock },
      繰越利益剰余金: { credit: openingRetainedEarnings },
    },
  });

  return (
    <>
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl -mt-6">
        {isSampleData
          ? `${SAMPLE_ENTITY_NAME}を想定したサンプルデータで当期の取引を表示しています（前期繰越高もサンプル値）。`
          : isSampleBalanceSheetData
            ? "記帳された実データ（当期の取引）を表示しています（期首残高が未投入のため、前期繰越高は現時点ではサンプル値のままです）。"
            : "記帳された実データ（当期の取引・前期繰越高とも）を表示しています。"}
      </p>
      <TrialBalanceTable tb={tb} />
    </>
  );
}
