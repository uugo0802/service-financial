"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

import { useMemo, useState } from "react";
import { TagBreakdownPanel } from "@/components/TagBreakdownPanel";
import {
  DEFAULT_MATERIALITY_THRESHOLD,
  Tag,
  TagAssignment,
  TaggableTransaction,
  addTag,
  assignTag,
  computeTagProfitability,
  findUntaggedAboveThreshold,
  hasTagFieldErrors,
  removeTagAndAssignments,
  renameTag,
  tagIdsForTransaction,
  unassignTag,
  validateTagLabel,
} from "@/lib/tags/tagging";

// RecurringEntryManager.tsx（app/src/components/）と同じ「フォームのバリデーション →
// リストへの純粋な追加/削除 → 画面state更新」という流儀に合わせたクライアント側の
// タグ管理コンポーネント。取引データ自体は親（page.tsx）からサンプルとして渡され、
// タグ・紐付け（TagAssignment）のみをこのコンポーネントのstateで保持する。

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const inputClass =
  "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const errorTextClass = "mt-1 text-xs text-red-700";

// タグ作成時にユーザーが選べる配色の候補（既存ダッシュボードのカテゴリカルパレット
// (ExpenseBreakdownChart.tsx) と同じ配色メソッドの並びを踏襲し、視認性の高い色に絞る）。
const TAG_COLOR_CHOICES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

export interface TagManagerClientProps {
  initialTags: Tag[];
  initialAssignments: TagAssignment[];
  transactions: TaggableTransaction[];
}

