"use client";

import { useState } from "react";
import Link from "next/link";
import { PRICING_PLANS } from "@/lib/pricing/plans";
import { PrintableField } from "@/lib/export/printLayout";
import {
  ChargeRecord,
  ReceiptHistoryEntry,
  RECEIPT_PRINT_NOTICE,
  Subscription,
  buildCurrentSubscriptionView,
  buildReceiptHistory,
  buildReceiptPrintFields,
  detectMostRecentPlanChange,
  summarizeBillingHistory,
} from "@/lib/billing/subscriptionBilling";

// ------------------------------------------------------------------
// 現在のプラン・次回請求日・領収書履歴を表示する画面。
//
// DB未接続の現状に合わせ（settings/page.tsxのSAMPLE_TENANT_PROFILEと同様の方針）、
// 実際の課金基盤の代わりにサンプルのサブスクリプション状態・請求記録を表示する。
// このアプリ自体が決済ゲートウェイ（Stripe等）と連携する機能は持たず、あくまで
// 自社の請求記録ストアに保存済みの記録を表示するだけの画面という位置づけ
// （src/lib/billing/subscriptionBilling.ts のコメント参照）。
//
// 領収書の「印刷 / PDFで保存」は、src/components/InvoicePrintLayout.tsx /
// PrintableStatementLayout.tsx と同じ「window.print()を呼ぶだけ」の方式に揃え、
// 新規PDFライブラリへの依存を増やさない（docs/cto-tech-architecture.md 2章の
// 低ランニングコスト方針に準拠）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const SAMPLE_TENANT_NAME = "今ごえん合同会社";

const SAMPLE_SUBSCRIPTION: Subscription = {
  tenantId: "sample-tenant",
  planId: "micro-corp",
  status: "active",
  currentPeriodStart: "2026-07-01",
  currentPeriodEnd: "2026-07-31",
};

// 6月にフリーランスプランからマイクロ法人プランへアップグレードした例
// （期中アップグレードの日割り請求も履歴に残ることを示すサンプル）。
const SAMPLE_CHARGES: ChargeRecord[] = [
  {
    id: "chg-0001",
    date: "2026-05-01",
    amount: 0,
    planId: "freelance",
    planName: "フリーランスプラン",
    receiptNumber: "R-2026-0001",
  },
  {
    id: "chg-0002",
    date: "2026-06-01",
    amount: 980,
    planId: "freelance",
    planName: "フリーランスプラン",
    receiptNumber: "R-2026-0002",
  },
  {
    id: "chg-0003",
    date: "2026-06-18",
    amount: 1_690,
    planId: "micro-corp",
    planName: "マイクロ法人プラン",
    receiptNumber: "R-2026-0003",
  },
  {
    id: "chg-0004",
    date: "2026-07-01",
    amount: 2_980,
    planId: "micro-corp",
    planName: "マイクロ法人プラン",
    receiptNumber: "R-2026-0004",
  },
];

function ReceiptPrintView({ entry, onClose }: { entry: ReceiptHistoryEntry; onClose: () => void }) {
  const fields = buildReceiptPrintFields(entry, SAMPLE_TENANT_NAME);
  const fieldByKey = Object.fromEntries(fields.map((f: PrintableField) => [f.key, f]));

  return (
    <div className="receipt-print-view">
      <div className="mb-6 flex flex-wrap justify-end gap-3 print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
        >
          履歴一覧へ戻る
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100"
        >
          印刷 / PDFで保存
        </button>
      </div>

      <div className="border border-stone-300 bg-white p-6 sm:p-10 print:border-0 print:mx-auto print:w-[186mm] print:p-0 print:pt-[8mm] print:pb-[18mm]">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-stone-300 pb-4">
          <div>
            <p className="text-2xl font-serif tracking-widest">領収書</p>
            <p className="mt-2 text-sm text-stone-600">{fieldByKey.tenantName?.value} 様</p>
          </div>
          <div className="text-right text-sm text-stone-600">
            {(["receiptNumber", "date"] as const).map((key) => (
              <p key={key}>
                <span className="text-stone-400">{fieldByKey[key]?.label}: </span>
                {fieldByKey[key]?.value}
              </p>
            ))}
          </div>
        </div>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-stone-100">
              <td className="w-40 py-2 text-stone-500">{fieldByKey.planName?.label}</td>
              <td className="py-2">{fieldByKey.planName?.value}</td>
            </tr>
            <tr className="border-t-2 border-stone-800 font-semibold">
              <td className="py-3 text-stone-800">{fieldByKey.amount?.label}</td>
              <td className="py-3 text-right tabular-nums sm:text-left">{fieldByKey.amount?.value}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:border-t print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-center print:text-[7.5pt] print:leading-snug print:text-stone-700">
        {RECEIPT_PRINT_NOTICE}
      </div>
      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-stone-400 print:hidden">{RECEIPT_PRINT_NOTICE}</p>
    </div>
  );
}

