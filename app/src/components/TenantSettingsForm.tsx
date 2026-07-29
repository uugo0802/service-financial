"use client";

import { useState } from "react";
import {
  TenantProfileDraft,
  TenantProfileFieldErrors,
  hasTenantProfileErrors,
  validateTenantProfileDraft,
} from "@/lib/db/tenants";

interface TenantSettingsFormProps {
  initialDraft: TenantProfileDraft;
  onSubmit: (draft: TenantProfileDraft) => void;
}

const inputClass =
  "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500";
const errorTextClass = "mt-1 text-xs text-red-700";

const FISCAL_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export function TenantSettingsForm({ initialDraft, onSubmit }: TenantSettingsFormProps) {
  const [draft, setDraft] = useState<TenantProfileDraft>(initialDraft);
  const [errors, setErrors] = useState<TenantProfileFieldErrors>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function set<K extends keyof TenantProfileDraft>(key: K, value: TenantProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateTenantProfileDraft(draft);
    if (hasTenantProfileErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(draft);
    setSavedAt(new Date());
  }

  return (
    <form onSubmit={handleSubmit} className="border border-stone-300 bg-white p-5 flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={labelClass}>
          事業形態
          <select
            value={draft.entityType}
            onChange={(e) => set("entityType", e.target.value as TenantProfileDraft["entityType"])}
            className={inputClass}
          >
            <option value="individual">個人事業主</option>
            <option value="corp">マイクロ法人</option>
          </select>
        </label>

        <label className={labelClass}>
          屋号・会社名
          <input
            type="text"
            placeholder="例: 今ごえん合同会社"
            value={draft.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            className={inputClass}
          />
          {errors.displayName && <span className={errorTextClass}>{errors.displayName}</span>}
        </label>

        {draft.entityType === "corp" && (
          <label className={labelClass}>
            決算月
            <select
              value={draft.fiscalYearEndMonth}
              onChange={(e) => set("fiscalYearEndMonth", e.target.value)}
              className={inputClass}
            >
              <option value="">選択してください</option>
              {FISCAL_MONTH_OPTIONS.map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
            {errors.fiscalYearEndMonth && <span className={errorTextClass}>{errors.fiscalYearEndMonth}</span>}
          </label>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={draft.blueReturn}
          onChange={(e) => set("blueReturn", e.target.checked)}
          className="mt-0.5"
        />
        <span>
          青色申告の承認を受けている
          <span className="block text-xs text-stone-400 mt-0.5">
            税額の概算シミュレーションにおける青色申告特別控除の適用有無に反映されます。実際の税務署への届出・承認状況と異なる場合は、必ずご自身でご確認のうえ変更してください。
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
        >
          設定を保存
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-700">保存しました（{savedAt.toLocaleTimeString("ja-JP")}）</span>
        )}
      </div>
    </form>
  );
}
