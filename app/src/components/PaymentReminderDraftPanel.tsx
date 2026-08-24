"use client";

import { useMemo, useState } from "react";
import { OverdueInvoice } from "@/lib/invoice/receivables";
import {
  PAYMENT_REMINDER_DISCLAIMER,
  PaymentReminderResult,
  REMINDER_TONE_OPTIONS,
  ReminderTone,
  generatePaymentReminderDraft,
} from "@/lib/invoice/paymentReminderDraft";

// ------------------------------------------------------------------
// 期日超過の請求書1件を選び、トーン（やわらかい／強め）を選択して、支払い状況確認・督促
// メールの下書き（件名＋本文）をプレビュー・コピーするためのUI。
//
// 下書き生成のロジック自体は一切ここに書かず、src/lib/invoice/paymentReminderDraft.ts の
// generatePaymentReminderDraft() に完全に委譲する（このコンポーネントは入力の組み立てと表示のみ）。
// 実際のメール送信は行わない（配信基盤がないため）。「コピーする」ボタンでクリップボードに
// コピーし、利用者が自身のメールソフトに貼り付けて送ることを想定している。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const inputClass =
  "w-full border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-stone-600 dark:focus:border-stone-400";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500 dark:text-stone-400";

type InvoiceSource = "list" | "manual";

interface ManualDraft {
  invoiceNumber: string;
  clientName: string;
  dueDate: string;
  daysOverdue: string;
  outstandingAmount: string;
}

function emptyManualDraft(): ManualDraft {
  return { invoiceNumber: "", clientName: "", dueDate: "", daysOverdue: "", outstandingAmount: "" };
}

/** 手入力フォームの値を OverdueInvoice 相当のオブジェクトに変換する（issueDateはdueDateがあればそれで代用）。 */
function manualDraftToOverdueInvoice(draft: ManualDraft): OverdueInvoice {
  return {
    invoiceNumber: draft.invoiceNumber,
    clientName: draft.clientName,
    issueDate: draft.dueDate || "",
    dueDate: draft.dueDate || null,
    daysOverdue: Number(draft.daysOverdue),
    outstandingAmount: Number(draft.outstandingAmount),
  };
}

export interface PaymentReminderDraftPanelProps {
  /**
   * 選択候補となる期日超過の請求書一覧（receivables.ts の computeReceivablesSummary() が
   * 返す overdueInvoices をそのまま渡す想定）。空配列の場合は手入力モードのみ利用できる。
   */
  overdueInvoices: OverdueInvoice[];
}

