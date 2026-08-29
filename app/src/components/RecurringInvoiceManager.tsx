"use client";

import { useMemo, useState } from "react";
import {
  ClientInvoice,
  INVOICE_TAX_RATE_LABELS,
  InvoiceTaxRate,
  buildClientInvoice,
} from "@/lib/invoice/clientInvoice";
import {
  EMPTY_RECURRING_INVOICE_TEMPLATE_DRAFT,
  RECURRING_INVOICE_INTERVALS,
  RECURRING_INVOICE_INTERVAL_LABELS,
  RecurringInvoiceOccurrence,
  RecurringInvoiceTemplate,
  RecurringInvoiceTemplateDraft,
  addRecurringInvoiceTemplate,
  buildRecurringInvoiceInput,
  buildRecurringInvoiceOccurrenceId,
  computeRecurringInvoiceOccurrencesForTemplates,
  hasRecurringInvoiceTemplateErrors,
  removeRecurringInvoiceTemplate,
  toggleRecurringInvoiceTemplateActive,
  validateRecurringInvoiceTemplateDraft,
} from "@/lib/invoice/recurringInvoice";
import { InvoicePrintLayout } from "@/components/InvoicePrintLayout";
import { DocumentPreviewFrame } from "@/components/ui/DocumentPreviewFrame";

// ------------------------------------------------------------------
// 定期請求書（サブスクリプション/顧問料クライアント向け）テンプレートの管理と、
// 指定期間内に発生する請求書インスタンスのプレビュー・作成を行うUI。
//
// RecurringEntryManager.tsx（定期"仕訳"のテンプレート管理）と対をなす、請求書版のコンポーネント。
// journal/page.tsx 等の既存データとは独立して動作し、このコンポーネント自身の状態のみで完結する
// （ClientInvoiceForm.tsx と同様、ブラウザ表示中のみ有効な一時データを扱う）。
// ------------------------------------------------------------------

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";
const errorTextClass = "mt-1 text-xs text-red-700";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 今日から3か月後（同日）のISO日付。プレビュー期間の初期値に使う */
function threeMonthsFromTodayISO(): string {
  const now = new Date();
  const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate()));
  return future.toISOString().slice(0, 10);
}

interface RecurringInvoiceManagerProps {
  /** 事前登録済みのテンプレート（デモ・初期表示用）。省略時は空の状態から開始する */
  initialTemplates?: RecurringInvoiceTemplate[];
}

