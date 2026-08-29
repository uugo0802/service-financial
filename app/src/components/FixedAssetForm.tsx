"use client";

import { useState } from "react";
import { AccountRow } from "@/lib/db/supabaseClient";
import {
  EMPTY_FIXED_ASSET_DRAFT,
  FixedAssetDraft,
  FixedAssetFieldErrors,
  NewFixedAssetInput,
  draftToFixedAssetInput,
  hasFixedAssetErrors,
  validateFixedAssetDraft,
} from "@/lib/db/fixedAssets";
import { AccountSelect } from "./AccountSelect";

interface FixedAssetFormProps {
  assetAccounts: AccountRow[];
  expenseAccounts: AccountRow[];
  onCreateAccount: (name: string, accountType: AccountRow["account_type"]) => Promise<AccountRow>;
  onSubmit: (input: NewFixedAssetInput) => Promise<void>;
}

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const labelClass = "flex flex-col gap-1 text-xs text-muted-foreground";
const errorTextClass = "mt-1 text-xs text-red-700";

export function FixedAssetForm({ assetAccounts, expenseAccounts, onCreateAccount, onSubmit }: FixedAssetFormProps) {
  const [draft, setDraft] = useState<FixedAssetDraft>(EMPTY_FIXED_ASSET_DRAFT);
  const [errors, setErrors] = useState<FixedAssetFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof FixedAssetDraft>(key: K, value: FixedAssetDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateFixedAssetDraft(draft);
    if (hasFixedAssetErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(draftToFixedAssetInput(draft));
      setDraft(EMPTY_FIXED_ASSET_DRAFT);
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
          資産名
          <input
            type="text"
            placeholder="例: ノートパソコン"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
          {errors.name && <span className={errorTextClass}>{errors.name}</span>}
        </label>

        <label className={labelClass}>
          取得日
          <input type="date" value={draft.acquisitionDate} onChange={(e) => set("acquisitionDate", e.target.value)} className={inputClass} />
          {errors.acquisitionDate && <span className={errorTextClass}>{errors.acquisitionDate}</span>}
        </label>

        <label className={labelClass}>
          取得価額（円）
          <input
            type="number"
            min="0"
            value={draft.acquisitionCost}
            onChange={(e) => set("acquisitionCost", e.target.value)}
            className={inputClass}
          />
          {errors.acquisitionCost && <span className={errorTextClass}>{errors.acquisitionCost}</span>}
        </label>

        <label className={labelClass}>
          耐用年数（年）
          <input
            type="number"
            min="1"
            step="1"
            value={draft.usefulLifeYears}
            onChange={(e) => set("usefulLifeYears", e.target.value)}
            className={inputClass}
          />
          {errors.usefulLifeYears && <span className={errorTextClass}>{errors.usefulLifeYears}</span>}
        </label>

        <label className={labelClass}>
          償却方法
          <select value={draft.method} onChange={(e) => set("method", e.target.value as FixedAssetDraft["method"])} className={inputClass}>
            <option value="straight-line">定額法</option>
            <option value="declining-balance">定率法</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground sm:mt-5">
          <input type="checkbox" checked={draft.immediateExpensing} onChange={(e) => set("immediateExpensing", e.target.checked)} />
          少額減価償却資産の特例（取得年度に全額経費算入）
        </label>

        <AccountSelect
          label="資産側の勘定科目"
          accounts={assetAccounts}
          value={draft.assetAccountId}
          onChange={(id) => set("assetAccountId", id)}
          onCreate={(name) => onCreateAccount(name, "asset")}
          error={errors.assetAccountId}
        />

        <AccountSelect
          label="減価償却費の勘定科目"
          accounts={expenseAccounts}
          value={draft.depreciationExpenseAccountId}
          onChange={(id) => set("depreciationExpenseAccountId", id)}
          onCreate={(name) => onCreateAccount(name, "expense")}
          error={errors.depreciationExpenseAccountId}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {submitting ? "登録中…" : "固定資産を登録"}
        </button>
        {submitError && <span className="text-xs text-red-700">{submitError}</span>}
      </div>
    </form>
  );
}
