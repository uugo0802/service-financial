"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { buildGeneralLedger, listLedgerAccounts } from "@/lib/journal/generalLedger";
import { GeneralLedgerTable } from "@/components/GeneralLedgerTable";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。総勘定元帳の動作確認用で、他ページ（transactions/journal等）の
// サンプルデータとはあえて切り離している（本番では記帳済みの仕訳一覧に差し替える）。
// 同一勘定科目・同一日付の仕訳を含めることで、同日内の並び順（入力順を保持）も確認できる。
const SAMPLE_ENTRIES: CategorizedTransaction[] = [
  {
    id: "gl-1",
    date: "2026-04-05",
    description: "A社案件 顧問料入金",
    amount: 300000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "gl-2",
    date: "2026-04-01",
    description: "事務所家賃",
    amount: -150000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "〇〇不動産",
  },
  {
    id: "gl-3",
    date: "2026-04-10",
    description: "事務用品購入",
    amount: -3200,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "Amazon",
  },
  {
    id: "gl-4",
    date: "2026-04-20",
    description: "B社案件 コンサルティング売上",
    amount: 220000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "gl-5",
    date: "2026-05-01",
    description: "事務所家賃",
    amount: -150000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "〇〇不動産",
  },
  {
    id: "gl-6",
    date: "2026-05-12",
    description: "文房具・コピー用紙",
    amount: -1800,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 0.9,
    source: "ai",
    note: "コクヨ",
  },
  {
    id: "gl-7",
    date: "2026-05-12",
    description: "PC周辺機器購入",
    amount: -12000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "gl-8",
    date: "2026-05-25",
    description: "C社案件 開発委託料入金",
    amount: 480000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
];

export default function GeneralLedgerPage() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_ENTRIES);
  const accounts = useMemo(() => listLedgerAccounts(transactions), [transactions]);
  // ユーザーが明示的に選択した勘定科目名を保持する。実データの取得完了後にaccountsの
  // 中身が入れ替わる（サンプル→実データ）ことがあるため、選択中の科目が現在の一覧に
  // 存在しない場合は、レンダリング時にその場で先頭の科目へフォールバックする
  // （setState-in-effectを避けるため、useEffectで同期するのではなく描画時に導出する）。
  const [selectedAccountInput, setSelectedAccountInput] = useState<string>("");
  const selectedAccount = accounts.includes(selectedAccountInput) ? selectedAccountInput : accounts[0] ?? "";
  const [openingBalanceInput, setOpeningBalanceInput] = useState<string>("0");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const openingBalance = Number(openingBalanceInput);
  const validOpeningBalance = Number.isFinite(openingBalance) ? openingBalance : 0;

  const ledger = useMemo(
    () =>
      buildGeneralLedger(transactions, selectedAccount, {
        openingBalance: validOpeningBalance,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [transactions, selectedAccount, validOpeningBalance, dateFrom, dateTo]
  );

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">総勘定元帳</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            勘定科目を選択すると、その科目に関わるすべての仕訳を日付順に一覧表示し、借方・貸方・累計残高（残高）を確認できます。
            <b>これは記帳内容の確認を補助する参考表示であり、正式な決算書類ではありません。</b>
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            {isSampleData ? "現在はサンプルデータを表示しています。" : "記帳された実データを表示しています。"}
          </p>

          <div className="border border-border bg-surface p-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                勘定科目
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccountInput(e.target.value)}
                  className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                >
                  {accounts.length === 0 && <option value="">（仕訳がありません）</option>}
                  {accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                前期繰越（開始残高）
                <input
                  type="number"
                  value={openingBalanceInput}
                  onChange={(e) => setOpeningBalanceInput(e.target.value)}
                  className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                取引年月日（開始）
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                取引年月日（終了）
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>
            </div>
          </div>
        </section>

        <section>
          <GeneralLedgerTable result={ledger} />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される金額は記帳データに基づく参考表示です。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
