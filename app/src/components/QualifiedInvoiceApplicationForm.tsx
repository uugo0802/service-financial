"use client";

// 「適格請求書発行事業者の登録申請書」の下書き作成フォーム。
//
// まだインボイス登録番号を取得していない事業者（個人事業主・法人）が、基本情報
// （事業者区分・氏名又は名称・納税地・提出先税務署・免税事業者からの選択の有無・
// 登録希望日）を入力すると、申請書の下書きデータのプレビューを表示する。
//
// 実際の計算・組み立ては buildInvoiceRegistrationApplicationDraft
// （invoiceRegistrationApplicationForm.ts）という純粋関数に委譲し、
// このコンポーネントはフォーム状態の管理と表示のみを担う。
//
// 名前について: 既存の InvoiceNumberValidator.tsx は「既に取得した登録番号」の
// 形式検証コンポーネントであり、本コンポーネントとは別物（これから登録申請する
// 事業者向けの下書き作成）のため、意図的に別名にしている。

import { useMemo, useState } from "react";
import {
  InvoiceRegistrationApplicationDraft,
  InvoiceRegistrationEntityType,
  buildInvoiceRegistrationApplicationDraft,
} from "@/lib/tax/invoiceRegistrationApplicationForm";

const inputClass = "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "block text-xs text-muted-foreground mb-1";

export function QualifiedInvoiceApplicationForm() {
  const [entityType, setEntityType] = useState<InvoiceRegistrationEntityType>("individual");
  const [name, setName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [address, setAddress] = useState("");
  const [taxOfficeJurisdiction, setTaxOfficeJurisdiction] = useState("");
  const [isTaxExemptElectingTaxableStatus, setIsTaxExemptElectingTaxableStatus] = useState(false);
  const [desiredEffectiveDatePreference, setDesiredEffectiveDatePreference] = useState("");

  const draft: InvoiceRegistrationApplicationDraft = useMemo(
    () =>
      buildInvoiceRegistrationApplicationDraft({
        entityType,
        name,
        representativeName: representativeName.trim() || undefined,
        address,
        taxOfficeJurisdiction,
        isTaxExemptElectingTaxableStatus,
        desiredEffectiveDatePreference: desiredEffectiveDatePreference.trim() || undefined,
      }),
    [
      entityType,
      name,
      representativeName,
      address,
      taxOfficeJurisdiction,
      isTaxExemptElectingTaxableStatus,
      desiredEffectiveDatePreference,
    ]
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass}>事業者区分</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="invoice-app-entity-type"
                checked={entityType === "individual"}
                onChange={() => setEntityType("individual")}
              />
              個人事業者
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="invoice-app-entity-type"
                checked={entityType === "corporation"}
                onChange={() => setEntityType("corporation")}
              />
              法人
            </label>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="invoice-app-name">
              氏名又は名称
            </label>
            <input
              id="invoice-app-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "corporation" ? "例：サンプル株式会社" : "例：山田 太郎"}
              className={inputClass}
            />
          </div>
          {entityType === "corporation" && (
            <div>
              <label className={labelClass} htmlFor="invoice-app-representative-name">
                代表者氏名
              </label>
              <input
                id="invoice-app-representative-name"
                type="text"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="invoice-app-address">
              納税地（住所又は所在地）
            </label>
            <input
              id="invoice-app-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例：東京都〇〇区…"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="invoice-app-tax-office">
              提出先税務署
            </label>
            <input
              id="invoice-app-tax-office"
              type="text"
              value={taxOfficeJurisdiction}
              onChange={(e) => setTaxOfficeJurisdiction(e.target.value)}
              placeholder="例：〇〇税務署（納税地を所轄する税務署をご自身でご確認ください）"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isTaxExemptElectingTaxableStatus}
              onChange={(e) => setIsTaxExemptElectingTaxableStatus(e.target.checked)}
            />
            申請時点で免税事業者であり、この登録を機に課税事業者となることを選択する
          </label>
        </div>

        <div>
          <label className={labelClass} htmlFor="invoice-app-effective-date">
            登録を受けようとする年月日（希望、任意）
          </label>
          <input
            id="invoice-app-effective-date"
            type="text"
            value={desiredEffectiveDatePreference}
            onChange={(e) => setDesiredEffectiveDatePreference(e.target.value)}
            placeholder="例：2027年1月1日、できるだけ早く 等"
            className={inputClass}
          />
        </div>
      </section>

      <QualifiedInvoiceApplicationPreview draft={draft} />
    </div>
  );
}

function QualifiedInvoiceApplicationPreview({ draft }: { draft: InvoiceRegistrationApplicationDraft }) {
  const isComplete = draft.warnings.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">下書きプレビュー</h2>

      <div
        className={`border rounded-lg p-4 flex items-center gap-3 ${
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
        <span className="text-sm text-foreground">{draft.entityTypeLabel}として下書きを作成しています</span>
      </div>

      {draft.warnings.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">未入力・要確認の項目</p>
          <ul className="list-disc list-inside space-y-1">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-border bg-surface divide-y divide-border">
        {draft.sections.map((section) => (
          <div key={section.title} className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">{section.title}</h3>
            <dl className="text-sm space-y-1">
              {section.fields.map((field) => (
                <div key={field.label} className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-muted-foreground sm:w-72 shrink-0">{field.label}</dt>
                  <dd className="text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {draft.notes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-foreground">留意事項</h3>
          <ul className="text-xs text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
            {draft.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">前提・注意事項</h3>
        <ul className="text-xs text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
          {draft.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-amber-700 leading-relaxed">{draft.disclaimer}</p>
    </section>
  );
}