export function RecurringInvoiceManager({ initialTemplates = [] }: RecurringInvoiceManagerProps) {
  const [templates, setTemplates] = useState<RecurringInvoiceTemplate[]>(initialTemplates);
  const [draft, setDraft] = useState<RecurringInvoiceTemplateDraft>(EMPTY_RECURRING_INVOICE_TEMPLATE_DRAFT);
  const [errors, setErrors] = useState<ReturnType<typeof validateRecurringInvoiceTemplateDraft>>({});

  const [issuerName, setIssuerName] = useState("");
  const [issuerRegistrationNumber, setIssuerRegistrationNumber] = useState("");

  const [rangeStart, setRangeStart] = useState(todayISO);
  const [rangeEnd, setRangeEnd] = useState(threeMonthsFromTodayISO);

  const [generatedInvoices, setGeneratedInvoices] = useState<ClientInvoice[]>([]);
  // 同じ回（テンプレート×発行日）から二重に請求書を作成しないための判定セット
  const [generatedOccurrenceIds, setGeneratedOccurrenceIds] = useState<Set<string>>(new Set());
  // 発行済み件数から採番すると、途中の請求書を削除した後に同じ番号が再び採番されてしまうため、
  // ClientInvoiceForm.tsx と同様、単調増加のカウンタを別に持つ。
  const [nextInvoiceSequence, setNextInvoiceSequence] = useState(1);

  const [printingInvoice, setPrintingInvoice] = useState<ClientInvoice | null>(null);

  const occurrences = useMemo(
    () => computeRecurringInvoiceOccurrencesForTemplates(templates, { start: rangeStart, end: rangeEnd }),
    [templates, rangeStart, rangeEnd]
  );

  function set<K extends keyof RecurringInvoiceTemplateDraft>(key: K, value: RecurringInvoiceTemplateDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddTemplate(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateRecurringInvoiceTemplateDraft(draft);
    if (hasRecurringInvoiceTemplateErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setTemplates((prev) => addRecurringInvoiceTemplate(prev, draft));
    setDraft(EMPTY_RECURRING_INVOICE_TEMPLATE_DRAFT);
  }

  function handleRemoveTemplate(id: string) {
    setTemplates((prev) => removeRecurringInvoiceTemplate(prev, id));
  }

  function handleToggleActive(id: string) {
    setTemplates((prev) => toggleRecurringInvoiceTemplateActive(prev, id));
  }

  function handleGenerateOccurrence(template: RecurringInvoiceTemplate, occurrence: RecurringInvoiceOccurrence) {
    const occurrenceId = buildRecurringInvoiceOccurrenceId(occurrence.templateId, occurrence.issueDate);
    if (generatedOccurrenceIds.has(occurrenceId)) return;

    const input = buildRecurringInvoiceInput(template, occurrence, {
      issuerName,
      issuerRegistrationNumber: issuerRegistrationNumber || null,
      invoiceSequence: nextInvoiceSequence,
    });
    const result = buildClientInvoice(input);

    setGeneratedInvoices((prev) => [...prev, result.invoice]);
    setGeneratedOccurrenceIds((prev) => new Set(prev).add(occurrenceId));
    setNextInvoiceSequence((n) => n + 1);
  }

  function removeSavedInvoice(invoiceNumber: string) {
    setGeneratedInvoices((prev) => prev.filter((inv) => inv.invoiceNumber !== invoiceNumber));
  }

  if (printingInvoice) {
    return (
      <DocumentPreviewFrame maxWidth="3xl">
        <InvoicePrintLayout invoice={printingInvoice} onClose={() => setPrintingInvoice(null)} />
      </DocumentPreviewFrame>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
        顧問料・月額サブスクリプションなど、同じ取引先に毎月/四半期ごと同じ内容で発行する請求書をテンプレートとして
        登録しておくと、対象期間を指定するだけで発生する請求書発行日を確認し、その場で請求書を作成できます。
        テンプレートも作成した請求書も、この画面を開いている間だけ有効な一時データです（永続保存は未対応）。
      </p>

      <section className="border border-border bg-surface p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">発行者情報（あなた・請求書作成時に使用）</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="recurring-invoice-issuer-name">
              氏名・屋号・法人名
            </label>
            <input
              id="recurring-invoice-issuer-name"
              type="text"
              value={issuerName}
              onChange={(e) => setIssuerName(e.target.value)}
              placeholder="例：山田太郎（屋号：やまだ設計事務所）"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="recurring-invoice-issuer-registration-number">
              適格請求書発行事業者登録番号（任意）
            </label>
            <input
              id="recurring-invoice-issuer-registration-number"
              type="text"
              value={issuerRegistrationNumber}
              onChange={(e) => setIssuerRegistrationNumber(e.target.value)}
              placeholder="例：T1234567890123"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="border border-border bg-surface p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">定期請求書テンプレートを追加</h3>
        <form onSubmit={handleAddTemplate} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="recurring-invoice-client-name">
                請求先（取引先）名称
              </label>
              <input
                id="recurring-invoice-client-name"
                type="text"
                placeholder="例：株式会社サンプル"
                value={draft.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                className={inputClass}
              />
              {errors.clientName && <span className={errorTextClass}>{errors.clientName}</span>}
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-description">
                品目・内容
              </label>
              <input
                id="recurring-invoice-description"
                type="text"
                placeholder="例：顧問料（月額）"
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass}
              />
              {errors.description && <span className={errorTextClass}>{errors.description}</span>}
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-amount">
                単価（税抜・円）
              </label>
              <input
                id="recurring-invoice-amount"
                type="number"
                step="any"
                min="0"
                placeholder="例：50000"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                className={inputClass}
              />
              {errors.amount && <span className={errorTextClass}>{errors.amount}</span>}
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-tax-rate">
                税率
              </label>
              <select
                id="recurring-invoice-tax-rate"
                value={draft.taxRate}
                onChange={(e) => set("taxRate", Number(e.target.value) as InvoiceTaxRate)}
                className={inputClass}
              >
                <option value={10}>10%</option>
                <option value={8}>8%（軽減）</option>
                <option value={0}>0%</option>
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-interval">
                頻度
              </label>
              <select
                id="recurring-invoice-interval"
                value={draft.interval}
                onChange={(e) =>
                  set("interval", e.target.value as RecurringInvoiceTemplateDraft["interval"])
                }
                className={inputClass}
              >
                {RECURRING_INVOICE_INTERVALS.map((interval) => (
                  <option key={interval} value={interval}>
                    {RECURRING_INVOICE_INTERVAL_LABELS[interval]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-start-date">
                開始日
              </label>
              <input
                id="recurring-invoice-start-date"
                type="date"
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClass}
              />
              {errors.startDate && <span className={errorTextClass}>{errors.startDate}</span>}
              <p className="mt-1 text-xs text-muted-foreground">
                開始日の「日」が毎回の発行日の基準になります（末日が存在しない月は月末日になります）。
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="recurring-invoice-end-date">
                終了日（任意）
              </label>
              <input
                id="recurring-invoice-end-date"
                type="date"
                value={draft.endDate ?? ""}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
              />
              {errors.endDate && <span className={errorTextClass}>{errors.endDate}</span>}
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="recurring-invoice-note">
                メモ（任意）
              </label>
              <input
                id="recurring-invoice-note"
                type="text"
                placeholder="契約内容の補足などがあれば入力"
                value={draft.note ?? ""}
                onChange={(e) => set("note", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <button
            type="submit"
            className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors self-start"
          >
            テンプレートを追加
          </button>
        </form>
      </section>

      <section className="border border-border bg-surface p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">登録済みテンプレート</h3>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだテンプレートが登録されていません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">請求先</th>
                  <th className="py-2 pr-4">品目</th>
                  <th className="py-2 pr-4">単価（税抜）</th>
                  <th className="py-2 pr-4">税率</th>
                  <th className="py-2 pr-4">頻度</th>
                  <th className="py-2 pr-4">開始日</th>
                  <th className="py-2 pr-4">終了日</th>
                  <th className="py-2 pr-4">状態</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-border/60">
                    <td className="py-2 pr-4">{template.clientName}</td>
                    <td className="py-2 pr-4">{template.description}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{yen.format(template.amount)}</td>
                    <td className="py-2 pr-4">{INVOICE_TAX_RATE_LABELS[template.taxRate]}</td>
                    <td className="py-2 pr-4">{RECURRING_INVOICE_INTERVAL_LABELS[template.interval]}</td>
                    <td className="py-2 pr-4">{template.startDate}</td>
                    <td className="py-2 pr-4">{template.endDate ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {template.active ? (
                        <span className="text-emerald-700">有効</span>
                      ) : (
                        <span className="text-muted-foreground">無効</span>
                      )}
                    </td>
                    <td className="py-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(template.id)}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        {template.active ? "無効化" : "有効化"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTemplate(template.id)}
                        className="text-xs text-red-700 underline hover:text-red-900"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-border bg-surface p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">対象期間の発生予定を確認・作成</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            期間開始日
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            期間終了日
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {rangeStart > rangeEnd ? (
          <p className="text-sm text-red-700">期間開始日は期間終了日より前の日付にしてください。</p>
        ) : occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            この期間に発生するテンプレートはありません（テンプレート未登録、または期間外です）。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">発行予定日</th>
                  <th className="py-2 pr-4">請求先</th>
                  <th className="py-2 pr-4">品目</th>
                  <th className="py-2 pr-4">税込見込額</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map((occurrence) => {
                  const template = templates.find((t) => t.id === occurrence.templateId);
                  if (!template) return null;
                  const occurrenceId = buildRecurringInvoiceOccurrenceId(
                    occurrence.templateId,
                    occurrence.issueDate
                  );
                  const alreadyGenerated = generatedOccurrenceIds.has(occurrenceId);
                  const taxMultiplier = 1 + template.taxRate / 100;

                  return (
                    <tr key={occurrenceId} className="border-b border-border/60">
                      <td className="py-2 pr-4 whitespace-nowrap">{occurrence.issueDate}</td>
                      <td className="py-2 pr-4">{template.clientName}</td>
                      <td className="py-2 pr-4">{template.description}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {yen.format(Math.floor(template.amount * taxMultiplier))}
                      </td>
                      <td className="py-2">
                        {alreadyGenerated ? (
                          <span className="text-xs text-emerald-700">作成済み</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGenerateOccurrence(template, occurrence)}
                            className="text-xs px-3 py-1.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors"
                          >
                            この回の請求書を作成
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          税込見込額は税率から概算したものです。実際の請求書金額は「この回の請求書を作成」を押した際に
          clientInvoice.tsの計算ロジック（税率ごとに1回だけ端数処理）で確定します。
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          作成済みの定期請求書
          {generatedInvoices.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">（{generatedInvoices.length}件）</span>
          )}
        </h2>
        {generatedInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
            まだ作成された請求書がありません。上の一覧から「この回の請求書を作成」を押してください。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {generatedInvoices.map((invoice) => (
              <div
                key={invoice.invoiceNumber}
                className="border border-border bg-surface p-4 flex items-center justify-between gap-3 flex-wrap"
              >
                <div>
                  <p className="text-sm font-medium">
                    {invoice.invoiceNumber} — {invoice.clientName || "（請求先未入力）"} 様
                  </p>
                  <p className="text-xs text-muted-foreground">
                    発行日 {invoice.issueDate} ／ 税込合計 {yen.format(invoice.grandTotal)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPrintingInvoice(invoice)}
                    className="text-xs text-muted-foreground hover:text-foreground"
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
