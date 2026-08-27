"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  QUOTE_STATUS_LABELS,
  QUOTE_TAX_RATE_LABELS,
  Quote,
  QuoteLineItemInput,
  QuoteStatus,
  buildQuote,
  convertQuoteToClientInvoiceInput,
  formatQuoteNumber,
  isQuoteAcceptedForConversion,
  markQuoteAsConvertedToInvoice,
  resolveQuoteEffectiveStatus,
} from "@/lib/quote/quote";
import { ClientInvoice, ClientInvoiceInput, buildClientInvoice, formatInvoiceNumber } from "@/lib/invoice/clientInvoice";
import { InvoiceNumberBadge } from "@/components/InvoiceNumberBadge";
import { QuotePrintLayout } from "@/components/QuotePrintLayout";
import { DocumentPreviewFrame } from "@/components/ui/DocumentPreviewFrame";

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
  taxRate: QuoteLineItemInput["taxRate"];
}

function emptyLineItem(): DraftLineItem {
  return { id: makeId(), description: "", quantity: "1", unitPrice: "", taxRate: 10 };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QuoteForm() {
  const [issuerName, setIssuerName] = useState("");
  const [issuerRegistrationNumber, setIssuerRegistrationNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO);
  const [validityPeriodDays, setValidityPeriodDays] = useState(String(DEFAULT_QUOTE_VALIDITY_DAYS));
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);

  const [savedQuotes, setSavedQuotes] = useState<Quote[]>([]);
  // 発行済み件数（savedQuotes.length）からの採番だと、途中の見積書を削除した後に新規作成した際
  // 番号が衝突しうる（clientInvoice.tsのnextInvoiceSequenceと同じ理由）。単調増加のカウンタを別に持つ。
  const [nextQuoteSequence, setNextQuoteSequence] = useState(1);
  // 印刷/PDF保存プレビュー中の見積書。nullの場合は通常のフォーム画面を表示する。
  const [printingQuote, setPrintingQuote] = useState<Quote | null>(null);
  // 「この見積書から請求書を作成」を押した結果の下書き（見積書番号→変換結果のマップ）。
  const [invoiceDraftsByQuoteNumber, setInvoiceDraftsByQuoteNumber] = useState<Record<string, ClientInvoice>>({});

  const parsedLineItems: QuoteLineItemInput[] = useMemo(
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
      buildQuote({
        quoteNumber: formatQuoteNumber(issueDate || todayISO(), nextQuoteSequence),
        issuerName,
        issuerRegistrationNumber: issuerRegistrationNumber || null,
        issueDate,
        validityPeriodDays: Number(validityPeriodDays),
        clientName,
        lineItems: parsedLineItems,
        note: note || null,
      }),
    [issueDate, issuerName, issuerRegistrationNumber, validityPeriodDays, clientName, note, parsedLineItems, nextQuoteSequence]
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
    setSavedQuotes((prev) => [...prev, result.quote]);
    setNextQuoteSequence((n) => n + 1);
  }

  function removeSavedQuote(quoteNumber: string) {
    setSavedQuotes((prev) => prev.filter((q) => q.quoteNumber !== quoteNumber));
    setInvoiceDraftsByQuoteNumber((prev) => {
      const next = { ...prev };
      delete next[quoteNumber];
      return next;
    });
  }

  function updateSavedQuoteStatus(quoteNumber: string, status: QuoteStatus) {
    setSavedQuotes((prev) => prev.map((q) => (q.quoteNumber === quoteNumber ? { ...q, status } : q)));
  }

  /**
   * 承認済み（accepted）の見積書から、clientInvoice.tsのbuildClientInvoiceにそのまま渡せる
   * ClientInvoiceInputを組み立て、その場でプレビュー計算する。
   *
   * この画面（QuoteForm）は請求書フォーム（ClientInvoiceForm）と同じく、ブラウザ表示中のみ
   * 有効な一時データしか扱わない設計のため、ここでは「請求書一覧ページへ実際に保存する」ことは
   * せず、変換結果をこの場でプレビュー表示するにとどめる。正式な請求書としての発行は、
   * 利用者自身が/invoicesページのフォームに同じ内容を入力して行う（同じ明細行の型
   * ClientInvoiceLineItemInputに変換しているため、そのままコピーできる）。
   */
  function handleConvertToInvoice(quote: Quote) {
    const invoiceInput: ClientInvoiceInput = convertQuoteToClientInvoiceInput(quote, {
      invoiceIssueDate: todayISO(),
      invoiceNumber: formatInvoiceNumber(todayISO(), 1),
    });
    const invoiceResult = buildClientInvoice(invoiceInput);
    setInvoiceDraftsByQuoteNumber((prev) => ({ ...prev, [quote.quoteNumber]: invoiceResult.invoice }));
    setSavedQuotes((prev) =>
      prev.map((q) => (q.quoteNumber === quote.quoteNumber ? markQuoteAsConvertedToInvoice(q) : q))
    );
  }

  if (printingQuote) {
    return (
      <DocumentPreviewFrame maxWidth="3xl">
        <QuotePrintLayout quote={printingQuote} onClose={() => setPrintingQuote(null)} />
      </DocumentPreviewFrame>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 bg-stone-50 border border-stone-200 rounded p-4">
        <section>
          <h2 className="text-lg font-semibold mb-3">発行者情報（あなた）</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="quote-issuer-name">
                氏名・屋号・法人名
              </label>
              <input
                id="quote-issuer-name"
                type="text"
                value={issuerName}
                onChange={(e) => setIssuerName(e.target.value)}
                placeholder="例：山田太郎（屋号：やまだ設計事務所）"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="quote-issuer-registration-number">
                適格請求書発行事業者登録番号（任意）
                <InvoiceNumberBadge registrationNumber={issuerRegistrationNumber} className="ml-2 align-middle" />
              </label>
              <input
                id="quote-issuer-registration-number"
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
          <h2 className="text-lg font-semibold mb-3">見積先・発行日・有効期限</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass} htmlFor="quote-client-name">
                見積先（取引先）名称
              </label>
              <input
                id="quote-client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="例：株式会社サンプル"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="quote-issue-date">
                見積書発行日
              </label>
              <input
                id="quote-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="quote-validity-period-days">
                有効期限（発行日からの日数）
              </label>
              <input
                id="quote-validity-period-days"
                type="number"
                step="1"
                min="1"
                value={validityPeriodDays}
                onChange={(e) => setValidityPeriodDays(e.target.value)}
                placeholder={String(DEFAULT_QUOTE_VALIDITY_DAYS)}
                className={inputClass}
              />
              {result.quote.validUntil && (
                <p className="mt-1 text-xs text-stone-500">有効期限日: {result.quote.validUntil}</p>
              )}
            </div>
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
                  <label className={labelClass} htmlFor={`quote-line-description-${item.id}`}>
                    品目・内容 {index + 1}
                  </label>
                  <input
                    id={`quote-line-description-${item.id}`}
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                    placeholder="例：デザイン制作費"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`quote-line-quantity-${item.id}`}>
                    数量
                  </label>
                  <input
                    id={`quote-line-quantity-${item.id}`}
                    type="number"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(item.id, { quantity: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`quote-line-unit-price-${item.id}`}>
                    単価（税抜・円）
                  </label>
                  <input
                    id={`quote-line-unit-price-${item.id}`}
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
                  <label className={labelClass} htmlFor={`quote-line-tax-rate-${item.id}`}>
                    税率
                  </label>
                  <select
                    id={`quote-line-tax-rate-${item.id}`}
                    value={item.taxRate}
                    onChange={(e) =>
                      updateLineItem(item.id, { taxRate: Number(e.target.value) as DraftLineItem["taxRate"] })
                    }
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

        <section>
          <label className={labelClass} htmlFor="quote-note">
            備考（納期・支払条件など、任意）
          </label>
          <textarea
            id="quote-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="例：本見積の有効期限内にご発注いただいた場合、記載の単価で確定します。"
          />
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

        <QuotePreview quote={result.quote} />

        <div>
          <button
            type="submit"
            disabled={!result.isValid}
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:hover:bg-stone-900"
          >
            この内容で見積書を作成
          </button>
        </div>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          作成済みの見積書
          {savedQuotes.length > 0 && <span className="text-sm font-normal text-stone-500">（{savedQuotes.length}件）</span>}
        </h2>
        {savedQuotes.length === 0 ? (
          <p className="text-sm text-stone-500 border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
            まだ見積書がありません。上のフォームで内容を入力し「この内容で見積書を作成」を押してください。
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {savedQuotes.map((quote) => {
              const effectiveStatus = resolveQuoteEffectiveStatus(quote, todayISO());
              const canConvert = isQuoteAcceptedForConversion(quote, todayISO());
              const invoiceDraft = invoiceDraftsByQuoteNumber[quote.quoteNumber];
              return (
                <div key={quote.quoteNumber} className="border border-stone-300 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium">
                        {quote.quoteNumber} — {quote.clientName || "（見積先未入力）"} 様
                      </p>
                      <p className="text-xs text-stone-500">
                        発行日 {quote.issueDate} ／ 有効期限 {quote.validUntil ?? "未設定"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-stone-600">
                        ステータス
                        <select
                          value={quote.status}
                          onChange={(e) => updateSavedQuoteStatus(quote.quoteNumber, e.target.value as QuoteStatus)}
                          disabled={quote.status === "converted_to_invoice"}
                          className="border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-stone-600 disabled:opacity-50"
                        >
                          {(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {QUOTE_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setPrintingQuote(quote)}
                        className="text-xs text-stone-600 hover:text-stone-900"
                      >
                        印刷 / PDFで保存
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSavedQuote(quote.quoteNumber)}
                        className="text-xs text-red-700 hover:text-red-900"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  {effectiveStatus === "expired" && quote.status !== "expired" && (
                    <p className="mb-3 text-xs text-amber-700">
                      有効期限（{quote.validUntil}）を過ぎています。表示上は「{QUOTE_STATUS_LABELS.expired}」として扱われます。
                    </p>
                  )}

                  <QuotePreview quote={quote} compact />

                  <div className="mt-4 border-t border-stone-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleConvertToInvoice(quote)}
                      disabled={!canConvert}
                      className="text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:hover:bg-stone-900"
                      title={canConvert ? undefined : "先方の承認済み（ステータス「承認済み」）にすると作成できます"}
                    >
                      この見積書から請求書を作成
                    </button>
                    {!canConvert && (
                      <span className="ml-3 text-xs text-stone-400">
                        ステータスを「{QUOTE_STATUS_LABELS.accepted}」にすると作成できます
                      </span>
                    )}

                    {invoiceDraft && (
                      <div className="mt-4 border border-stone-200 bg-stone-50 p-3">
                        <p className="mb-2 text-xs text-stone-600">
                          この見積書の明細から請求書の下書きを作成しました（下記はプレビューです）。
                          正式に発行するには、
                          <Link href="/invoices" className="underline hover:no-underline">
                            請求書ページ
                          </Link>
                          で同じ内容を入力してください（画面間の自動連携・自動保存は未対応です）。
                        </p>
                        <p className="text-xs text-stone-500 mb-2">請求書番号（下書き）: {invoiceDraft.invoiceNumber}</p>
                        <div className="bg-white p-3">
                          <table className="w-full text-xs">
                            <tbody>
                              <tr>
                                <td className="pr-6 py-0.5 text-stone-500">請求先</td>
                                <td className="py-0.5 text-right">{invoiceDraft.clientName}</td>
                              </tr>
                              <tr>
                                <td className="pr-6 py-0.5 text-stone-500">請求金額合計（税込）</td>
                                <td className="py-0.5 text-right tabular-nums font-semibold">
                                  {yen.format(invoiceDraft.grandTotal)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400 leading-relaxed">
          この画面での保存はブラウザの表示中のみ有効な一時保存です（再読み込みで消えます）。データベースへの永続保存や、
          メール送信機能は現時点では未対応です。印刷／PDF保存は各見積書の「印刷 / PDFで保存」ボタンからご利用いただけます。
        </p>
      </section>
    </div>
  );
}

function QuotePreview({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  return (
    <div className={compact ? "" : "border border-stone-300 bg-white p-4"}>
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <p className="text-xs text-stone-500">見積書番号</p>
            <p className="font-medium tabular-nums">{quote.quoteNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">有効期限: {quote.validUntil ?? "未設定"}</p>
          </div>
        </div>
      )}

      {quote.lineItems.length === 0 ? (
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
              {quote.lineItems.map((item, index) => (
                <tr key={index} className="border-b border-stone-100 last:border-0">
                  <td className="px-2 py-1.5">{item.description || "（未入力）"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.quantity || 0}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{yen.format(item.unitPrice || 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {QUOTE_TAX_RATE_LABELS[item.taxRate]}
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
            {quote.taxRateSubtotals.map((s) => (
              <tr key={s.taxRate}>
                <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap">{QUOTE_TAX_RATE_LABELS[s.taxRate]} 対象額</td>
                <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxableBase)}</td>
              </tr>
            ))}
            {quote.taxRateSubtotals.map((s) => (
              <tr key={`tax-${s.taxRate}`}>
                <td className="pr-6 py-0.5 text-stone-500 whitespace-nowrap">{QUOTE_TAX_RATE_LABELS[s.taxRate]} 消費税額</td>
                <td className="py-0.5 text-right tabular-nums">{yen.format(s.taxAmount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-800 font-semibold">
              <td className="pr-6 py-1.5 whitespace-nowrap">御見積金額合計（税込）</td>
              <td className="py-1.5 text-right tabular-nums">{yen.format(quote.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
