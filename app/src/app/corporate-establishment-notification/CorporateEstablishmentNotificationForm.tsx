"use client";

// マイクロ法人の設立直後に必要となる届出書・申請書一式（法人設立届出書
// [税務署／都道府県税事務所／市区町村役場]・青色申告の承認申請書[法人用]・
// 給与支払事務所等の開設届出書）の下書き作成フォーム。
//
// 実際の組み立ては buildCorporateEstablishmentNotificationBundle
// （../../lib/tax/corporateEstablishmentNotificationForm.ts）という純粋関数に委譲し、
// このコンポーネントはフォーム状態の管理と表示（画面プレビュー＋印刷用レイアウト）のみを担う。
//
// マイナンバー非保持の原則（docs/cto-tech-architecture.md）に従い、個人番号
// （マイナンバー）・法人番号の入力欄はこのフォームに一切設けない
// （法人番号は設立登記後に国税庁から指定されるものであり、この時点では存在しない）。

import { useMemo, useState } from "react";
import {
  CorporateEstablishmentNotificationDocumentDraft,
  CorporateEstablishmentNotificationInputs,
  buildCorporateEstablishmentNotificationBundle,
} from "@/lib/tax/corporateEstablishmentNotificationForm";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export function CorporateEstablishmentNotificationForm() {
  const [companyName, setCompanyName] = useState("");
  const [companyNameKana, setCompanyNameKana] = useState("");
  const [headOfficeAddress, setHeadOfficeAddress] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeAddress, setRepresentativeAddress] = useState("");
  const [establishmentDate, setEstablishmentDate] = useState("");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState("");
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState("");
  const [capital, setCapital] = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [hasBranches, setHasBranches] = useState(false);
  const [branchDetails, setBranchDetails] = useState("");
  const [willEmployStaff, setWillEmployStaff] = useState(false);
  const [salaryPaymentStartDate, setSalaryPaymentStartDate] = useState("");
  const [blueReturnApplicableFiscalYearLabel, setBlueReturnApplicableFiscalYearLabel] = useState("");
  const [taxOfficeJurisdiction, setTaxOfficeJurisdiction] = useState("");
  const [prefecturalTaxOfficeJurisdiction, setPrefecturalTaxOfficeJurisdiction] = useState("");
  const [municipalOfficeJurisdiction, setMunicipalOfficeJurisdiction] = useState("");

  const bundleInputs: CorporateEstablishmentNotificationInputs = useMemo(
    () => ({
      companyName,
      companyNameKana,
      headOfficeAddress,
      representativeName,
      representativeAddress,
      establishmentDate,
      fiscalYearStartMonth: Number(fiscalYearStartMonth),
      fiscalYearEndMonth: Number(fiscalYearEndMonth),
      capital: capital.trim() === "" ? 0 : Number(capital),
      businessPurpose,
      hasBranches,
      branchDetails: branchDetails.trim() || undefined,
      willEmployStaff,
      salaryPaymentStartDate: salaryPaymentStartDate.trim() || undefined,
      blueReturnApplicableFiscalYearLabel,
      taxOfficeJurisdiction: taxOfficeJurisdiction.trim() || undefined,
      prefecturalTaxOfficeJurisdiction: prefecturalTaxOfficeJurisdiction.trim() || undefined,
      municipalOfficeJurisdiction: municipalOfficeJurisdiction.trim() || undefined,
    }),
    [
      companyName,
      companyNameKana,
      headOfficeAddress,
      representativeName,
      representativeAddress,
      establishmentDate,
      fiscalYearStartMonth,
      fiscalYearEndMonth,
      capital,
      businessPurpose,
      hasBranches,
      branchDetails,
      willEmployStaff,
      salaryPaymentStartDate,
      blueReturnApplicableFiscalYearLabel,
      taxOfficeJurisdiction,
      prefecturalTaxOfficeJurisdiction,
      municipalOfficeJurisdiction,
    ]
  );

  const bundle = useMemo(() => buildCorporateEstablishmentNotificationBundle(bundleInputs), [bundleInputs]);

  const documents: CorporateEstablishmentNotificationDocumentDraft[] = [
    bundle.taxOfficeNotification,
    bundle.prefecturalNotification,
    bundle.municipalNotification,
    bundle.blueReturnApplication,
    ...(bundle.salaryPayerOfficeNotification ? [bundle.salaryPayerOfficeNotification] : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="print:hidden flex flex-col gap-6 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">法人の基本情報</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="cen-company-name">
                法人名
              </label>
              <input
                id="cen-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="例：サンプル株式会社"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-company-kana">
                フリガナ
              </label>
              <input
                id="cen-company-kana"
                type="text"
                value={companyNameKana}
                onChange={(e) => setCompanyNameKana(e.target.value)}
                placeholder="例：サンプルカブシキガイシャ"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-head-office-address">
                本店所在地
              </label>
              <input
                id="cen-head-office-address"
                type="text"
                value={headOfficeAddress}
                onChange={(e) => setHeadOfficeAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-establishment-date">
                設立年月日
              </label>
              <input
                id="cen-establishment-date"
                type="text"
                value={establishmentDate}
                onChange={(e) => setEstablishmentDate(e.target.value)}
                placeholder="例：2026年8月1日"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-representative-name">
                代表者氏名
              </label>
              <input
                id="cen-representative-name"
                type="text"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-representative-address">
                代表者住所
              </label>
              <input
                id="cen-representative-address"
                type="text"
                value={representativeAddress}
                onChange={(e) => setRepresentativeAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">事業年度・資本金・事業目的</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="cen-fiscal-year-start">
                事業年度の開始月
              </label>
              <select
                id="cen-fiscal-year-start"
                value={fiscalYearStartMonth}
                onChange={(e) => setFiscalYearStartMonth(e.target.value)}
                className={inputClass}
              >
                <option value="">選択してください</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-fiscal-year-end">
                事業年度の終了月
              </label>
              <select
                id="cen-fiscal-year-end"
                value={fiscalYearEndMonth}
                onChange={(e) => setFiscalYearEndMonth(e.target.value)}
                className={inputClass}
              >
                <option value="">選択してください</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-capital">
                資本金の額（円）
              </label>
              <input
                id="cen-capital"
                type="number"
                min="0"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="例：1000000"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="cen-business-purpose">
                事業目的の概要
              </label>
              <textarea
                id="cen-business-purpose"
                value={businessPurpose}
                onChange={(e) => setBusinessPurpose(e.target.value)}
                placeholder="例：ソフトウェアの企画・開発及び販売"
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">支店・出張所等</h2>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={hasBranches} onChange={(e) => setHasBranches(e.target.checked)} />
            支店・出張所等がある
          </label>
          {hasBranches && (
            <div>
              <label className={labelClass} htmlFor="cen-branch-details">
                支店等の所在地等（任意）
              </label>
              <input
                id="cen-branch-details"
                type="text"
                value={branchDetails}
                onChange={(e) => setBranchDetails(e.target.value)}
                placeholder="例：大阪府大阪市…"
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">従業員の雇用（代表者本人への役員報酬のみの場合を含む）</h2>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={willEmployStaff}
              onChange={(e) => setWillEmployStaff(e.target.checked)}
            />
            従業員を雇用する（代表者本人への役員報酬の支払いのみの場合を含む）
          </label>
          {willEmployStaff && (
            <div>
              <label className={labelClass} htmlFor="cen-salary-start-date">
                給与支払開始予定日
              </label>
              <input
                id="cen-salary-start-date"
                type="text"
                value={salaryPaymentStartDate}
                onChange={(e) => setSalaryPaymentStartDate(e.target.value)}
                placeholder="例：2026年9月25日"
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">青色申告の承認申請</h2>
          <label className={labelClass} htmlFor="cen-blue-return-fiscal-year">
            青色申告の承認を受けようとする事業年度
          </label>
          <input
            id="cen-blue-return-fiscal-year"
            type="text"
            value={blueReturnApplicableFiscalYearLabel}
            onChange={(e) => setBlueReturnApplicableFiscalYearLabel(e.target.value)}
            placeholder="例：第1期（2026年8月1日〜2027年7月31日）"
            className={inputClass}
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">提出先（ご自身でご確認のうえ入力してください）</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass} htmlFor="cen-tax-office">
                提出先税務署
              </label>
              <input
                id="cen-tax-office"
                type="text"
                value={taxOfficeJurisdiction}
                onChange={(e) => setTaxOfficeJurisdiction(e.target.value)}
                placeholder="例：〇〇税務署"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-prefectural-office">
                提出先都道府県税事務所
              </label>
              <input
                id="cen-prefectural-office"
                type="text"
                value={prefecturalTaxOfficeJurisdiction}
                onChange={(e) => setPrefecturalTaxOfficeJurisdiction(e.target.value)}
                placeholder="例：〇〇都税事務所"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cen-municipal-office">
                提出先市区町村役場
              </label>
              <input
                id="cen-municipal-office"
                type="text"
                value={municipalOfficeJurisdiction}
                onChange={(e) => setMunicipalOfficeJurisdiction(e.target.value)}
                placeholder="例：〇〇区役所"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="print:hidden flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-100"
        >
          印刷 / PDFで保存
        </button>
      </div>

      <div className="flex flex-col gap-10 print:gap-0">
        {documents.map((doc, i) => (
          <div key={`${doc.documentTitle}-${doc.destinationKindLabel}`} className={i > 0 ? "print:break-before-page" : ""}>
            <DocumentPreview doc={doc} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentPreview({ doc }: { doc: CorporateEstablishmentNotificationDocumentDraft }) {
  const isComplete = doc.warnings.length === 0;

  return (
    <section className="flex flex-col gap-4 print:break-inside-avoid">
      <div>
        <h2 className="text-lg font-semibold">{doc.documentTitle}</h2>
        <p className="text-xs text-stone-500">提出先の種類：{doc.destinationKindLabel}</p>
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
        <span className="text-sm text-stone-700">下書きです。提出はご自身の責任で行ってください。</span>
      </div>

      {doc.warnings.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800 print:hidden">
          <p className="font-semibold mb-1">未入力・要確認の項目</p>
          <ul className="list-disc list-inside space-y-1">
            {doc.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-stone-300 bg-white divide-y divide-stone-200">
        {doc.sections.map((section) => (
          <div key={section.title} className="p-4">
            <h3 className="text-sm font-semibold text-stone-700 mb-2">{section.title}</h3>
            <dl className="text-sm space-y-1">
              {section.fields.map((field) => (
                <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-stone-500 sm:w-72 shrink-0">{field.label}</dt>
                  <dd className="text-stone-900">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {doc.notes.length > 0 && (
        <div className="print:hidden">
          <h3 className="text-sm font-semibold mb-2 text-stone-700">留意事項</h3>
          <ul className="text-xs text-stone-600 leading-relaxed list-disc list-inside space-y-1">
            {doc.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="print:hidden">
        <h3 className="text-sm font-semibold mb-2 text-stone-700">前提・注意事項</h3>
        <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
          {doc.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-amber-700 leading-relaxed">{doc.disclaimer}</p>
    </section>
  );
}
