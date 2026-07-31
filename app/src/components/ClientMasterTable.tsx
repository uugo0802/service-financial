"use client";

import { useMemo, useState } from "react";
import {
  COUNTERPARTY_KIND_LABELS,
  COUNTERPARTY_KIND_OPTIONS,
  Counterparty,
  CounterpartyDraft,
  CounterpartyKind,
  EMPTY_COUNTERPARTY_DRAFT,
  counterpartyToDraft,
  createCounterparty,
  findDuplicateCounterparties,
  hasCounterpartyErrors,
  isDuplicateCounterpartyName,
  listCounterparties,
  updateCounterparty,
  validateCounterpartyDraft,
} from "@/lib/clients/clientMaster";

interface ClientMasterTableProps {
  initialRecords?: Counterparty[];
  /** 一覧が変化するたびに呼ばれる（永続化フックの接続用。省略可） */
  onChange?: (records: Counterparty[]) => void;
}

type KindFilter = CounterpartyKind | "all";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500";
const errorTextClass = "mt-1 text-xs text-red-700";

export function ClientMasterTable({ initialRecords = [], onChange }: ClientMasterTableProps) {
  const [records, setRecords] = useState<Counterparty[]>(initialRecords);
  const [draft, setDraft] = useState<CounterpartyDraft>(EMPTY_COUNTERPARTY_DRAFT);
  const [errors, setErrors] = useState<ReturnType<typeof validateCounterpartyDraft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  const filteredRecords = useMemo(
    () =>
      listCounterparties(records, {
        kind: kindFilter === "all" ? undefined : kindFilter,
        query,
      }),
    [records, kindFilter, query]
  );

  const duplicateGroups = useMemo(() => findDuplicateCounterparties(records), [records]);

  const draftLooksDuplicate = useMemo(
    () => isDuplicateCounterpartyName(records, draft.name, editingId ?? undefined),
    [records, draft.name, editingId]
  );

  function updateRecords(next: Counterparty[]) {
    setRecords(next);
    onChange?.(next);
  }

  function set<K extends keyof CounterpartyDraft>(key: K, value: CounterpartyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setDraft(EMPTY_COUNTERPARTY_DRAFT);
    setEditingId(null);
    setErrors({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateCounterpartyDraft(draft);
    if (hasCounterpartyErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    if (editingId) {
      const existing = records.find((r) => r.id === editingId);
      if (existing) {
        updateRecords(records.map((r) => (r.id === editingId ? updateCounterparty(existing, draft) : r)));
      }
    } else {
      updateRecords([...records, createCounterparty(draft)]);
    }

    resetForm();
  }

  function handleEdit(record: Counterparty) {
    setEditingId(record.id);
    setDraft(counterpartyToDraft(record));
    setErrors({});
  }

  function handleDelete(id: string) {
    updateRecords(records.filter((r) => r.id !== id));
    if (editingId === id) {
      resetForm();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {editingId ? "取引先を編集する" : "取引先を登録する"}
        </h2>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4"
          noValidate
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              取引先名
              <input
                type="text"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="例：株式会社サンプル商事"
                className={inputClass}
              />
              {errors.name && <span className={errorTextClass}>{errors.name}</span>}
              {!errors.name && draftLooksDuplicate && (
                <span className="mt-1 text-xs text-amber-700">
                  同じ名称（表記ゆれ含む）の取引先が既に登録されています。重複登録の可能性がないかご確認ください。
                </span>
              )}
            </label>

            <label className={labelClass}>
              種別
              <select
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value as CounterpartyKind)}
                className={inputClass}
              >
                {COUNTERPARTY_KIND_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {COUNTERPARTY_KIND_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              既定の勘定科目（任意）
              <input
                type="text"
                value={draft.defaultAccountName ?? ""}
                onChange={(e) => set("defaultAccountName", e.target.value)}
                placeholder="例：外注費"
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              インボイス登録番号（任意）
              <input
                type="text"
                value={draft.invoiceRegistrationNumber ?? ""}
                onChange={(e) => set("invoiceRegistrationNumber", e.target.value)}
                placeholder="例：T1234567890123"
                className={inputClass}
              />
              {errors.invoiceRegistrationNumber && (
                <span className={errorTextClass}>{errors.invoiceRegistrationNumber}</span>
              )}
            </label>

            <label className={`${labelClass} sm:col-span-2`}>
              メモ（任意）
              <input
                type="text"
                value={draft.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="例：月次契約、支払サイト翌月末など"
                className={inputClass}
              />
            </label>
          </div>

          <p className="text-xs text-stone-400 leading-relaxed">
            適格請求書発行事業者の登録番号は未登録・免税事業者の場合は空欄のままで構いません。番号を入力した場合は形式・チェックデジットのみを検証し、国税庁「適格請求書発行事業者公表サイト」での実在確認は別途行ってください。
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            >
              {editingId ? "変更を保存" : "取引先を追加"}
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

      {duplicateGroups.length > 0 && (
        <section className="border border-amber-300 bg-amber-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-amber-800 mb-1">
            表記ゆれの可能性がある重複登録（{duplicateGroups.length}件）
          </h2>
          <ul className="text-xs text-amber-800 leading-relaxed list-disc list-inside">
            {duplicateGroups.map((group) => (
              <li key={group.normalizedName}>
                {group.records.map((r) => r.name).join(" / ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">登録済みの取引先（{filteredRecords.length}件）</h2>
          <div className="flex items-center gap-3">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="border border-stone-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-stone-600"
            >
              <option value="all">すべての種別</option>
              {COUNTERPARTY_KIND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {COUNTERPARTY_KIND_LABELS[option]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名称・メモで検索"
              className="border border-stone-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-stone-600"
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <p className="text-sm text-stone-500">該当する取引先が登録されていません。</p>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">取引先名</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">種別</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">既定の勘定科目</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">インボイス登録番号</th>
                  <th className="px-3 py-2 font-normal">メモ</th>
                  <th className="px-3 py-2 font-normal print:hidden" />
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2">{record.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{COUNTERPARTY_KIND_LABELS[record.kind]}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-stone-600">
                      {record.defaultAccountName ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-stone-600">
                      {record.invoiceRegistrationNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-stone-500 max-w-[16rem]">{record.notes}</td>
                    <td className="px-3 py-2 print:hidden whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        className="text-xs text-stone-500 hover:text-stone-900 mr-3"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
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
