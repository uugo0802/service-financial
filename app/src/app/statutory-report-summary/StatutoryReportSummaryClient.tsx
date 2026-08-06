"use client";

import { useMemo, useState } from "react";
import {
  StatutoryReportPaymentReportInput,
  StatutoryReportWithholdingSlipInput,
  StatutoryReportSummaryForm as StatutoryReportSummaryFormResult,
  buildStatutoryReportSummaryForm,
} from "@/lib/tax/statutoryReportSummaryForm";
import { PAYMENT_REPORT_CATEGORIES, PaymentReportCategory } from "@/lib/tax/paymentReportForm";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { StatutoryReportSummaryTable } from "./StatutoryReportSummaryTable";

// ------------------------------------------------------------------
// 「法定調書合計表」下書きプレビュー画面のフォーム。
//
// このアプリはまだ支払調書・源泉徴収票を横断的に一元管理するデータストアを
// 持たないため(payment-report・withholding-slip各画面もそれぞれ独立したサンプル
// データ/入力フォームで動作している)、この画面でも同様に、対象となる支払調書・
// 源泉徴収票を1件ずつ手入力するシンプルな一覧編集フォームとする。実データとの
// 連携(記帳データ・給与計算結果からの自動取得)は別トラックの課題とする。
//
// 実際の集計計算は statutoryReportSummaryForm.ts の buildStatutoryReportSummaryForm に
// 委譲し、このコンポーネントはフォーム状態の管理と表示のみを担う。
// ------------------------------------------------------------------

const FISCAL_YEARS = [2025, 2026, 2027];

const inputClass = "w-full border border-stone-400 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

interface SalaryRowState {
  id: string;
  name: string;
  paymentAmount: string;
  withholdingTaxAmount: string;
}

interface PaymentRowState {
  id: string;
  payeeName: string;
  category: PaymentReportCategory;
  grossAmount: string;
  withholdingTax: string;
  reportRequired: boolean;
}

function makeSalaryRow(overrides?: Partial<SalaryRowState>): SalaryRowState {
  return { id: nextId("salary"), name: "", paymentAmount: "", withholdingTaxAmount: "", ...overrides };
}

function makePaymentRow(overrides?: Partial<PaymentRowState>): PaymentRowState {
  return {
    id: nextId("payment"),
    payeeName: "",
    category: "その他の報酬・料金",
    grossAmount: "",
    withholdingTax: "",
    reportRequired: true,
    ...overrides,
  };
}

const INITIAL_SALARY_ROWS: SalaryRowState[] = [
  makeSalaryRow({ name: "山田 太郎", paymentAmount: "4000000", withholdingTaxAmount: "132000" }),
];

const INITIAL_PAYMENT_ROWS: PaymentRowState[] = [
  makePaymentRow({
    payeeName: "〇〇税理士事務所",
    category: "弁護士・税理士等の報酬",
    grossAmount: "66000",
    withholdingTax: "6738",
  }),
  makePaymentRow({
    payeeName: "△△デザイン事務所",
    category: "デザイン料",
    grossAmount: "120000",
    withholdingTax: "12252",
  }),
];

