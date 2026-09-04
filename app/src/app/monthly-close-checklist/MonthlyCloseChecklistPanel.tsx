"use client";

import { useEffect, useMemo, useState } from "react";
import { CategorizedTransaction, needsEscalation } from "@/lib/categorize/engine";
import { reconcileBankBalance } from "@/lib/reconcile/bankReconciliation";
import { matchInvoicePayments } from "@/lib/reconcile/invoicePaymentMatching";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listInvoices } from "@/lib/db/invoices";
import {
  buildMonthlyCloseChecklist,
  MonthlyCloseChecklistItemStatus,
} from "@/lib/journal/monthlyCloseChecklist";

// 取引データ（SAMPLE_TRANSACTIONS）は実データ（journal_entries）が取得できない間・
// 未ログイン・Supabase未設定の場合のフォールバック表示に使う
// （reconcile/trial-balance等と同じuseLedgerTransactionsフック経由）。
// 意図的に、うち2件を低信頼度（要確認）の分類にして「未確定の仕訳」が残っている状態を
// 再現できるようにしている。
// 請求書データ（SAMPLE_INVOICES、下記）は、invoices テーブル（lib/db/invoices.ts）接続後は
// テナント未解決（未ログイン・Supabase未設定）時のフォールバック表示として使う。
// （未入金・端数入金を混在させて「入金消込」の要確認状態を再現できるようにしている）。
const TARGET_MONTH = "2026-07";

