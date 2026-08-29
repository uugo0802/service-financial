"use client";

import { useState } from "react";
import { AccountRow } from "@/lib/db/supabaseClient";
import {
  EMPTY_LOAN_DRAFT,
  LoanDraft,
  LoanFieldErrors,
  NewLoanInput,
  draftToLoanInput,
  hasLoanErrors,
  validateLoanDraft,
} from "@/lib/db/loans";
import { AccountSelect } from "./AccountSelect";

interface LoanFormProps {
  liabilityAccounts: AccountRow[];
  expenseAccounts: AccountRow[];
  onCreateAccount: (name: string, accountType: AccountRow["account_type"]) => Promise<AccountRow>;
  onSubmit: (input: NewLoanInput) => Promise<void>;
}

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "flex flex-col gap-1 text-xs text-muted-foreground";
const errorTextClass = "mt-1 text-xs text-red-700";

export function LoanForm({ liabilityAccounts, expenseAccounts, onCreateAccount, onSubmit }: LoanFormProps) {
  const [draft, setDraft] = useState<LoanDraft>(EMPTY_LOAN_DRAFT);
  const [errors, setErrors] = useState<LoanFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof LoanDraft>(key: K, value: LoanDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateLoanDraft(draft);
    if (hasLoanErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(draftToLoanInput(draft));
      setDraft(EMPTY_LOAN_DRAFT);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border bg-surface p-5 flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={labelClass}>
          借入先・借入名
          <input
            type="text"
            placeholder="例: 日本政策金融公庫 運転資金"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
          {errors.name && <span className={errorTextClass}>{errors.name}</span>}
        </label>

        <label className={labelClass}>
          借入日
          <input type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} />
          {errors.startDate && <span className={errorTextClass}>{errors.startDate}</span>}
        </label>

        <label className={labelClass}>
          借入元本（円）
          <input
            type="number"
            min="0"
            value={draft.principalAmount}
            onChange={(e) => set("principalAmount", e.target.value)}
            className={inputClass}
          />
          {errors.principalAmount && <span className={errorTextClass}>{errors.principalAmount}</span>}
        </label>

        <label className={labelClass}>
          年利率（%）
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="例: 1.75"
            value={draft.interestRatePercent}
            onChange={(e) => set("interestRatePercent", e.target.value)}
            className={inputClass}
          />
          {errors.interestRatePercent && <span className={errorTextClass}>{errors.interestRatePercent}</span>}
        </label>

        <label className={labelClass}>
          返済期間（月数）
          <input
            type="number"
            min="1"
            step="1"
            value={draft.termMonths}
            onChange={(e) => set("termMonths", e.target.value)}
            className={inputClass}
          />
          {errors.termMonths && <span className={errorTextClass}>{errors.termMonths}</span>}
        </label>

        <label className={labelClass}>
          返済方式
          <select value={draft.repaymentType} onChange={(e) => set("repaymentType", e.target.value as LoanDraft["repaymentType"])} className={inputClass}>
            <option value="equal-principal">元金均等</option>
            <option value="equal-payment">元利均等</option>
          </select>
        </label>

        <AccountSelect
          label="負債側の勘定科目"
          accounts={liabilityAccounts}
          value={draft.liabilityAccountId}
          onChange={(id) => set("liabilityAccountId", id)}
          onCreate={(name) => onCreateAccount(name, "liability")}
          error={errors.liabilityAccountId}
        />

        <AccountSelect
          label="支払利息の勘定科目"
          accounts={expenseAccounts}
          value={draft.interestExpenseAccountId}
          onChange={(id) => set("interestExpenseAccountId", id)}
          onCreate={(name) => onCreateAccount(name, "expense")}
          error={errors.interestExpenseAccountId}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {submitting ? "登録中…" : "借入金を登録"}
        </button>
        {submitError && <span className="text-xs text-red-700">{submitError}</span>}
      </div>
    </form>
  );
}
