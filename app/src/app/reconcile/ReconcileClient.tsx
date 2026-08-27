"use client";

import { CategorizedTransaction } from "@/lib/categorize/engine";
import { BankReconciliationPanel } from "@/components/BankReconciliationPanel";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";

// このページ専用のサンプルデータ。実データ（journal_entries）が取得できない間、
// または未ログイン・Supabase未設定の場合のフォールバック表示に使う。
// export/page.tsxのSAMPLE_ENTRIESと同様、「今ごえん合同会社」を想定した小規模法人の
// サンプル明細（金額はダミー）を使う。
//
// 意図的に「取込漏れ」を再現できるデータにしている: 期首残高100万円に対して
// 下記の取引合計は+78万円（550,000-32,000-8,800-12,400+283,200）なので、あるべき期末残高は178万円。
// 実際の期末残高として190万円のように大きい値を入力すると「取込漏れの可能性」のヒントが、
// 178万円ちょうど（またはその近辺）を入力すると「一致」の結果が確認できる。
const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-1",
    date: "2026-06-05",
    description: "コンサルティングフィー入金（A社）",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-2",
    date: "2026-06-10",
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
    date: "2026-06-18",
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
    date: "2026-06-22",
    description: "会計ソフト・クラウドサービス利用料",
    amount: -12_400,
    account: "支払手数料(ソフトウェア利用料)",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-5",
    date: "2026-06-28",
    description: "資産管理コンサルティングフィー入金（B社）",
    amount: 283_200,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

const SAMPLE_OPENING_BALANCE = "1000000";

export function ReconcileClient() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_TRANSACTIONS);

  return (
    <>
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl -mt-6">
        {isSampleData
          ? "本ページは開発中のプロトタイプであり、サンプルデータを使用しています。"
          : "記帳された実データ（当期の取引）を表示しています。ここでの「取引」は、収益・費用の相手勘定として現金・預金勘定を使う仕訳のみを想定しています。固定資産の減価償却など現金を伴わない仕訳が含まれる場合、この突合結果はそのまま使えません。"}
        {" "}期首残高はご自身で入力してください。
      </p>
      <BankReconciliationPanel
        transactions={transactions}
        initialOpeningBalance={isSampleData ? SAMPLE_OPENING_BALANCE : ""}
      />
    </>
  );
}