const SAMPLE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "tx-1",
    date: "2026-07-05",
    description: "コンサルティングフィー入金（ながしま商店）",
    amount: 330_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-2",
    date: "2026-07-08",
    description: "コワーキングスペース利用料",
    amount: -32_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-3",
    date: "2026-07-15",
    description: "謎の振込 サガワ",
    amount: -6_400,
    account: "雑費",
    taxCategory: "要確認",
    confidence: 0.4,
    source: "ai",
    note: "摘要から用途が特定できず、勘定科目が仮置きの状態",
  },
  {
    id: "tx-4",
    date: "2026-07-20",
    description: "オンラインセミナー参加費（用途不明瞭）",
    amount: -18_000,
    account: "研修費",
    taxCategory: "要確認",
    confidence: 0.55,
    source: "ai",
  },
  {
    id: "tx-5",
    date: "2026-07-27",
    description: "資産管理コンサルティングフィー入金（今ごえん合同会社）",
    amount: 220_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

const SAMPLE_INVOICES: ReceivableInvoiceInput[] = [
  {
    invoiceNumber: "INV-2026-014",
    clientName: "ながしま商店",
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    grandTotal: 330_000,
  },
  {
    invoiceNumber: "INV-2026-015",
    clientName: "今ごえん合同会社",
    issueDate: "2026-07-05",
    dueDate: "2026-08-05",
    grandTotal: 220_000,
  },
  {
    invoiceNumber: "INV-2026-016",
    clientName: "サンプル物産",
    issueDate: "2026-07-10",
    dueDate: "2026-08-10",
    grandTotal: 88_000,
  },
];

const SAMPLE_OPENING_BALANCE = "1200000";
const SAMPLE_ACTUAL_CLOSING_BALANCE = "1713600";

const STATUS_LABEL: Record<MonthlyCloseChecklistItemStatus, string> = {
  done: "完了",
  pending: "未実施",
  attention: "要確認",
};

const STATUS_BADGE_CLASS: Record<MonthlyCloseChecklistItemStatus, string> = {
  done: "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "border-stone-400 bg-stone-50 text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300",
  attention: "border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300",
};

const STATUS_ICON: Record<MonthlyCloseChecklistItemStatus, string> = {
  done: "✓",
  pending: "・",
  attention: "！",
};

const inputClass =
  "w-full max-w-xs border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-red-700 dark:focus:border-red-400 tabular-nums";
const labelClass = "block text-xs text-stone-500 dark:text-stone-400 mb-1";

/**
 * 月次決算チェックリストパネル。
 *
 * 銀行残高突合（bankReconciliation.ts）、入金消込（invoicePaymentMatching.ts）、
 * 未確定の仕訳件数（categorize/engine.ts の needsEscalation）は、いずれも本パネルが
 * 実際に計算した結果を使う（＝実際のロジックから状態を導出する）。取引データは
 * useLedgerTransactionsフック経由で記帳済みの実データ（journal_entries）を取得し、
 * 取得できるまで・取得できなかった場合はSAMPLE_TRANSACTIONSにフォールバックする
 * （reconcile/trial-balance等と同じパターン）。請求書データも同様にlib/db/invoices.ts
 * 経由で実データに接続し、取得できるまで・取得できなかった場合はSAMPLE_INVOICESに
 * フォールバックする。
 * 年度確定ロックの状態のみ、本ページ単体のデモ用トグルとして手動で切り替える
 * （closeFiscalYear/reopenFiscalYear の監査ログ連携は行わない、表示用の簡易な状態）。
 *
 * これらの計算済み結果を、月次決算チェックリストの純粋な集計ロジック
 * （monthlyCloseChecklist.ts の buildMonthlyCloseChecklist）に渡してチェックリストを組み立てる。
 */
export function MonthlyCloseChecklistPanel() {
  const [openingBalanceInput, setOpeningBalanceInput] = useState(SAMPLE_OPENING_BALANCE);
  const [actualClosingBalanceInput, setActualClosingBalanceInput] = useState(SAMPLE_ACTUAL_CLOSING_BALANCE);
  const [reconciliationDone, setReconciliationDone] = useState(true);
  const [paymentMatchingDone, setPaymentMatchingDone] = useState(true);
  const [fiscalYearClosed, setFiscalYearClosed] = useState(false);
  const { transactions, isSampleData } = useLedgerTransactions(SAMPLE_TRANSACTIONS);

  // 請求書一覧（invoices テーブル。lib/db/invoices.ts）はここで実データに接続する。
  const [invoices, setInvoices] = useState<ReceivableInvoiceInput[]>(SAMPLE_INVOICES);
  const [isSampleInvoices, setIsSampleInvoices] = useState(true);

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

  const openingBalance = Number(openingBalanceInput);
  const actualClosingBalance = Number(actualClosingBalanceInput);
  const hasValidBalanceInputs =
    openingBalanceInput.trim() !== "" &&
    actualClosingBalanceInput.trim() !== "" &&
    Number.isFinite(openingBalance) &&
    Number.isFinite(actualClosingBalance);

  const pendingCategorizationCount = useMemo(
    () => transactions.filter(needsEscalation).length,
    [transactions],
  );

  const bankReconciliation = useMemo(() => {
    if (!reconciliationDone || !hasValidBalanceInputs) return null;
    return reconcileBankBalance({ transactions, openingBalance, actualClosingBalance });
  }, [reconciliationDone, hasValidBalanceInputs, openingBalance, actualClosingBalance, transactions]);

  const invoicePaymentMatching = useMemo(() => {
    if (!paymentMatchingDone) return null;
    return matchInvoicePayments({ invoices, transactions });
  }, [paymentMatchingDone, invoices, transactions]);

  const checklist = useMemo(
    () =>
      buildMonthlyCloseChecklist({
        targetMonth: TARGET_MONTH,
        bankReconciliation,
        invoicePaymentMatching,
        pendingCategorizationCount,
        fiscalYearLock: { closed: fiscalYearClosed, fiscalYear: Number(TARGET_MONTH.slice(0, 4)) },
      }),
    [bankReconciliation, invoicePaymentMatching, pendingCategorizationCount, fiscalYearClosed],
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded p-4">
        <h3 className="text-sm font-semibold mb-1">
          {TARGET_MONTH.replace("-", "年")}月分・チェック用データ
        </h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
          {isSampleData
            ? "銀行残高突合・未確定の仕訳件数の計算には、現在サンプルの取引データを使用しています。"
            : "銀行残高突合・未確定の仕訳件数の計算には、記帳された実データ（当期の取引）を使用しています。"}
          {isSampleInvoices
            ? "請求書データ（入金消込の照合先）も、現時点ではサンプルデータを使用しています。"
            : "請求書データ（入金消込の照合先）は、登録済みの内容（Supabase）を使用しています。"}
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reconciliationDone}
              onChange={(e) => setReconciliationDone(e.target.checked)}
              className="h-4 w-4"
            />
            銀行残高突合を実施する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={paymentMatchingDone}
              onChange={(e) => setPaymentMatchingDone(e.target.checked)}
              className="h-4 w-4"
            />
            入金消込を実施する
          </label>
        </div>

        {reconciliationDone && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className={labelClass} htmlFor="opening-balance">
                期首残高
              </label>
              <input
                id="opening-balance"
                type="number"
                step="any"
                value={openingBalanceInput}
                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="actual-closing-balance">
                実際の期末残高
              </label>
              <input
                id="actual-closing-balance"
                type="number"
                step="any"
                value={actualClosingBalanceInput}
                onChange={(e) => setActualClosingBalanceInput(e.target.value)}
                className={inputClass}
              />
            </div>
            <p className="sm:col-span-2 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              {isSampleData
                ? (
                  <>
                    サンプル取引の金額合計は+51.36万円です。実際の期末残高を{"「"}
                    {(1_200_000 + 513_600).toLocaleString("ja-JP")}円{"」"}付近にすると一致、
                    大きく外すと差額ありの状態を確認できます。
                  </>
                )
                : "期首残高・実際の期末残高は通帳等の実際の値を入力してください。記帳済みの取引データとの差額を突合します。"}
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setFiscalYearClosed((v) => !v)}
            className="text-xs px-3 py-1.5 border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 hover:border-stone-600 dark:hover:border-stone-400"
          >
            {fiscalYearClosed ? `${TARGET_MONTH.slice(0, 4)}年度のロックを解除する（デモ）` : `${TARGET_MONTH.slice(0, 4)}年度を確定（ロック）する（デモ）`}
          </button>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            現在: {fiscalYearClosed ? "確定済み（ロック中）" : "未確定（オープン）"}
          </span>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">
            {TARGET_MONTH.replace("-", "年")}月 チェックリスト
          </h2>
          <span className="text-sm tabular-nums text-stone-500 dark:text-stone-400">
            {checklist.doneCount} / {checklist.totalCount} 件完了
          </span>
        </div>

        <div
          className="h-2 w-full bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={checklist.completionPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all ${
              checklist.isComplete ? "bg-emerald-600 dark:bg-emerald-500" : "bg-red-600 dark:bg-red-500"
            }`}
            style={{ width: `${checklist.completionPercent}%` }}
          />
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 tabular-nums">
          完了率 {checklist.completionPercent}%
          {checklist.isComplete && <span className="ml-2 text-emerald-700 dark:text-emerald-400">今月分の締め作業は完了しています。</span>}
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {checklist.items.map((item) => (
            <li
              key={item.id}
              className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded p-4 flex flex-col gap-1.5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold border ${STATUS_BADGE_CLASS[item.status]}`}
                  >
                    {STATUS_ICON[item.status]}
                  </span>
                  <span className="text-sm font-semibold">{item.title}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 border rounded-full ${STATUS_BADGE_CLASS[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{item.description}</p>
              {item.detail && (
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{item.detail}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-warning-foreground leading-relaxed">
        本チェックリストは、既存の記帳・請求書データから機械的に導出した状態を一覧化する
        セルフチェック用のツールであり、税理士法に定める税務代理・税務書類の作成・個別の税務相談を
        行うものではありません。各項目の対応要否・記帳内容の最終確認はご自身、または税理士等の
        専門家が行ってください。
      </p>
    </div>
  );
}
