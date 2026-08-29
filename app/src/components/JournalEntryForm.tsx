"use client";

import { useState } from "react";
import { TAX_CATEGORIES } from "@/lib/categorize/dictionary";
import {
  JournalEntryDraft,
  JournalEntryFieldErrors,
  hasJournalEntryErrors,
  validateJournalEntryDraft,
} from "@/lib/journal/entries";

interface JournalEntryFormProps {
  mode: "create" | "edit";
  initialDraft: JournalEntryDraft;
  onSubmit: (draft: JournalEntryDraft) => void;
  onCancel?: () => void;
}

const inputClass =
  "w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40";
const errorTextClass = "mt-1 text-xs text-red-700";

export function JournalEntryForm({ mode, initialDraft, onSubmit, onCancel }: JournalEntryFormProps) {
  const [draft, setDraft] = useState<JournalEntryDraft>(initialDraft);
  const [errors, setErrors] = useState<JournalEntryFieldErrors>({});

  function set<K extends keyof JournalEntryDraft>(key: K, value: JournalEntryDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateJournalEntryDraft(draft);
    if (hasJournalEntryErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(draft);
    if (mode === "create") {
      setDraft(initialDraft);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border bg-surface p-5 flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          日付
          <input
            type="date"
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
            className={inputClass}
          />
          {errors.date && <span className={errorTextClass}>{errors.date}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          金額（収入は正、支出は負の数値）
          <input
            type="text"
            inputMode="decimal"
            placeholder="例: -3000"
            value={draft.amount}
            onChange={(e) => set("amount", e.target.value)}
            className={inputClass}
          />
          {errors.amount && <span className={errorTextClass}>{errors.amount}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          摘要
          <input
            type="text"
            placeholder="例: 事務用品購入"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            className={inputClass}
          />
          {errors.description && <span className={errorTextClass}>{errors.description}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          勘定科目
          <input
            type="text"
            placeholder="例: 消耗品費"
            value={draft.account}
            onChange={(e) => set("account", e.target.value)}
            className={inputClass}
          />
          {errors.account && <span className={errorTextClass}>{errors.account}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          消費税区分
          <select
            value={draft.taxCategory}
            onChange={(e) => set("taxCategory", e.target.value as JournalEntryDraft["taxCategory"])}
            className={inputClass}
          >
            {TAX_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {errors.taxCategory && <span className={errorTextClass}>{errors.taxCategory}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          メモ（任意）
          <input
            type="text"
            placeholder="根拠や補足があれば入力"
            value={draft.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="text-sm px-5 py-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-colors"
        >
          {mode === "create" ? "仕訳を追加" : "変更を保存"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-5 py-2.5 border border-border bg-surface hover:border-foreground/40 transition-colors"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
