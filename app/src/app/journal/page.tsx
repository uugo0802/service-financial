"use client";

import { Fragment, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import {
  EMPTY_JOURNAL_DRAFT,
  JournalEntryDraft,
  addJournalEntry,
  removeJournalEntry,
  transactionToDraft,
  updateJournalEntry,
} from "@/lib/journal/entries";
import { JournalEntryForm } from "@/components/JournalEntryForm";
import { CategorizationRationale } from "@/components/CategorizationRationale";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; id: string };

export default function JournalPage() {
  const [entries, setEntries] = useState<CategorizedTransaction[]>([]);
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

  const editingEntry = formState.mode === "edit" ? entries.find((e) => e.id === formState.id) : undefined;

  function handleCreate(draft: JournalEntryDraft) {
    setEntries((prev) => addJournalEntry(prev, draft));
  }

  function handleUpdate(id: string) {
    return (draft: JournalEntryDraft) => {
      setEntries((prev) => updateJournalEntry(prev, id, draft));
      setFormState({ mode: "closed" });
    };
  }

  function handleDelete(id: string) {
    setEntries((prev) => removeJournalEntry(prev, id));
    if (formState.mode === "edit" && formState.id === id) {
      setFormState({ mode: "closed" });
    }
  }

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">仕訳の手入力</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">仕訳を手入力する</h1>
          <p className="text-sm text-stone-600 mb-4 max-w-2xl leading-relaxed">
            CSVアップロードに頼らず、現金取引やレシートのみの取引などを1件ずつ手入力で追加・編集・削除できます。
            <b>これは概算シミュレーションであり、正式な申告書ではありません。</b>
          </p>

          {formState.mode === "create" ? (
            <JournalEntryForm
              mode="create"
              initialDraft={EMPTY_JOURNAL_DRAFT}
              onSubmit={handleCreate}
              onCancel={() => setFormState({ mode: "closed" })}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFormState({ mode: "create" })}
              className="text-sm px-5 py-3 border border-stone-400 bg-white hover:border-red-700 transition-colors"
            >
              ＋ 仕訳を追加
            </button>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">
            入力済みの仕訳 {entries.length > 0 && <span className="text-sm font-normal text-stone-500">（{entries.length}件）</span>}
          </h2>

          {entries.length === 0 ? (
            <p className="text-sm text-stone-500 border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
              まだ仕訳がありません。上の「＋ 仕訳を追加」から入力してください。
            </p>
          ) : (
            <div className="overflow-x-auto border border-stone-300 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">日付</th>
                    <th className="px-3 py-2 font-normal">摘要</th>
                    <th className="px-3 py-2 font-normal text-right">金額</th>
                    <th className="px-3 py-2 font-normal">勘定科目</th>
                    <th className="px-3 py-2 font-normal">消費税区分</th>
                    <th className="px-3 py-2 font-normal">なぜこの仕訳？</th>
                    <th className="px-3 py-2 font-normal">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr className="border-b border-stone-100 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{entry.date}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={entry.description}>
                          {entry.description}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${entry.amount < 0 ? "text-stone-700" : "text-emerald-700"}`}>
                          {yen.format(entry.amount)}
                        </td>
                        <td className="px-3 py-2">{entry.account}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.taxCategory}</td>
                        <td className="px-3 py-2">
                          <CategorizationRationale transaction={entry} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setFormState(
                                formState.mode === "edit" && formState.id === entry.id
                                  ? { mode: "closed" }
                                  : { mode: "edit", id: entry.id }
                              )
                            }
                            className="text-xs text-stone-600 hover:text-red-700 mr-3"
                          >
                            {formState.mode === "edit" && formState.id === entry.id ? "閉じる" : "編集"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-700 hover:text-red-900"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                      {formState.mode === "edit" && formState.id === entry.id && editingEntry && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 bg-stone-50">
                            <JournalEntryForm
                              mode="edit"
                              initialDraft={transactionToDraft(editingEntry)}
                              onSubmit={handleUpdate(entry.id)}
                              onCancel={() => setFormState({ mode: "closed" })}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
