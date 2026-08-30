"use client";

import { useState } from "react";
import {
  AdvisorReferralFormErrors,
  AdvisorReferralFormValues,
  CONSULTATION_TOPICS,
  EMPTY_ADVISOR_REFERRAL_FORM,
  isAdvisorReferralFormValid,
  submitAdvisorReferralForm,
  validateAdvisorReferralForm,
} from "@/lib/advisorReferral/referralForm";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

export function AdvisorReferralForm() {
  const [values, setValues] = useState<AdvisorReferralFormValues>(EMPTY_ADVISOR_REFERRAL_FORM);
  const [errors, setErrors] = useState<AdvisorReferralFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof AdvisorReferralFormValues>(key: K, value: AdvisorReferralFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validateAdvisorReferralForm(values);
    setErrors(nextErrors);
    if (!isAdvisorReferralFormValid(nextErrors)) return;

    setSubmitting(true);
    try {
      await submitAdvisorReferralForm(values);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border border-emerald-700 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="font-semibold mb-1">お申し込みを受け付けました。</p>
        <p>
          内容を確認のうえ、提携税理士事務所より担当者宛にご連絡いたします（通常2〜3営業日以内）。
          この時点ではまだ有償契約は発生しません。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="advisor-name">
          お名前・法人名
        </label>
        <input
          id="advisor-name"
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
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="advisor-email">
            メールアドレス
          </label>
          <input
            id="advisor-email"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
            aria-invalid={!!errors.email}
          />
          <FieldError message={errors.email} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1" htmlFor="advisor-phone">
            電話番号（任意）
          </label>
          <input
            id="advisor-phone"
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
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="advisor-topic">
          相談したい内容
        </label>
        <select
          id="advisor-topic"
          value={values.topic}
          onChange={(e) => update("topic", e.target.value as AdvisorReferralFormValues["topic"])}
          className="w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground/40"
          aria-invalid={!!errors.topic}
        >
          <option value="">選択してください</option>
          {CONSULTATION_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <FieldError message={errors.topic} />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1" htmlFor="advisor-message">
          相談内容の詳細
        </label>
        <textarea
          id="advisor-message"
          rows={5}
          value={values.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="現在の状況、不安な点、確認してほしいことなどをできるだけ具体的にご記入ください。"
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
            入力内容が紹介先の提携税理士事務所へ共有されること、および本サービス自体は個別の税務相談を行わないことに同意します。
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
            : "border-accent bg-accent text-white hover:opacity-90"
        }`}
      >
        {submitting ? "送信中…" : "提携税理士への紹介を申し込む"}
      </button>
    </form>
  );
}
