"use client";

// 「個人事業の開業・廃業等届出書」（開業の場合）の下書き作成フォーム。
//
// これから事業を開始するフリーランス・個人事業主が、提出先・提出者情報・開業日・
// 事業の概要・給与等の支払の状況・青色申告承認申請書の同時提出有無を入力すると、
// 届出書の下書きデータのプレビュー（印刷／PDF保存可能なレイアウト）を表示する。
//
// 実際の計算・組み立ては buildBusinessCommencementNotificationDraft
// （businessCommencementNotificationForm.ts）という純粋関数に委譲し、
// このコンポーネントはフォーム状態の管理と表示のみを担う。
//
// 個人番号（マイナンバー）については、当社では一切取得・保存しない方針
// （docs/cto-tech-architecture.md）のため、この画面にも入力欄を設けていない。
// プレビュー側は buildBusinessCommencementNotificationDraft が返す固定の
// 「ご自身でご記入ください」という案内文言をそのまま表示するのみ。

import { useMemo, useState } from "react";
import {
  BusinessCommencementNotificationDraft,
  buildBusinessCommencementNotificationDraft,
} from "@/lib/tax/businessCommencementNotificationForm";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

export function BusinessCommencementNotificationForm() {
  const [taxOfficeJurisdiction, setTaxOfficeJurisdiction] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [occupation, setOccupation] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [commencementDate, setCommencementDate] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [hasEmployees, setHasEmployees] = useState(false);
  const [employeeCount, setEmployeeCount] = useState("");
  const [salaryPaymentStartDate, setSalaryPaymentStartDate] = useState("");
  const [fileBlueTaxReturnApplicationSimultaneously, setFileBlueTaxReturnApplicationSimultaneously] =
    useState(false);

  const draft: BusinessCommencementNotificationDraft = useMemo(() => {
    const parsedEmployeeCount = employeeCount.trim() === "" ? undefined : Number(employeeCount);
    return buildBusinessCommencementNotificationDraft({
      taxOfficeJurisdiction,
      submissionDate: submissionDate.trim() || undefined,
      address,
      name,
      dateOfBirth,
      occupation,
      tradeName: tradeName.trim() || undefined,
      commencementDate,
      businessDescription,
      hasEmployees,
      employeeCount: parsedEmployeeCount,
      salaryPaymentStartDate: salaryPaymentStartDate.trim() || undefined,
      fileBlueTaxReturnApplicationSimultaneously,
    });
  }, [
    taxOfficeJurisdiction,
    submissionDate,
    address,
    name,
    dateOfBirth,
    occupation,
    tradeName,
    commencementDate,
    businessDescription,
    hasEmployees,
    employeeCount,
    salaryPaymentStartDate,
    fileBlueTaxReturnApplicationSimultaneously,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 bg-stone-50 border border-stone-200 rounded p-4 print:hidden">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="bcn-tax-office">
              提出先税務署
            </label>
            <input
              id="bcn-tax-office"
              type="text"
              value={taxOfficeJurisdiction}
              onChange={(e) => setTaxOfficeJurisdiction(e.target.value)}
              placeholder="例：〇〇税務署（納税地を所轄する税務署をご自身でご確認ください）"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bcn-submission-date">
              提出日（任意）
            </label>
            <input
              id="bcn-submission-date"
              type="text"
              value={submissionDate}
              onChange={(e) => setSubmissionDate(e.target.value)}
              placeholder="例：2026年8月10日"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="bcn-address">
              納税地（住所又は居所）
            </label>
            <input
              id="bcn-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例：東京都〇〇区…"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bcn-name">
              氏名
            </label>
            <input
              id="bcn-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田 太郎"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bcn-date-of-birth">
              生年月日
            </label>
            <input
              id="bcn-date-of-birth"
              type="text"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              placeholder="例：1990年4月1日"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bcn-occupation">
              職業
            </label>
            <input
              id="bcn-occupation"
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="例：Webデザイナー"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bcn-trade-name">
              屋号（ある場合のみ、任意）
            </label>
            <input
              id="bcn-trade-name"
              type="text"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="例：山田デザイン事務所"
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-stone-500 leading-relaxed">
          個人番号（マイナンバー）の入力欄はありません。様式上の記載欄には、下書きプレビュー側で「ご自身でご記入
          ください」という案内のみを表示します。
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="bcn-commencement-date">
              開業・廃業等日
            </label>
            <input
              id="bcn-commencement-date"
              type="text"
              value={commencementDate}
              onChange={(e) => setCommencementDate(e.target.value)}
              placeholder="例：2026年8月1日"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="bcn-business-description">
            事業の概要
          </label>
          <textarea
            id="bcn-business-description"
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="例：Webサイトの制作・デザイン業務"
            rows={3}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasEmployees}
              onChange={(e) => setHasEmployees(e.target.checked)}
            />
            従業員（専従者を含む使用人）を雇う
          </label>

          {hasEmployees && (
            <div className="grid sm:grid-cols-2 gap-4 pl-6">
              <div>
                <label className={labelClass} htmlFor="bcn-employee-count">
                  従業員数
                </label>
                <input
                  id="bcn-employee-count"
                  type="number"
                  min={1}
                  step={1}
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  placeholder="例：1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="bcn-salary-start-date">
                  給与支払を開始する年月日
                </label>
                <input
                  id="bcn-salary-start-date"
                  type="text"
                  value={salaryPaymentStartDate}
                  onChange={(e) => setSalaryPaymentStartDate(e.target.value)}
                  placeholder="例：2026年9月25日"
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fileBlueTaxReturnApplicationSimultaneously}
              onChange={(e) => setFileBlueTaxReturnApplicationSimultaneously(e.target.checked)}
            />
            青色申告承認申請書をこの開業届と同時に提出する
          </label>
        </div>
      </section>

      <BusinessCommencementNotificationPreview draft={draft} />
    </div>
  );
}

function BusinessCommencementNotificationPreview({ draft }: { draft: BusinessCommencementNotificationDraft }) {
  const isComplete = draft.warnings.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-lg font-semibold">下書きプレビュー</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100"
        >
          印刷 / PDFで保存
        </button>
      </div>

      <div
        className={`border rounded-lg p-4 flex items-center gap-3 print:hidden ${
          isComplete ? "border-emerald-300 bg-emerald-50" : "border-amber-400 bg-amber-50"
        }`}
      >
        <span
          className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium text-white ${
            isComplete ? "bg-emerald-700" : "bg-amber-700"
          }`}
        >
          {isComplete ? "必須項目 入力済み" : "未入力の必須項目あり"}
        </span>
        <span className="text-sm text-stone-700">個人事業の開業届（開業）として下書きを作成しています</span>
      </div>

      {draft.warnings.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800 print:hidden">
          <p className="font-semibold mb-1">未入力・要確認の項目</p>
          <ul className="list-disc list-inside space-y-1">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-stone-300 bg-white divide-y divide-stone-200 print:border-stone-400 print:break-inside-avoid">
        <div className="p-4 print:p-0 print:pb-3">
          <p className="text-xs text-stone-400 print:hidden">下書きプレビュー</p>
          <h3 className="text-base font-semibold text-stone-800 hidden print:block">
            個人事業の開業・廃業等届出書（開業の場合・下書き）
          </h3>
        </div>
        {draft.sections.map((section) => (
          <div key={section.title} className="p-4 print:px-0 print:py-2 print:break-inside-avoid">
            <h3 className="text-sm font-semibold text-stone-700 mb-2">{section.title}</h3>
            <dl className="text-sm space-y-1">
              {section.fields.map((field) => (
                <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2 print:flex-row print:gap-2">
                  <dt className="text-stone-500 sm:w-72 shrink-0 print:w-64">{field.label}</dt>
                  <dd className="text-stone-900">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {draft.notes.length > 0 && (
        <div className="print:break-inside-avoid">
          <h3 className="text-sm font-semibold mb-2 text-stone-700">留意事項</h3>
          <ul className="text-xs text-stone-600 leading-relaxed list-disc list-inside space-y-1">
            {draft.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="print:break-inside-avoid">
        <h3 className="text-sm font-semibold mb-2 text-stone-700">前提・対象範囲</h3>
        <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
          {draft.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-amber-700 leading-relaxed print:break-inside-avoid">{draft.disclaimer}</p>
    </section>
  );
}