export function StatutoryReportSummaryClient() {
  const [fiscalYear, setFiscalYear] = useState<number>(2026);

  const [submitterName, setSubmitterName] = useState("今ごえん合同会社");
  const [submitterAddress, setSubmitterAddress] = useState("");
  const [submitterCorporateNumber, setSubmitterCorporateNumber] = useState("");
  const [submitterRepresentativeName, setSubmitterRepresentativeName] = useState("");
  const [submitterTaxOfficeName, setSubmitterTaxOfficeName] = useState("");

  const [salaryRows, setSalaryRows] = useState<SalaryRowState[]>(INITIAL_SALARY_ROWS);
  const [paymentRows, setPaymentRows] = useState<PaymentRowState[]>(INITIAL_PAYMENT_ROWS);

  const { form, error } = useMemo(() => {
    try {
      const paymentReportRecords: StatutoryReportPaymentReportInput[] = paymentRows
        .filter((r) => r.payeeName.trim() !== "")
        .map((r) => ({
          payeeName: r.payeeName,
          category: r.category,
          grossAmount: Number(r.grossAmount) || 0,
          withholdingTax: Number(r.withholdingTax) || 0,
          reportRequired: r.reportRequired,
        }));

      const withholdingSlipRecords: StatutoryReportWithholdingSlipInput[] = salaryRows
        .filter((r) => r.name.trim() !== "")
        .map((r) => ({
          employee: { name: r.name },
          paymentAmount: Number(r.paymentAmount) || 0,
          withholdingTaxAmount: Number(r.withholdingTaxAmount) || 0,
          fiscalYear,
        }));

      const form: StatutoryReportSummaryFormResult = buildStatutoryReportSummaryForm(
        paymentReportRecords,
        withholdingSlipRecords,
        {
          fiscalYear,
          submitter: {
            name: submitterName,
            address: submitterAddress.trim() || undefined,
            corporateNumber: submitterCorporateNumber.trim() || undefined,
            representativeName: submitterRepresentativeName.trim() || undefined,
            taxOfficeName: submitterTaxOfficeName.trim() || undefined,
          },
        }
      );
      return { form, error: null as string | null };
    } catch (e) {
      return { form: null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [
    fiscalYear,
    submitterName,
    submitterAddress,
    submitterCorporateNumber,
    submitterRepresentativeName,
    submitterTaxOfficeName,
    salaryRows,
    paymentRows,
  ]);

  function updateSalaryRow(id: string, patch: Partial<SalaryRowState>) {
    setSalaryRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentRowState>) {
    setPaymentRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="print:hidden flex flex-col gap-6 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="summary-fiscal-year">
            対象年
          </label>
          <select
            id="summary-fiscal-year"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            className={`${inputClass} max-w-[10rem]`}
          >
            {FISCAL_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}年分
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 dark:text-stone-300 mb-2">提出者情報</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="summary-submitter-name">
                提出者の名称
              </label>
              <input
                id="summary-submitter-name"
                type="text"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                placeholder="例：今ごえん合同会社"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="summary-submitter-address">
                所在地（任意）
              </label>
              <input
                id="summary-submitter-address"
                type="text"
                value={submitterAddress}
                onChange={(e) => setSubmitterAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="summary-submitter-corporate-number">
                法人番号（13桁、任意）
              </label>
              <input
                id="summary-submitter-corporate-number"
                type="text"
                value={submitterCorporateNumber}
                onChange={(e) => setSubmitterCorporateNumber(e.target.value)}
                placeholder="例：1234567890123"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="summary-submitter-representative">
                代表者氏名（任意）
              </label>
              <input
                id="summary-submitter-representative"
                type="text"
                value={submitterRepresentativeName}
                onChange={(e) => setSubmitterRepresentativeName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="summary-submitter-tax-office">
                提出先税務署名（任意）
              </label>
              <input
                id="summary-submitter-tax-office"
                type="text"
                value={submitterTaxOfficeName}
                onChange={(e) => setSubmitterTaxOfficeName(e.target.value)}
                placeholder="例：〇〇税務署"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              給与所得の源泉徴収票（年末調整をしたもの）
            </div>
            <button
              type="button"
              onClick={() => setSalaryRows((rows) => [...rows, makeSalaryRow()])}
              className="text-xs underline text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
            >
              + 行を追加
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {salaryRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className={labelClass}>氏名</label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateSalaryRow(row.id, { name: e.target.value })}
                    placeholder="例：山田 太郎"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>支払金額（円）</label>
                  <input
                    type="number"
                    min="0"
                    value={row.paymentAmount}
                    onChange={(e) => updateSalaryRow(row.id, { paymentAmount: e.target.value })}
                    placeholder="例：4000000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>源泉徴収税額（円）</label>
                  <input
                    type="number"
                    min="0"
                    value={row.withholdingTaxAmount}
                    onChange={(e) => updateSalaryRow(row.id, { withholdingTaxAmount: e.target.value })}
                    placeholder="例：132000"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSalaryRows((rows) => rows.filter((r) => r.id !== row.id))}
                  className="text-xs text-red-700 dark:text-red-400 underline px-1 py-1.5"
                >
                  削除
                </button>
              </div>
            ))}
            {salaryRows.length === 0 && (
              <p className="text-xs text-stone-400">
                行がありません。「+ 行を追加」から、給与所得の源泉徴収票（
                <a href="/withholding-slip" className="underline">
                  下書き作成画面
                </a>
                で作成した内容）を入力してください。
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              報酬、料金、契約金及び賞金の支払調書
            </div>
            <button
              type="button"
              onClick={() => setPaymentRows((rows) => [...rows, makePaymentRow()])}
              className="text-xs underline text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
            >
              + 行を追加
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {paymentRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-2 items-end">
                <div>
                  <label className={labelClass}>支払先</label>
                  <input
                    type="text"
                    value={row.payeeName}
                    onChange={(e) => updatePaymentRow(row.id, { payeeName: e.target.value })}
                    placeholder="例：〇〇税理士事務所"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>区分</label>
                  <select
                    value={row.category}
                    onChange={(e) => updatePaymentRow(row.id, { category: e.target.value as PaymentReportCategory })}
                    className={inputClass}
                  >
                    {PAYMENT_REPORT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>支払金額（円）</label>
                  <input
                    type="number"
                    min="0"
                    value={row.grossAmount}
                    onChange={(e) => updatePaymentRow(row.id, { grossAmount: e.target.value })}
                    placeholder="例：120000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>源泉徴収税額（円）</label>
                  <input
                    type="number"
                    min="0"
                    value={row.withholdingTax}
                    onChange={(e) => updatePaymentRow(row.id, { withholdingTax: e.target.value })}
                    placeholder="例：12252"
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-1 text-xs text-stone-500 pb-1.5 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={row.reportRequired}
                    onChange={(e) => updatePaymentRow(row.id, { reportRequired: e.target.checked })}
                  />
                  提出対象
                </label>
                <button
                  type="button"
                  onClick={() => setPaymentRows((rows) => rows.filter((r) => r.id !== row.id))}
                  className="text-xs text-red-700 dark:text-red-400 underline px-1 py-1.5"
                >
                  削除
                </button>
              </div>
            ))}
            {paymentRows.length === 0 && (
              <p className="text-xs text-stone-400">
                行がありません。「+ 行を追加」から、支払調書（
                <a href="/payment-report" className="underline">
                  下書き作成画面
                </a>
                で作成した内容）を入力してください。
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-stone-400 leading-relaxed">
            「提出対象」のチェックを外した行は、支払調書の提出が不要と判断した行として合計表の集計から除外されます
            （
            <a href="/payment-report" className="underline">
              支払調書（下書き）
            </a>
            画面の「提出が必要」の判定を参考にしてください）。
          </p>
        </div>

        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </section>

      {form ? (
        <PrintableStatementLayout
          tenantName={form.submitter.name}
          fiscalYearLabel={form.fiscalYearLabel}
          printButtonLabel="印刷 / PDFで保存（法定調書合計表）"
          sections={[{ id: "statutory-report-summary", content: <StatutoryReportSummaryTable form={form} /> }]}
        />
      ) : (
        <p className="text-sm text-stone-500">提出者の名称を入力すると、法定調書合計表の下書きプレビューを表示します。</p>
      )}
    </div>
  );
}
