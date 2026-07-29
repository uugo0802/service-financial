"use client";

import { useState } from "react";
import {
  MIN_PATTERN_LENGTH,
  TAX_CATEGORY_OPTIONS,
  TaxCategory,
  UserCategoryRule,
  UserCategoryRuleDraft,
  createUserCategoryRule,
  hasUserCategoryRuleErrors,
  validateUserCategoryRuleDraft,
} from "@/lib/categorize/userRules";

interface CategorizeRuleEditorProps {
  initialRules?: UserCategoryRule[];
  /** ルール一覧が変化するたびに呼ばれる（永続化フックの接続用。省略可） */
  onChange?: (rules: UserCategoryRule[]) => void;
}

const EMPTY_DRAFT: UserCategoryRuleDraft = {
  pattern: "",
  account: "",
  taxCategory: TAX_CATEGORY_OPTIONS[0],
  note: "",
};

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500";
const errorTextClass = "mt-1 text-xs text-red-700";

function draftFromRule(rule: UserCategoryRule): UserCategoryRuleDraft {
  return {
    pattern: rule.pattern,
    account: rule.account,
    taxCategory: rule.taxCategory,
    note: rule.note ?? "",
  };
}

export function CategorizeRuleEditor({ initialRules = [], onChange }: CategorizeRuleEditorProps) {
  const [rules, setRules] = useState<UserCategoryRule[]>(initialRules);
  const [draft, setDraft] = useState<UserCategoryRuleDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<ReturnType<typeof validateUserCategoryRuleDraft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateRules(next: UserCategoryRule[]) {
    setRules(next);
    onChange?.(next);
  }

  function set<K extends keyof UserCategoryRuleDraft>(key: K, value: UserCategoryRuleDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setErrors({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateUserCategoryRuleDraft(draft);
    if (hasUserCategoryRuleErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    if (editingId) {
      updateRules(
        rules.map((rule) =>
          rule.id === editingId
            ? {
                ...rule,
                pattern: draft.pattern.trim(),
                account: draft.account.trim(),
                taxCategory: draft.taxCategory,
                note: draft.note?.trim() || undefined,
              }
            : rule
        )
      );
    } else {
      updateRules([...rules, createUserCategoryRule(draft)]);
    }

    resetForm();
  }

  function handleEdit(rule: UserCategoryRule) {
    setEditingId(rule.id);
    setDraft(draftFromRule(rule));
    setErrors({});
  }

  function handleDelete(id: string) {
    updateRules(rules.filter((rule) => rule.id !== id));
    if (editingId === id) {
      resetForm();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {editingId ? "ルールを編集する" : "ルールを追加する"}
        </h2>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4"
          noValidate
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              キーワード（摘要に含まれる文字列）
              <input
                type="text"
                value={draft.pattern}
                onChange={(e) => set("pattern", e.target.value)}
                placeholder="例：株式会社サンプル商事"
                className={inputClass}
              />
              {errors.pattern && <span className={errorTextClass}>{errors.pattern}</span>}
            </label>

            <label className={labelClass}>
              勘定科目
              <input
                type="text"
                value={draft.account}
                onChange={(e) => set("account", e.target.value)}
                placeholder="例：売上高"
                className={inputClass}
              />
              {errors.account && <span className={errorTextClass}>{errors.account}</span>}
            </label>

            <label className={labelClass}>
              税区分
              <select
                value={draft.taxCategory}
                onChange={(e) => set("taxCategory", e.target.value as TaxCategory)}
                className={inputClass}
              >
                {TAX_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.taxCategory && <span className={errorTextClass}>{errors.taxCategory}</span>}
            </label>

            <label className={labelClass}>
              メモ（任意）
              <input
                type="text"
                value={draft.note ?? ""}
                onChange={(e) => set("note", e.target.value)}
                placeholder="例：定期的な取引先"
                className={inputClass}
              />
            </label>
          </div>

          <p className="text-xs text-stone-400 leading-relaxed">
            誤判定を防ぐため、キーワードは{MIN_PATTERN_LENGTH}文字以上で入力してください。短い略称（例：社名の一部の1〜2文字）は無関係な取引にも一致してしまう恐れがあります。
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            >
              {editingId ? "変更を保存" : "ルールを追加"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm px-4 py-2 border border-stone-400 text-stone-600 hover:bg-stone-100 transition-colors"
              >
                キャンセル
              </button>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">登録済みのユーザー辞書ルール（{rules.length}件）</h2>
        <p className="text-xs text-stone-400 leading-relaxed mb-3">
          ここで登録したルールは、共通の分類辞書よりも優先して適用されます。同じ取引先・キーワードが共通辞書とユーザー辞書の両方にマッチする場合、ユーザー辞書のルールが採用されます。
        </p>
        {rules.length === 0 ? (
          <p className="text-sm text-stone-500">まだルールが登録されていません。上のフォームから追加してください。</p>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">キーワード</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">勘定科目</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">税区分</th>
                  <th className="px-3 py-2 font-normal">メモ</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">登録日</th>
                  <th className="px-3 py-2 font-normal print:hidden" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2">{rule.pattern}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{rule.account}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{rule.taxCategory}</td>
                    <td className="px-3 py-2 text-stone-500 max-w-[16rem]">{rule.note}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-stone-500">
                      {rule.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 print:hidden whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleEdit(rule)}
                        className="text-xs text-stone-500 hover:text-stone-900 mr-3"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        className="text-xs text-stone-400 hover:text-red-700"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
