"use client";

import { useState } from "react";
import {
  EMPTY_PARTNER_REFERRAL_FORM,
  PARTNER_CATEGORIES,
  PartnerReferralFormErrors,
  PartnerReferralFormValues,
  isPartnerReferralFormValid,
  submitPartnerReferralForm,
  validatePartnerReferralForm,
} from "@/lib/partnerReferral/partnerReferral";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700 dark:text-red-400">{message}</p>;
}

export function PartnerReferralForm() {
  const [values, setValues] = useState<PartnerReferralFormValues>(EMPTY_PARTNER_REFERRAL_FORM);
  const [errors, setErrors] = useState<PartnerReferralFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof PartnerReferralFormValues>(key: K, value: PartnerReferralFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validatePartnerReferralForm(values);
    setErrors(nextErrors);
    if (!isPartnerReferralFormValid(nextErrors)) return;

    setSubmitting(true);
    try {
      await submitPartnerReferralForm(values);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border border-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-600 p-6 text-sm text-emerald-900 dark:text-emerald-100">
        <p className="font-semibold mb-1">お申し込みを受け付けました。</p>
        <p>
          内容を確認のうえ、提携先の担当者よりご連絡いたします（通常2〜3営業日以内）。
          この時点ではまだ契約は発生しません。契約・相談内容の詳細は提携先に直接ご確認ください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="partner-name">
          お名前・法人名
        </label>
        <input
          id="partner-name"
          type="text"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          aria-invalid={!!errors.name}
        />
        <FieldError message={errors.name} />
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="partner-email">
            メールアドレス
          </label>
          <input
            id="partner-email"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
            aria-invalid={!!errors.email}
          />
          <FieldError message={errors.email} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="partner-phone">
            電話番号（任意）
          </label>
          <input
            id="partner-phone"
            type="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="090-1234-5678"
            className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
            aria-invalid={!!errors.phone}
          />
          <FieldError message={errors.phone} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="partner-category">
          ご興味のあるカテゴリ
        </label>
        <select
          id="partner-category"
          value={values.category}
          onChange={(e) => update("category", e.target.value as PartnerReferralFormValues["category"])}
          className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          aria-invalid={!!errors.category}
        >
          <option value="">選択してください</option>
          {PARTNER_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.category} />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="partner-message">
          ご相談内容の詳細
        </label>
        <textarea
          id="partner-message"
          rows={5}
          value={values.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="現在の状況や、提携先に確認してほしいことなどをできるだけ具体的にご記入ください。"
          className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          aria-invalid={!!errors.message}
        />
        <FieldError message={errors.message} />
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.consent}
            onChange={(e) => update("consent", e.target.checked)}
            className="mt-0.5"
            aria-invalid={!!errors.consent}
          />
          <span>
            入力内容が紹介先の提携パートナーへ共有されること、および本サービス自体は投資助言・保険募集・金銭の貸付・不動産の媒介等を行わず、
            情報提供・送客のみを行うことに同意します。
          </span>
        </label>
        <FieldError message={errors.consent} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={`self-start text-sm px-6 py-3 border transition-colors ${
          submitting
            ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
            : "border-stone-900 dark:border-stone-50 bg-stone-900 dark:bg-stone-50 text-white dark:text-foreground hover:bg-stone-700 dark:hover:bg-stone-300"
        }`}
      >
        {submitting ? "送信中…" : "提携先への紹介を申し込む"}
      </button>
    </form>
  );
}
