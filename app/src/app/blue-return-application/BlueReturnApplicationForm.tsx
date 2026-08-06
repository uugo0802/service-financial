"use client";

// 「所得税の青色申告承認申請書」（個人事業主用）の下書き作成フォーム。
//
// これから青色申告の承認を受けようとする個人事業主が、納税地・氏名等の基本情報、
// 承認を受けようとする年分、事業所又は所得の種類、過去の取消し・取りやめ歴、
// 開業・事業承継の状況、簿記方式・備付帳簿名を入力すると、申請書の下書き
// データのプレビューと、印刷／PDF保存用のレイアウトを表示する。
//
// 実際の組み立ては buildBlueReturnApplicationDraft（blueReturnApplicationForm.ts）
// という純粋関数に委譲し、このコンポーネントはフォーム状態の管理と表示のみを担う。
//
// マイナンバー非保持の原則（docs/cto-tech-architecture.md）に従い、個人番号
// （マイナンバー）の入力欄はこのフォームに一切設けない。

import { useMemo, useState } from "react";
import {
  BLUE_RETURN_LEDGER_OPTIONS,
  BlueReturnApplicationDraft,
  BlueReturnBookkeepingMethod,
  BlueReturnIncomeType,
  BlueReturnLedgerOption,
  buildBlueReturnApplicationDraft,
} from "@/lib/tax/blueReturnApplicationForm";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const INCOME_TYPE_OPTIONS: { value: BlueReturnIncomeType; label: string }[] = [
  { value: "business", label: "事業所得" },
  { value: "realEstate", label: "不動産所得" },
  { value: "forestry", label: "山林所得" },
];

const BOOKKEEPING_METHOD_OPTIONS: { value: BlueReturnBookkeepingMethod; label: string }[] = [
  { value: "double", label: "複式簿記" },
  { value: "simplified", label: "簡易簿記" },
  { value: "other", label: "その他" },
];

/** 「下書きです。提出はご自身の責任で行ってください」という標準の注記文言そのもの。 */
const SHORT_DRAFT_DISCLAIMER = "下書きです。提出はご自身の責任で行ってください。";

