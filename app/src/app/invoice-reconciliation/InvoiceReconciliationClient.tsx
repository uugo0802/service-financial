"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";
import { InvoicePaymentMatchPanel } from "@/components/InvoicePaymentMatchPanel";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listInvoices } from "@/lib/db/invoices";

// このページ専用のサンプルデータ。invoices テーブル（lib/db/invoices.ts）への接続後は、
// テナント未解決（未ログイン・Supabase未設定）時のフォールバック表示として引き続き使う。
// 意図的に、高信頼度（金額のみで一意）・中信頼度（同額のため摘要の名寄せで絞込）・
// 部分入金・まとめ入金・未消込のパターンをそれぞれ1件以上含めている。
const SAMPLE_INVOICES: ReceivableInvoiceInput[] = [
  {
    invoiceNumber: "INV-20260601-0001",
    clientName: "A商事株式会社",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    grandTotal: 330000,
  },
  {
    invoiceNumber: "INV-20260605-0002",
    clientName: "B工業株式会社",
    issueDate: "2026-06-05",
    dueDate: "2026-07-05",
    grandTotal: 220000,
  },
  {
    invoiceNumber: "INV-20260608-0003",
    clientName: "Cデザイン合同会社",
    issueDate: "2026-06-08",
    dueDate: "2026-07-08",
    grandTotal: 220000,
  },
  {
    invoiceNumber: "INV-20260610-0004",
    clientName: "D商店",
    issueDate: "2026-06-10",
    dueDate: "2026-07-10",
    grandTotal: 500000,
  },
  {
    invoiceNumber: "INV-20260612-0005",
    clientName: "E物産株式会社",
    issueDate: "2026-06-12",
    dueDate: "2026-07-12",
    grandTotal: 150000,
  },
  {
    invoiceNumber: "INV-20260613-0006",
    clientName: "E物産株式会社",
    issueDate: "2026-06-13",
    dueDate: "2026-07-13",
    grandTotal: 250000,
  },
  {
    invoiceNumber: "INV-20260615-0007",
    clientName: "F運輸株式会社",
    issueDate: "2026-06-15",
    dueDate: "2026-07-15",
    grandTotal: 88000,
  },
];

// SAMPLE_INVOICESとは異なり、こちらは対応するDBテーブル（journal_entries）が既に実装済みのため、
// useLedgerTransactions経由で実データに接続する（reconcile/trial-balance等と同じパターン）。
// 実データ取得前・未ログイン・Supabase未設定時のフォールバック表示として引き続き利用する。
const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-tx-1",
    date: "2026-06-20",
    description: "フリコミ）エイシヨウジ",
    amount: 330000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-tx-2",
    date: "2026-06-22",
    description: "デザイン制作費入金（Cデザイン合同会社分）",
    amount: 220000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-3",
    date: "2026-06-24",
    description: "入金 D商店",
    amount: 300000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-4",
    date: "2026-06-26",
    description: "フリコミ）エイブツサン",
    amount: 400000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
  {
    id: "sample-tx-5",
    date: "2026-06-28",
    description: "身に覚えのない入金",
    amount: 77000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 0.4,
    source: "uncategorized",
  },
];

export function InvoiceReconciliationClient() {
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_TRANSACTIONS);
  const [invoices, setInvoices] = useState<ReceivableInvoiceInput[]>(SAMPLE_INVOICES);
  const [isSampleInvoices, setIsSampleInvoices] = useState(true);

  // 請求書一覧（invoices テーブル。lib/db/invoices.ts）はここで実データに接続する。
  useEffect(() => {
    let cancelled = false;
    // login/page.tsx・settings/security/page.tsx と同様、getSupabaseClient() の
    // 同期的な例外をエフェクト本体で直接投げさせないよう、マイクロタスク経由で呼び出す。
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (!tenantUser || cancelled) return; // 未ログイン・未所属の場合はサンプルのまま
        const records = await listInvoices(tenantUser.tenant_id);
        if (!cancelled) {
          setInvoices(records);
          setIsSampleInvoices(false);
        }
      } catch {
        // Supabaseが未設定（開発中のプロトタイプ）。サンプルデータのまま表示する。
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700 dark:text-red-400">／</span> スグル
          </Link>
          <div className="text-xs text-muted-foreground">入金消込（請求書マッチング）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">入金消込（請求書マッチング）</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            発行済みの請求書のうち<b className="font-medium">まだ入金が確認できていないもの</b>
            （<Link href="/reconcile" className="underline hover:no-underline">未収入金・銀行残高突合</Link>
            とは別の、より具体的な単位での確認です）を、取り込んだ銀行の入金取引と自動で突き合わせます。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            入金額が請求書の金額とちょうど一致すれば<b className="font-medium">高信頼度</b>のマッチとして、
            金額が同額の請求書が複数ある場合は振込摘要の請求先名から絞り込んだ<b className="font-medium">中信頼度</b>のマッチとして表示します。
            入金額が請求書の金額を下回る場合は<b className="font-medium">部分入金</b>、
            複数請求書の合計額と一致する場合は<b className="font-medium">まとめ入金の可能性（要確認）</b>として、
            それぞれ誤って「一致」と扱わないよう区別しています。
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {isSampleInvoices
              ? "発行済み請求書のデータは、現時点ではサンプルデータを表示しています（Supabase未接続、または未ログインのため）。"
              : "発行済み請求書のデータは、登録済みの内容（Supabase）を表示しています。"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {isSampleData
              ? "銀行の入金取引データも、現時点ではサンプルデータを表示しています。記帳データが登録されると、自動的に実際のデータへ切り替わります。"
              : "銀行の入金取引データは、記帳された実データ（当期の取引）を表示しています。"}
          </p>
        </section>

        <section>
          {/*
            InvoicePaymentMatchPanelはmatchInvoicePayments()の結果をuseMemo(..., [invoices, transactions])で
            算出しており（BulkReapplyRulesPanelのようにpropsをuseStateの初期値として一度だけ取り込む作りでは
            ない）、invoices/transactionsが変化すれば自動的に再計算される。そのためrule-backfill/page.tsxのような
            isSampleDataをkeyにした強制リマウントは不要と判断した。
          */}
          <InvoicePaymentMatchPanel invoices={invoices} transactions={transactions} />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示されるマッチング候補は入金額・取引摘要に基づく機械的な当たりづけであり、消込の最終確定はご自身、
          または税理士等の専門家にご確認のうえ行ってください。
        </div>
      </footer>
    </div>
  );
}
