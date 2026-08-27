"use client";

import { useState } from "react";
import {
  OpeningBalanceDraft,
  OpeningBalanceFieldErrors,
  hasOpeningBalanceErrors,
  validateOpeningBalanceDraft,
} from "@/lib/db/openingBalances";

interface OpeningBalanceFormProps {
  initialDraft: OpeningBalanceDraft;
  onSubmit: (draft: OpeningBalanceDraft) => Promise<void>;
}

const inputClass =
  "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500";
const errorTextClass = "mt-1 text-xs text-red-700";

export function OpeningBalanceForm({ initialDraft, onSubmit }: OpeningBalanceFormProps) {
  const [draft, setDraft] = useState<OpeningBalanceDraft>(initialDraft);
  const [errors, setErrors] = useState<OpeningBalanceFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function set<K extends keyof OpeningBalanceDraft>(key: K, value: OpeningBalanceDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateOpeningBalanceDraft(draft);
    if (hasOpeningBalanceErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(draft);
      setSavedAt(new Date());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-stone-300 bg-white p-5 flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className={labelClass}>
          期首日（前期末日）
          <input
            type="date"
            value={draft.asOfDate}
            onChange={(e) => set("asOfDate", e.target.value)}
            className={inputClass}
          />
          {errors.asOfDate && <span className={errorTextClass}>{errors.asOfDate}</span>}
        </label>

        <label className={labelClass}>
          期首現金・預金残高（円）
          <input
            type="number"
            min="0"
            value={draft.cashBalance}
            onChange={(e) => set("cashBalance", e.target.value)}
            className={inputClass}
          />
          {errors.cashBalance && <span className={errorTextClass}>{errors.cashBalance}</span>}
        </label>

        <label className={labelClass}>
          期首繰越利益剰余金（円）
          <input
            type="number"
            value={draft.retainedEarnings}
            onChange={(e) => set("retainedEarnings", e.target.value)}
            className={inputClass}
          />
          <span className="text-stone-400">繰越欠損金の場合はマイナスで入力してください。</span>
          {errors.retainedEarnings && <span className={errorTextClass}>{errors.retainedEarnings}</span>}
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:opacity-50"
        >
          {submitting ? "保存中…" : "期首残高を保存"}
        </button>
        {savedAt && <span className="text-xs text-emerald-700">保存しました（{savedAt.toLocaleTimeString("ja-JP")}）</span>}
        {submitError && <span className="text-xs text-red-700">{submitError}</span>}
      </div>
    </form>
  );
}
