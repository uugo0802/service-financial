"use client";

import { useMemo, useState } from "react";
import {
  ClientInvoice,
  ClientInvoiceLineItemInput,
  INVOICE_TAX_RATE_LABELS,
  InvoiceTaxRate,
  buildClientInvoice,
  formatInvoiceNumber,
} from "@/lib/invoice/clientInvoice";
import { InvoiceNumberBadge } from "@/components/InvoiceNumberBadge";
import { InvoicePrintLayout } from "@/components/InvoicePrintLayout";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface DraftLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: InvoiceTaxRate;
}

function emptyLineItem(): DraftLineItem {
  return { id: makeId(), description: "", quantity: "1", unitPrice: "", taxRate: 10 };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ClientInvoiceForm() {
  const [issuerName, setIssuerName] = useState("");
  const [issuerRegistrationNumber, setIssuerRegistrationNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO);
  const [transactionDate, setTransactionDate] = useState(todayISO);
  const [usePeriod, setUsePeriod] = useState(false);
  const [transactionPeriodStart, setTransactionPeriodStart] = useState("");
  const [transactionPeriodEnd, setTransactionPeriodEnd] = useState("");
  const [clientName, setClientName] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);

  const [savedInvoices, setSavedInvoices] = useState<ClientInvoice[]>([]);
  // 発行済み件数（savedInvoices.length）から採番すると、途中の請求書を削除した後に
  // 新規作成した際、残っている請求書と同じ番号が再び採番されてしまう
  // （番号はReactのkeyにも使っているため、削除対象の取り違えにもつながる）。
  // 削除しても採番済みの数字を再利用しないよう、単調増加のカウンタを別に持つ。
  const [nextInvoiceSequence, setNextInvoiceSequence] = useState(1);
  // 印刷/PDF保存プレビュー中の請求書。nullの場合は通常のフォーム画面を表示する。
  const [printingInvoice, setPrintingInvoice] = useState<ClientInvoice | null>(null);

  const parsedLineItems: ClientInvoiceLineItemInput[] = useMemo(
    () =>
      lineItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: item.taxRate,
      })),
    [lineItems]
  );

  const result = useMemo(
    () =>
      buildClientInvoice({
        invoiceNumber: formatInvoiceNumber(issueDate || todayISO(), nextInvoiceSequence),
        issuerName,
        issuerRegistrationNumber: issuerRegistrationNumber || null,
        issueDate,
        transactionDate: usePeriod ? null : transactionDate,
        transactionPeriodStart: usePeriod ? transactionPeriodStart : null,
        transactionPeriodEnd: usePeriod ? transactionPeriodEnd : null,
        clientName,
        lineItems: parsedLineItems,
      }),
    [
      issueDate,
      issuerName,
      issuerRegistrationNumber,
      transactionDate,
      usePeriod,
      transactionPeriodStart,
      transactionPeriodEnd,
      clientName,
      parsedLineItems,
      nextInvoiceSequence,
    ]
  );

  function updateLineItem(id: string, patch: Partial<DraftLineItem>) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!result.isValid) return;
    setSavedInvoices((prev) => [...prev, result.invoice]);
    setNextInvoiceSequence((n) => n + 1);
  }

  function removeSavedInvoice(invoiceNumber: string) {
    setSavedInvoices((prev) => prev.filter((inv) => inv.invoiceNumber !== invoiceNumber));
  }

  if (printingInvoice) {
    return <InvoicePrintLayout invoice={printingInvoice} onClose={() => setPrintingInvoice(null)} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 bg-stone-50 border border-stone-200 rounded p-4">
        <section>
          <h2 className="text-lg font-semibold mb-3">発行者情報（あなた）</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>氏名・屋号・法人名</label>
              <input
                type="text"
                value={issuerName}
                onChange={(e) => setIssuerName(e.target.value)}
                placeholder="例：山田太郎（屋号：やまだ設計事務所）"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                適格請求書発行事業者登録番号（任意）
                <InvoiceNumberBadge registrationNumber={issuerRegistrationNumber} className="ml-2 align-middle" />
              </label>
              <input
                type="text"
                value={issuerRegistrationNumber}
                onChange={(e) => setIssuerRegistrationNumber(e.target.value)}
                placeholder="例：T1234567890123"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">請求先・取引日</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>請求先（取引先）名称</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="例：株式会社サンプル"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>請求書発行日</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={usePeriod} onChange={(e) => setUsePeriod(e.target.checked)} />
            単発の取引日ではなく、取引期間（まとめ請求）で入力する
          </label>

          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            {usePeriod ? (
              <>
                <div>
                  <label className={labelClass}>取引期間 開始日</label>
                  <input
                    type="date"
                    value={transactionPeriodStart}
                    onChange={(e) => setTransactionPeriodStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>取引期間 終了日</label>
                  <input
                    type="date"
                    value={transactionPeriodEnd}
                    onChange={(e) => setTransactionPeriodEnd(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClass}>取引年月日</label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">明細</h2>
          <div className="flex flex-col gap-3">
            {lineItems.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_8rem_8rem_auto] gap-2 items-end border border-stone-200 bg-white p-3"
              >
                <div>
                  <label className={labelClass}>品目・内容 {index + 1}</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                    placeholder="例：デザイン制作費"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>数量</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(item.id, { quantity: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>単価（税抜・円）</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updateLineItem(item.id, { unitPrice: e.target.value })}
                    placeholder="例：50000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>税率</label>
                  <select
                    value={item.taxRate}
                    onChange={(e) => updateLineItem(item.id, { taxRate: Number(e.target.value) as InvoiceTaxRate })}
                    className={inputClass}
                  >
                    <option value={10}>10%</option>
                    <option value={8}>8%（軽減）</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length <= 1}
                    className="text-xs text-stone-400 hover:text-red-700 disabled:opacity-30 disabled:hover:text-stone-400 px-2 py-2.5"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="mt-3 text-sm px-4 py-2 border border-stone-400 bg-white hover:border-red-700 transition-colors"
          >
            ＋ 明細行を追加
          </button>
        </section>

        {result.errors.length > 0 && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium mb-1">入力内容をご確認ください</p>
            <ul className="list-disc list-inside space-y-0.5">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {result.warnings.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">ご確認ください（発行はブロックしません）</p>
            <ul className="list-disc list-inside space-y-0.5">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <ClientInvoicePreview invoice={result.invoice} />

        <div>
          <button
            type="submit"
            disabled={!result.isValid}
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:hover:bg-stone-900"
          >
            この内容で請求書を作成
          </button>
        </div>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          作成済みの請求書
          {savedInvoices.length > 0 && (
            <span className="text-sm font-normal text-stone-500">（{savedInvoices.length}件）</span>
          )}
        </h2>
        {savedInvoices.length === 0 ? (
          <p className="text-sm text-stone-500 border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
            まだ請求書がありません。上のフォームで内容を入力し「この内容で請求書を作成」を押してください。
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {savedInvoices.map((invoice) => (
              <div key={invoice.invoiceNumber} className="border border-stone-300 bg-white p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-medium">
                      {invoice.invoiceNumber} — {invoice.clientName || "（請求先未入力）"} 様
                    </p>
                    <p className="text-xs text-stone-500">発行日 {invoice.issueDate}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPrintingInvoice(invoice)}
                      className="text-xs text-stone-600 hover:text-stone-900"
                    >
                      印刷 / PDFで保存
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedInvoice(invoice.invoiceNumber)}
                      className="text-xs text-red-700 hover:text-red-900"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <ClientInvoicePreview invoice={invoice} compact />
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400 leading-relaxed">
          この画面での保存はブラウザの表示中のみ有効な一時保存です（再読み込みで消えます）。データベースへの永続保存や、
          メール送信機能は現時点では未対応です。印刷／PDF保存は各請求書の「印刷 / PDFで保存」ボタンからご利用いただけます。
        </p>
      </section>
    </div>
  );
}

function ClientInvoicePreview({ invoice, compact = false }: { invoice: ClientInvoice; compact?: boolean }) {
  return (
    <div className={compact ? "" : "border border-stone-300 bg-white p-4"}>
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <p className="text-xs text-stone-500">請求書番号</p>
            <p className="font-medium tabular-nums">{invoice.invoiceNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">
              {invoice.isQualifiedInvoice ? "適格請求書の記載事項を満たしています" : "区分記載請求書相当（登録番号なし/未確認）"}
            </p>
          </div>
        </div>
      )}

      {invoice.lineItems.length === 0 ? (
        <p className="text-sm text-stone-500">明細が未入力です。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                <th className="px-2 py-1.5 font-normal">品目・内容</th>
                <th className="px-2 py-1.5 font-normal text-right">数量</th>
                <th className="px-2 py-1.5 font-normal text-right whitespace-nowrap">単価（税抜）</th>
                <th className="px-2 py-1.5 font-normal text-right">税率</th>
                <th className="px-2 py-1.5 font-normal text-right whitespace-nowrap">金額（税抜）</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, index) => (
                <tr key={index} className="border-b border-stone-100 last:border-0">
                  <td className="px-2 py-1.5">{item.description || "（未入力）"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.quantity || 0}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{yen.format(item.unitPrice || 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {INVOICE_TAX_RATE_LABELS[item.taxRate]}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{yen.format(item.lineAmountExcludingTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-6">
        <table className="text-sm w-full sm:w-auto">
          <tbody>
            {invoice.taxRateSubtotals.map((s) => (
              <tr key={s.taxRate}>
                <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap">
                  {INVOICE_TAX_RATE_LABELS[s.taxRate]} 対象額
                </td>
                <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxableBase)}</td>
              </tr>
            ))}
            {invoice.taxRateSubtotals.map((s) => (
              <tr key={`tax-${s.taxRate}`}>
                <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap">
                  {INVOICE_TAX_RATE_LABELS[s.taxRate]} 消費税額
                </td>
                <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxAmount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-800 font-semibold">
              <td className="pr-6 py-1.5 whitespace-nowrap">合計請求金額（税込）</td>
              <td className="py-1.5 text-right tabular-nums">{yen.format(invoice.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