export default function BillingSettingsPage() {
  const [printingReceiptId, setPrintingReceiptId] = useState<string | null>(null);

  const subscriptionView = buildCurrentSubscriptionView(SAMPLE_SUBSCRIPTION, PRICING_PLANS);
  const history = buildReceiptHistory(SAMPLE_CHARGES);
  const summary = summarizeBillingHistory(SAMPLE_CHARGES);
  const planChange = detectMostRecentPlanChange(history);
  const printingReceipt = printingReceiptId ? history.find((h) => h.id === printingReceiptId) ?? null : null;

  if (printingReceipt) {
    return (
      <div className="bg-stone-50 text-stone-900 min-h-screen">
        <main className="mx-auto max-w-3xl px-6 py-10">
          <ReceiptPrintView entry={printingReceipt} onClose={() => setPrintingReceiptId(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">プラン・お支払い</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">プラン・お支払い</h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            現在ご契約中のプラン、次回請求日、過去の領収書履歴を確認できます。
          </p>
        </section>

        <section className="border border-stone-300 bg-white p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-stone-800">現在のプラン</h2>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xl font-semibold">{subscriptionView.planName}</p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                subscriptionView.status === "active"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : subscriptionView.status === "trialing"
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : subscriptionView.status === "past_due"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-stone-300 bg-stone-100 text-stone-600"
              }`}
            >
              {subscriptionView.statusLabel}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-600">
            <dt className="text-stone-400">現在の請求期間</dt>
            <dd>
              {subscriptionView.currentPeriodStartLabel} 〜 {subscriptionView.currentPeriodEndLabel}
            </dd>
            <dt className="text-stone-400">次回請求日</dt>
            <dd>{subscriptionView.nextBillingDateLabel}</dd>
          </dl>
          {planChange && (
            <p className="text-xs text-stone-500">
              {planChange.effectiveDate}にプランを変更しました（変更後: {planChange.toPlanId === subscriptionView.planId ? subscriptionView.planName : planChange.toPlanId}）。
            </p>
          )}
          <p className="text-xs text-amber-700 leading-relaxed">
            料金は現時点の試算値であり、今後変更となる可能性があります。プランの詳細・他プランとの比較は
            <Link href="/pricing" className="underline underline-offset-2">
              料金プランページ
            </Link>
            をご覧ください。
          </p>
        </section>

        <section className="border border-stone-300 bg-white p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-stone-800">領収書履歴</h2>
            {summary.hasHistory && (
              <span className="text-xs text-stone-400">
                お支払い合計 {yen.format(summary.totalPaidAmount)}（{summary.chargeCount}件）
              </span>
            )}
          </div>

          {!summary.hasHistory && <p className="text-sm text-stone-500">まだ請求履歴がありません。</p>}

          {summary.hasHistory && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-2 py-1.5 font-normal">発行日</th>
                    <th className="px-2 py-1.5 font-normal">プラン</th>
                    <th className="px-2 py-1.5 font-normal text-right">金額</th>
                    <th className="px-2 py-1.5 font-normal">領収書番号</th>
                    <th className="px-2 py-1.5 font-normal text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-2 py-1.5 whitespace-nowrap">{entry.dateLabel}</td>
                      <td className="px-2 py-1.5">{entry.planName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {entry.isZeroAmount ? `${yen.format(0)}（無料トライアル）` : yen.format(entry.amount)}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-stone-500">{entry.receiptNumber}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setPrintingReceiptId(entry.id)}
                          className="text-xs text-stone-700 underline underline-offset-2 hover:text-stone-900"
                        >
                          印刷 / PDFで保存
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-stone-400">
          この画面は開発中のプロトタイプです。表示されているプラン・請求記録はサンプルデータであり、実際の決済処理・データベースへの保存は行われません。
        </p>

        <Link href="/settings" className="text-xs text-stone-500 underline underline-offset-2 self-start">
          ← 事業者設定に戻る
        </Link>
      </main>
    </div>
  );
}
