"use client";

import { useId, useState } from "react";
import { AccountRow } from "@/lib/db/supabaseClient";

// ------------------------------------------------------------------
// 固定資産・借入金の登録フォームが使う、勘定科目の選択（または新規作成）コンポーネント。
// fixed_assets.asset_account_id等は accounts への外部キーのため、これらのフォームで
// 参照する勘定科目が1つも無い新規テナントでも投入できるよう、
// 選択肢に無ければその場で作成できるようにしている。
// ------------------------------------------------------------------

const NEW_ACCOUNT_VALUE = "__new__";

const selectClass =
  "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const inputClass = selectClass;
const errorTextClass = "mt-1 text-xs text-red-700";

export interface AccountSelectProps {
  label: string;
  accounts: AccountRow[];
  value: string;
  onChange: (accountId: string) => void;
  /** 新規勘定科目名を受け取り、作成した AccountRow を返す（呼び出し元が createAccount を実行する） */
  onCreate: (name: string) => Promise<AccountRow>;
  error?: string;
  disabled?: boolean;
}

export function AccountSelect({ label, accounts, value, onChange, onCreate, error, disabled }: AccountSelectProps) {
  const selectId = useId();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("勘定科目名を入力してください");
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    try {
      const account = await onCreate(name);
      onChange(account.id);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "勘定科目の作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500" htmlFor={selectId}>
      {label}
      {!creating ? (
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === NEW_ACCOUNT_VALUE) {
              setCreating(true);
              return;
            }
            onChange(e.target.value);
          }}
          className={selectClass}
        >
          <option value="">選択してください</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value={NEW_ACCOUNT_VALUE}>＋ 新しい勘定科目を追加</option>
        </select>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 工具器具備品"
              className={inputClass}
              disabled={submitting}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="whitespace-nowrap text-xs px-3 py-2 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "作成中…" : "作成"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setCreateError(null);
              }}
              disabled={submitting}
              className="whitespace-nowrap text-xs px-3 py-2 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
            >
              取消
            </button>
          </div>
          {createError && <span className={errorTextClass}>{createError}</span>}
        </div>
      )}
      {error && <span className={errorTextClass}>{error}</span>}
    </label>
  );
}