export function BlueReturnApplicationForm() {
  const [taxOfficeName, setTaxOfficeName] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [taxpayerAddress, setTaxpayerAddress] = useState("");
  const [taxpayerName, setTaxpayerName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [occupation, setOccupation] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [applicableYear, setApplicableYear] = useState("");
  const [businessLocationDescription, setBusinessLocationDescription] = useState("");
  const [incomeType, setIncomeType] = useState<BlueReturnIncomeType>("business");

  const [hasPriorRevocationOrWithdrawal, setHasPriorRevocationOrWithdrawal] = useState(false);
  const [priorRevocationOrWithdrawalDate, setPriorRevocationOrWithdrawalDate] = useState("");

  const [businessStartDate, setBusinessStartDate] = useState("");

  const [hasInheritance, setHasInheritance] = useState(false);
  const [inheritanceStartDate, setInheritanceStartDate] = useState("");
  const [decedentName, setDecedentName] = useState("");

  const [bookkeepingMethod, setBookkeepingMethod] = useState<BlueReturnBookkeepingMethod>("double");
  const [bookkeepingMethodOther, setBookkeepingMethodOther] = useState("");
  const [maintainedLedgers, setMaintainedLedgers] = useState<BlueReturnLedgerOption[]>([]);
  const [otherLedgerName, setOtherLedgerName] = useState("");

  function toggleLedger(ledger: BlueReturnLedgerOption) {
    setMaintainedLedgers((prev) =>
      prev.includes(ledger) ? prev.filter((l) => l !== ledger) : [...prev, ledger]
    );
  }

  const draft: BlueReturnApplicationDraft = useMemo(
    () =>
      buildBlueReturnApplicationDraft({
        taxOfficeName,
        submissionDate: submissionDate.trim() || undefined,
        taxpayerAddress,
        taxpayerName,
        dateOfBirth: dateOfBirth.trim() || undefined,
        occupation: occupation.trim() || undefined,
        tradeName: tradeName.trim() || undefined,
        applicableYear,
        businessLocationDescription,
        incomeType,
        hasPriorRevocationOrWithdrawal,
        priorRevocationOrWithdrawalDate: priorRevocationOrWithdrawalDate.trim() || undefined,
        businessStartDate: businessStartDate.trim() || undefined,
        inheritance: hasInheritance
          ? {
              hasInheritance: true,
              inheritanceStartDate: inheritanceStartDate.trim() || undefined,
              decedentName: decedentName.trim() || undefined,
            }
          : { hasInheritance: false },
        bookkeepingMethod,
        bookkeepingMethodOther: bookkeepingMethodOther.trim() || undefined,
        maintainedLedgers,
        otherLedgerName: otherLedgerName.trim() || undefined,
      }),
    [
      taxOfficeName,
      submissionDate,
      taxpayerAddress,
      taxpayerName,
      dateOfBirth,
      occupation,
      tradeName,
      applicableYear,
      businessLocationDescription,
      incomeType,
      hasPriorRevocationOrWithdrawal,
      priorRevocationOrWithdrawalDate,
      businessStartDate,
      hasInheritance,
      inheritanceStartDate,
      decedentName,
      bookkeepingMethod,
      bookkeepingMethodOther,
      maintainedLedgers,
      otherLedgerName,
    ]
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="print:hidden flex flex-col gap-6 bg-stone-50 border border-stone-200 rounded p-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="blue-app-tax-office">
              提出先税務署
            </label>
            <input
              id="blue-app-tax-office"
              type="text"
              value={taxOfficeName}
              onChange={(e) => setTaxOfficeName(e.target.value)}
              placeholder="例：〇〇税務署（納税地を所轄する税務署をご自身でご確認ください）"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="blue-app-submission-date">
              提出年月日（任意）
            </label>
            <input
              id="blue-app-submission-date"
              type="text"
              value={submissionDate}
              onChange={(e) => setSubmissionDate(e.target.value)}
              placeholder="例：令和8年8月6日"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 mb-2">納税地・氏名等</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="blue-app-address">
                納税地（住所）
              </label>
              <input
                id="blue-app-address"
                type="text"
                value={taxpayerAddress}
                onChange={(e) => setTaxpayerAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="blue-app-name">
                氏名
              </label>
              <input
                id="blue-app-name"
                type="text"
                value={taxpayerName}
                onChange={(e) => setTaxpayerName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="blue-app-dob">
                生年月日（任意）
              </label>
              <input
                id="blue-app-dob"
                type="text"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                placeholder="例：昭和60年4月1日"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="blue-app-occupation">
                職業（任意）
              </label>
              <input
                id="blue-app-occupation"
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="例：デザイン業"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="blue-app-trade-name">
                屋号（任意）
              </label>
              <input
                id="blue-app-trade-name"
                type="text"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="例：山田デザイン事務所"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="blue-app-applicable-year">
                青色申告の承認を受けようとする年分
              </label>
              <input
                id="blue-app-applicable-year"
                type="text"
                value={applicableYear}
                onChange={(e) => setApplicableYear(e.target.value)}
                placeholder="例：令和8年"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 mb-2">1・2 事業所又は所得の基因となる資産／所得の種類</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="blue-app-business-location">
                事業所又は所得の基因となる資産の名称及びその所在地
              </label>
              <input
                id="blue-app-business-location"
                type="text"
                value={businessLocationDescription}
                onChange={(e) => setBusinessLocationDescription(e.target.value)}
                placeholder="例：東京都〇〇区…（自宅事務所）"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>所得の種類</label>
              <div className="flex flex-wrap gap-4 text-sm pt-2">
                {INCOME_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="blue-app-income-type"
                      checked={incomeType === opt.value}
                      onChange={() => setIncomeType(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm mb-2">
            <input
              type="checkbox"
              checked={hasPriorRevocationOrWithdrawal}
              onChange={(e) => setHasPriorRevocationOrWithdrawal(e.target.checked)}
            />
            3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことがある
          </label>
          {hasPriorRevocationOrWithdrawal && (
            <div className="max-w-xs">
              <label className={labelClass} htmlFor="blue-app-revocation-date">
                取消し又は取りやめの年月日
              </label>
              <input
                id="blue-app-revocation-date"
                type="text"
                value={priorRevocationOrWithdrawalDate}
                onChange={(e) => setPriorRevocationOrWithdrawalDate(e.target.value)}
                placeholder="例：令和5年5月1日"
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="blue-app-business-start-date">
            4 本年1月16日以後新たに業務を開始した場合、その開始年月日（任意）
          </label>
          <input
            id="blue-app-business-start-date"
            type="text"
            value={businessStartDate}
            onChange={(e) => setBusinessStartDate(e.target.value)}
            placeholder="例：令和8年3月1日"
            className={`${inputClass} max-w-xs`}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm mb-2">
            <input
              type="checkbox"
              checked={hasInheritance}
              onChange={(e) => setHasInheritance(e.target.checked)}
            />
            5 相続による事業承継がある
          </label>
          {hasInheritance && (
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className={labelClass} htmlFor="blue-app-inheritance-date">
                  相続開始年月日
                </label>
                <input
                  id="blue-app-inheritance-date"
                  type="text"
                  value={inheritanceStartDate}
                  onChange={(e) => setInheritanceStartDate(e.target.value)}
                  placeholder="例：令和8年2月1日"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="blue-app-decedent-name">
                  被相続人の氏名
                </label>
                <input
                  id="blue-app-decedent-name"
                  type="text"
                  value={decedentName}
                  onChange={(e) => setDecedentName(e.target.value)}
                  placeholder="例：山田 一郎"
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 mb-2">6 その他参考事項 — 簿記方式</div>
          <div className="flex flex-wrap gap-4 text-sm">
            {BOOKKEEPING_METHOD_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="blue-app-bookkeeping-method"
                  checked={bookkeepingMethod === opt.value}
                  onChange={() => setBookkeepingMethod(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {bookkeepingMethod === "other" && (
            <div className="mt-2 max-w-sm">
              <label className={labelClass} htmlFor="blue-app-bookkeeping-other">
                簿記方式（その他、具体的に）
              </label>
              <input
                id="blue-app-bookkeeping-other"
                type="text"
                value={bookkeepingMethodOther}
                onChange={(e) => setBookkeepingMethodOther(e.target.value)}
                placeholder="例：現金式簡易帳簿による記帳"
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 mb-2">6 その他参考事項 — 備付帳簿名</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {BLUE_RETURN_LEDGER_OPTIONS.map((ledger) => (
              <label key={ledger} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={maintainedLedgers.includes(ledger)}
                  onChange={() => toggleLedger(ledger)}
                />
                {ledger}
              </label>
            ))}
          </div>
          <div className="mt-3 max-w-sm">
            <label className={labelClass} htmlFor="blue-app-other-ledger">
              備付帳簿名（その他、任意）
            </label>
            <input
              id="blue-app-other-ledger"
              type="text"
              value={otherLedgerName}
              onChange={(e) => setOtherLedgerName(e.target.value)}
              placeholder="例：顧問先独自の管理表"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <BlueReturnApplicationPreview draft={draft} />
    </div>
  );
}

function BlueReturnApplicationPreview({ draft }: { draft: BlueReturnApplicationDraft }) {
  const isComplete = draft.warnings.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="print:hidden flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">下書きプレビュー</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100"
        >
          印刷 / PDFで保存
        </button>
      </div>

      <div className="print:hidden border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800 font-medium">
        {SHORT_DRAFT_DISCLAIMER}
      </div>

      <div
        className={`print:hidden border rounded-lg p-4 flex items-center gap-3 ${
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
        <span className="text-sm text-stone-700">所得税の青色申告承認申請書の下書きを作成しています</span>
      </div>

      {draft.warnings.length > 0 && (
        <div className="print:hidden border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">未入力・要確認の項目</p>
          <ul className="list-disc list-inside space-y-1">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 印刷／PDF保存の対象となる、様式に沿った下書き本体。 */}
      <div className="relative border-2 border-stone-800 bg-white print:mx-auto print:w-[186mm] print:pt-[10mm] print:pb-[16mm]">
        <div
          aria-hidden="true"
          className="hidden print:flex print:absolute print:inset-0 print:items-center print:justify-center print:overflow-hidden print:z-0"
        >
          <span className="print:rotate-[-30deg] print:whitespace-nowrap print:text-[48pt] print:font-bold print:text-stone-300/40">
            下書き
          </span>
        </div>
        <div className="relative z-[1] p-4 sm:p-6">
          <div className="text-center text-base font-semibold tracking-widest border-b-2 border-stone-800 pb-3 mb-4">
            所得税の青色申告承認申請書（下書き）
          </div>
          <div className="divide-y divide-stone-200">
            {draft.sections.map((section) => (
              <div key={section.title} className="py-3">
                <h3 className="text-sm font-semibold text-stone-700 mb-2">{section.title}</h3>
                <dl className="text-sm space-y-1">
                  {section.fields.map((field) => (
                    <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2">
                      <dt className="text-stone-500 sm:w-96 shrink-0">{field.label}</dt>
                      <dd className="text-stone-900 font-medium">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-4 pt-3 border-t border-stone-300 text-xs text-stone-500">{SHORT_DRAFT_DISCLAIMER}</p>
        </div>
      </div>

      {draft.notes.length > 0 && (
        <div className="print:hidden">
          <h3 className="text-sm font-semibold mb-2 text-stone-700">留意事項</h3>
          <ul className="text-xs text-stone-600 leading-relaxed list-disc list-inside space-y-1">
            {draft.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="print:hidden">
        <h3 className="text-sm font-semibold mb-2 text-stone-700">前提・注意事項</h3>
        <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
          {draft.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <p className="print:hidden text-xs text-amber-700 leading-relaxed">{draft.disclaimer}</p>

      {/* 印刷時のみ表示する固定フッター。このフッターを非表示にするUI操作は用意しない。 */}
      <div className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:border-t print:border-stone-400 print:bg-white print:px-[12mm] print:py-1 print:text-center print:text-[7.5pt] print:leading-snug print:text-stone-700">
        {SHORT_DRAFT_DISCLAIMER} 当社が代理で提出することはありません。
      </div>
    </section>
  );
}