export function TagManagerClient({ initialTags, initialAssignments, transactions }: TagManagerClientProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [assignments, setAssignments] = useState<TagAssignment[]>(initialAssignments);

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLOR_CHOICES[0]);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editError, setEditError] = useState<string | undefined>(undefined);

  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_MATERIALITY_THRESHOLD));

  const profitability = useMemo(() => computeTagProfitability(tags, assignments, transactions), [tags, assignments, transactions]);

  const threshold = Number(thresholdInput);
  const validThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_MATERIALITY_THRESHOLD;
  const untagged = useMemo(
    () => findUntaggedAboveThreshold(transactions, assignments, validThreshold),
    [transactions, assignments, validThreshold]
  );

  function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateTagLabel(newLabel, tags);
    if (hasTagFieldErrors(errors)) {
      setCreateError(errors.label);
      return;
    }
    setCreateError(undefined);
    setTags((prev) => addTag(prev, { label: newLabel, color: newColor }));
    setNewLabel("");
  }

  function startEditing(tag: Tag) {
    setEditingTagId(tag.id);
    setEditingLabel(tag.label);
    setEditError(undefined);
  }

  function cancelEditing() {
    setEditingTagId(null);
    setEditingLabel("");
    setEditError(undefined);
  }

  function handleRenameTag(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTagId) return;
    const errors = validateTagLabel(editingLabel, tags, editingTagId);
    if (hasTagFieldErrors(errors)) {
      setEditError(errors.label);
      return;
    }
    setTags((prev) => renameTag(prev, editingTagId, editingLabel));
    cancelEditing();
  }

  function handleDeleteTag(tagId: string) {
    const result = removeTagAndAssignments(tags, assignments, tagId);
    setTags(result.tags);
    setAssignments(result.assignments);
    if (editingTagId === tagId) cancelEditing();
  }

  function handleToggleAssignment(tagId: string, transactionId: string, checked: boolean) {
    setAssignments((prev) => (checked ? assignTag(prev, tagId, transactionId) : unassignTag(prev, tagId, transactionId)));
  }

  return (
    <div className="flex flex-col gap-8">
      {/* タグ管理: 作成・改名・削除 */}
      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-stone-800">タグを管理する</h2>
        <p className="text-xs text-stone-500 leading-relaxed">
          クライアント名・案件名など、収益性を追いたい単位でタグを作成し、下の取引一覧でタグを付けてください。
        </p>

        <form onSubmit={handleCreateTag} className="flex flex-wrap items-end gap-3" noValidate>
          <label className="flex flex-col gap-1 text-xs text-stone-500 flex-1 min-w-[10rem]">
            新しいタグ名
            <input
              type="text"
              placeholder="例: A社案件"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={inputClass}
            />
            {createError && <span className={errorTextClass}>{createError}</span>}
          </label>

          <div className="flex flex-col gap-1 text-xs text-stone-500">
            色
            <div className="flex gap-1.5 items-center py-2">
              {TAG_COLOR_CHOICES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`色を${color}にする`}
                  aria-pressed={newColor === color}
                  onClick={() => setNewColor(color)}
                  className="w-5 h-5 rounded-full border"
                  style={{ background: color, borderColor: newColor === color ? "#171717" : "transparent" }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
          >
            タグを追加
          </button>
        </form>

        {tags.length === 0 ? (
          <p className="text-sm text-stone-500">まだタグが登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-3 border-b border-stone-100 pb-2 last:border-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tag.color ?? "#898781" }} />
                {editingTagId === tag.id ? (
                  <form onSubmit={handleRenameTag} className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className={inputClass}
                      autoFocus
                    />
                    <button type="submit" className="text-xs text-stone-700 underline hover:text-stone-900 shrink-0">
                      保存
                    </button>
                    <button type="button" onClick={cancelEditing} className="text-xs text-stone-500 underline hover:text-stone-700 shrink-0">
                      キャンセル
                    </button>
                    {editError && <span className={errorTextClass}>{editError}</span>}
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-stone-800">{tag.label}</span>
                    <button
                      type="button"
                      onClick={() => startEditing(tag)}
                      className="text-xs text-stone-600 underline hover:text-stone-900"
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(tag.id)}
                      className="text-xs text-red-700 underline hover:text-red-900"
                    >
                      削除
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 収益性サマリー */}
      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-stone-800">タグ別 収益性サマリー</h2>
        <TagBreakdownPanel rows={profitability} />
      </section>

      {/* 未タグ付けの重要な取引へのナッジ */}
      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-stone-800">タグ未設定の主要な取引</h2>
          <label className="flex items-center gap-2 text-xs text-stone-500">
            重要性の閾値（この金額以上の未タグ取引を表示）
            <input
              type="text"
              inputMode="numeric"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-28 border border-stone-400 bg-white px-2 py-1 text-sm outline-none focus:border-stone-600"
            />
            円
          </label>
        </div>

        {untagged.length === 0 ? (
          <p className="text-sm text-stone-500">閾値以上の未タグ付け取引はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {untagged.map((tx) => (
              <li key={tx.id} className="flex justify-between border-b border-stone-100 py-1.5 last:border-0">
                <span className="text-stone-700">
                  {tx.date} {tx.description}
                </span>
                <span className="tabular-nums text-stone-600">{yen.format(tx.amount)}円</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 取引ごとのタグ付け */}
      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-stone-800">取引にタグを付ける</h2>
        {tags.length === 0 ? (
          <p className="text-sm text-stone-500">先にタグを1つ以上作成してください。</p>
        ) : (
          <TableScrollArea>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-left text-xs text-stone-500">
                  <th className="py-2 pr-4">日付</th>
                  <th className="py-2 pr-4">摘要</th>
                  <th className="py-2 pr-4 text-right">金額</th>
                  <th className="py-2">タグ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const assignedTagIds = new Set(tagIdsForTransaction(assignments, tx.id));
                  return (
                    <tr key={tx.id} className="border-b border-stone-100 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{tx.date}</td>
                      <td className="py-2 pr-4">{tx.description}</td>
                      <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">{yen.format(tx.amount)}円</td>
                      <td className="py-2 flex flex-wrap gap-x-3 gap-y-1">
                        {tags.map((tag) => {
                          const checked = assignedTagIds.has(tag.id);
                          return (
                            <label key={tag.id} className="flex items-center gap-1.5 text-xs text-stone-600 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => handleToggleAssignment(tag.id, tx.id, e.target.checked)}
                              />
                              {tag.label}
                            </label>
                          );
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollArea>
        )}
      </section>
    </div>
  );
}