export function PaymentReminderDraftPanel({ overdueInvoices }: PaymentReminderDraftPanelProps) {
  const [source, setSource] = useState<InvoiceSource>(overdueInvoices.length > 0 ? "list" : "manual");
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(overdueInvoices[0]?.invoiceNumber ?? "");
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft());
  const [tone, setTone] = useState<ReminderTone>("gentle");
  const [senderName, setSenderName] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const selectedInvoice: OverdueInvoice | null = useMemo(() => {
    if (source === "list") {
      return overdueInvoices.find((inv) => inv.invoiceNumber === selectedInvoiceNumber) ?? null;
    }
    if (isBlank(manualDraft.invoiceNumber) && isBlank(manualDraft.clientName) && isBlank(manualDraft.daysOverdue)) {
      return null;
    }
    return manualDraftToOverdueInvoice(manualDraft);
  }, [source, overdueInvoices, selectedInvoiceNumber, manualDraft]);

  const result: PaymentReminderResult | null = useMemo(() => {
    if (!selectedInvoice) return null;
    return generatePaymentReminderDraft(selectedInvoice, tone, senderName ? { senderName } : undefined);
  }, [selectedInvoice, tone, senderName]);

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-lg p-5 flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSource("list")}
            disabled={overdueInvoices.length === 0}
            className={`text-sm px-4 py-2 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              source === "list"
                ? "bg-stone-900 border-stone-900 text-white dark:bg-stone-100 dark:border-stone-100 dark:text-stone-900"
                : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
            }`}
          >
            未収一覧から選ぶ
          </button>
          <button
            type="button"
            onClick={() => setSource("manual")}
            className={`text-sm px-4 py-2 border transition-colors ${
              source === "manual"
                ? "bg-stone-900 border-stone-900 text-white dark:bg-stone-100 dark:border-stone-100 dark:text-stone-900"
                : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
            }`}
          >
            手入力する
          </button>
        </div>

        {source === "list" ? (
          overdueInvoices.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              期日超過の請求書がありません。「手入力する」から直接入力してください。
            </p>
          ) : (
            <label className={labelClass}>
              請求書を選択
              <select
                value={selectedInvoiceNumber}
                onChange={(e) => setSelectedInvoiceNumber(e.target.value)}
                className={inputClass}
              >
                {overdueInvoices.map((inv) => (
                  <option key={inv.invoiceNumber} value={inv.invoiceNumber}>
                    {inv.invoiceNumber}｜{inv.clientName}｜{inv.daysOverdue}日超過｜{yen.format(inv.outstandingAmount)}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              請求書番号
              <input
                type="text"
                value={manualDraft.invoiceNumber}
                onChange={(e) => setManualDraft((d) => ({ ...d, invoiceNumber: e.target.value }))}
                placeholder="INV-20260601-0001"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              請求先名
              <input
                type="text"
                value={manualDraft.clientName}
                onChange={(e) => setManualDraft((d) => ({ ...d, clientName: e.target.value }))}
                placeholder="株式会社サンプル"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              支払期日（任意）
              <input
                type="date"
                value={manualDraft.dueDate}
                onChange={(e) => setManualDraft((d) => ({ ...d, dueDate: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              支払期日からの経過日数
              <input
                type="number"
                value={manualDraft.daysOverdue}
                onChange={(e) => setManualDraft((d) => ({ ...d, daysOverdue: e.target.value }))}
                placeholder="15"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              未収金額（円）
              <input
                type="number"
                value={manualDraft.outstandingAmount}
                onChange={(e) => setManualDraft((d) => ({ ...d, outstandingAmount: e.target.value }))}
                placeholder="220000"
                className={inputClass}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-200 dark:border-stone-800">
          <div className={labelClass}>
            文面のトーン
            <div className="flex gap-2 mt-1">
              {REMINDER_TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTone(opt.value)}
                  title={opt.description}
                  className={`text-sm px-3 py-1.5 border transition-colors ${
                    tone === opt.value
                      ? "bg-red-700 border-red-700 text-white"
                      : "bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-600 dark:hover:border-stone-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className={labelClass}>
            署名（任意・自社名や担当者名）
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="例：合同会社サンプル 山田太郎"
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {!result ? (
        <div className="border border-dashed border-stone-300 dark:border-stone-700 rounded-lg p-6 text-center text-sm text-stone-500 dark:text-stone-400">
          請求書を選択、または入力すると下書きプレビューが表示されます。
        </div>
      ) : !result.ok ? (
        <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-5 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-1">
            {result.reason === "not-overdue" ? "この請求書はまだ督促の対象ではありません" : "入力内容を確認してください"}
          </p>
          <p>{result.message}</p>
        </div>
      ) : (
        <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold">
              下書きプレビュー（{result.draft.toneLabel}）
            </h3>
            <button
              type="button"
              onClick={() => handleCopy(`${result.draft.subject}\n\n${result.draft.body}`)}
              className="rounded-md bg-red-700 px-4 py-2 text-white text-sm font-medium hover:bg-red-800 transition-colors whitespace-nowrap"
            >
              {copyState === "copied" ? "コピーしました" : copyState === "failed" ? "コピー失敗" : "件名＋本文をコピー"}
            </button>
          </div>

          <label className={labelClass}>
            件名
            <input type="text" readOnly value={result.draft.subject} className={`${inputClass} font-mono`} />
          </label>

          <label className={labelClass}>
            本文
            <textarea
              readOnly
              value={result.draft.body}
              rows={14}
              className={`${inputClass} font-mono leading-relaxed resize-y`}
            />
          </label>
        </div>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{PAYMENT_REMINDER_DISCLAIMER}</p>
    </div>
  );
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
