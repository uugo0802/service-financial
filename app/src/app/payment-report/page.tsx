"use client";
import { PageContainer } from "@/components/ui/PageContainer";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PaymentReportTransactionInput,
  buildPaymentReportFromTransactions,
} from "@/lib/tax/paymentReportForm";
import { PaymentReportTable } from "@/components/PaymentReportTable";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { PageTitle } from "@/components/ui/PageTitle";

// このページ専用のサンプルデータ。支払調書の動作確認用で、他ページ（general-ledger等）の
// サンプルデータとはあえて切り離している。同一支払先への複数回の支払（合算すると
// 基準額を超えるケース）と、基準額以下のまま終わるケースの両方を含めている。
const SAMPLE_ENTRIES: PaymentReportTransactionInput[] = [
  {
    id: "pr-1",
    date: "2026-02-10",
    description: "顧問料（1月分）",
    amount: -33000,
    account: "支払手数料",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "〇〇税理士事務所",
    paymentReportCategory: "弁護士・税理士等の報酬",
    withholdingTaxAmount: 3369,
  },
  {
    id: "pr-2",
    date: "2026-05-10",
    description: "顧問料（4月分）",
    amount: -33000,
    account: "支払手数料",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "〇〇税理士事務所",
    paymentReportCategory: "弁護士・税理士等の報酬",
    withholdingTaxAmount: 3369,
  },
  {
    id: "pr-3",
    date: "2026-06-20",
    description: "サイトデザイン制作費",
    amount: -120000,
    account: "給料賃金/外注工賃",
    taxCategory: "要確認",
    confidence: 1,
    source: "rule",
    note: "△△デザイン事務所",
    paymentReportCategory: "デザイン料",
    withholdingTaxAmount: 12252,
  },
  {
    id: "pr-4",
    date: "2026-07-01",
    description: "業界誌への寄稿料",
    amount: -45000,
    account: "給料賃金/外注工賃",
    taxCategory: "要確認",
    confidence: 1,
    source: "rule",
    note: "フリー太郎",
    paymentReportCategory: "原稿料・講演料等",
    withholdingTaxAmount: 4592,
  },
  {
    id: "pr-5",
    date: "2026-09-15",
    description: "社内研修 講演料",
    amount: -30000,
    account: "支払手数料",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "フリー太郎",
    paymentReportCategory: "原稿料・講演料等",
    withholdingTaxAmount: 3063,
  },
  {
    id: "pr-6",
    date: "2026-03-05",
    description: "振込手数料",
    amount: -440,
    account: "支払手数料",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "GMOあおぞらネット銀行",
  },
];

const FISCAL_YEARS = [2025, 2026, 2027];

export default function PaymentReportPage() {
  const [fiscalYear, setFiscalYear] = useState<number>(2026);
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_ENTRIES);

  const lines = useMemo(
    () => buildPaymentReportFromTransactions(transactions, { fiscalYear }),
    [transactions, fiscalYear]
  );

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">報酬、料金、契約金及び賞金の支払調書（下書き）</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            弁護士・税理士等の専門家や、原稿執筆・講演・デザイン等を行うフリーランスへ報酬・料金を支払った場合、
            同一の支払先・区分への年間の支払合計額が50,000円を超えると、税務署への「支払調書」の提出（および
            通常は支払先への交付）が必要になることがあります。この画面は、記帳データ（
            <Link href="/general-ledger" className="underline hover:text-foreground">総勘定元帳</Link>
            と同じ取引明細）から、支払先・区分ごとの年間集計と提出要否の目安を機械的に作成する
            <b className="font-medium">下書き</b>作成画面です。
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            対応しているのは、実務上もっとも件数が多い「50,000円超で提出が必要」という一般的な基準のみです。
            馬主が受ける競馬の賞金・ホステス等の報酬など、金額基準や計算方法が異なる区分はこの画面では扱っていません。
            <b className="font-medium">
              このツールが作成するのはあくまで下書きデータであり、正式な法定調書の提出（e-Tax等）はご自身で行う必要があります。
            </b>
            税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。給与・賞与（雇用関係にある
            従業員・役員）の源泉徴収については、こちらは対象外です。年末調整・
            <Link href="/withholding-slip" className="underline hover:text-foreground">
              給与所得の源泉徴収票
            </Link>
            をご利用ください。
          </p>
          <p className="text-xs text-muted-foreground">
            {isSampleData ? "現在はサンプルデータを表示しています。" : "記帳された実データを表示しています。"}
          </p>

          <div className="mt-6 border border-border bg-surface p-5 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground max-w-[12rem]">
              対象年
              <select
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
              >
                {FISCAL_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}年分
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section>
          <PaymentReportTable lines={lines} />
        </section>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される金額は記帳データに基づく参考表示（下書き）です。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
