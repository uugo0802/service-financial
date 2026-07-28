"use client";

import { useMemo, useState } from "react";
import { TAX_CATEGORIES } from "@/lib/categorize/dictionary";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import {
  EMPTY_RECURRING_TEMPLATE_DRAFT,
  RECURRING_FREQUENCIES,
  RECURRING_FREQUENCY_LABELS,
  RecurringEntryTemplate,
  RecurringGenerationResult,
  RecurringTemplateDraft,
  addRecurringTemplate,
  generateRecurringEntriesForMonth,
  hasRecurringTemplateErrors,
  removeRecurringTemplate,
  toggleRecurringTemplateActive,
  validateRecurringTemplateDraft,
} from "@/lib/journal/recurringEntries";

const inputClass =
  "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const errorTextClass = "mt-1 text-xs text-red-700";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const SKIP_REASON_LABELS: Record<RecurringGenerationResult["skipped"][number]["reason"], string> = {
  inactive: "無効化済みのためスキップ",
  duplicate: "対象月分は生成済みのためスキップ",
  "out-of-range": "対象月には発生しないためスキップ",
};

interface RecurringEntryManagerProps {
  /** 事前登録済みのテンプレート（デモ・初期表示用）。省略時は空の状態から開始する */
  initialTemplates?: RecurringEntryTemplate[];
  /** 重複生成防止の判定対象に含める、既存の仕訳一覧（journal/entries.ts の仕訳と合わせて渡す想定） */
  existingEntries?: CategorizedTransaction[];
  /** 一括生成が実行され、新規エントリが確定するたびに呼ばれるコールバック（親側の仕訳一覧への反映用） */
  onEntriesGenerated?: (entries: CategorizedTransaction[]) => void;
}

/**
 * 固定費・定期取引テンプレートの一覧・追加・当月分一括生成を行うUI。
 * journal/page.tsx 等の既存仕訳一覧とは独立して動作し、生成結果は
 * onEntriesGenerated 経由で親コンポーネントに渡す設計にしている。
 */
export function RecurringEntryManager({
  initialTemplates = [],
  existingEntries = [],
  onEntriesGenerated,
}: RecurringEntryManagerProps) {
  const [templates, setTemplates] = useState<RecurringEntryTemplate[]>(initialTemplates);
  const [draft, setDraft] = useState<RecurringTemplateDraft>(EMPTY_RECURRING_TEMPLATE_DRAFT);
  const [errors, setErrors] = useState<ReturnType<typeof validateRecurringTemplateDraft>>({});
  const [targetYearMonth, setTargetYearMonth] = useState(currentYearMonth());
  // このコンポーネント自身が過去に生成したエントリも、次回以降の重複生成防止の判定に使う
  const [generatedEntries, setGeneratedEntries] = useState<CategorizedTransaction[]>([]);
  const [lastResult, setLastResult] = useState<RecurringGenerationResult | null>(null);

  const allKnownEntries = useMemo(
    () => [...existingEntries, ...generatedEntries],
    [existingEntries, generatedEntries]
  );

  function set<K extends keyof RecurringTemplateDraft>(key: K, value: RecurringTemplateDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddTemplate(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateRecurringTemplateDraft(draft);
    if (hasRecurringTemplateErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setTemplates((prev) => addRecurringTemplate(prev, draft));
    setDraft(EMPTY_RECURRING_TEMPLATE_DRAFT);
  }

  function handleRemove(id: string) {
    setTemplates((prev) => removeRecurringTemplate(prev, id));
  }

  function handleToggleActive(id: string) {
    setTemplates((prev) => toggleRecurringTemplateActive(prev, id));
  }

  function handleGenerate() {
    const result = generateRecurringEntriesForMonth(templates, targetYearMonth, allKnownEntries);
    setLastResult(result);
    if (result.generated.length > 0) {
      setGeneratedEntries((prev) => [...prev, ...result.generated]);
      onEntriesGenerated?.(result.generated);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
        家賃・サブスクリプション・顧問料など毎月/毎年発生する固定費をテンプレートとして登録しておくと、
        対象年月を指定してワンクリックで仕訳を自動生成できます。同じ月分は二重に生成されません。
      </p>

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-stone-800">定期取引テンプレートを追加</h3>
        <form onSubmit={handleAddTemplate} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-xs text-stone-500 sm:col-span-2">
              摘要
              <input
                type="text"
                placeholder="例: オフィス家賃"
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass}
              />
              {errors.description && <span className={errorTextClass}>{errors.description}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              金額（収入は正、支出は負の数値）
              <input
                type="text"
                inputMode="decimal"
                placeholder="例: -120000"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                className={inputClass}
              />
              {errors.amount && <span className={errorTextClass}>{errors.amount}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              勘定科目
              <input
                type="text"
                placeholder="例: 地代家賃"
                value={draft.account}
                onChange={(e) => set("account", e.target.value)}
                className={inputClass}
              />
              {errors.account && <span className={errorTextClass}>{errors.account}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              消費税区分
              <select
                value={draft.taxCategory}
                onChange={(e) => set("taxCategory", e.target.value as RecurringTemplateDraft["taxCategory"])}
                className={inputClass}
              >
                {TAX_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              頻度
              <select
                value={draft.frequency}
                onChange={(e) => set("frequency", e.target.value as RecurringTemplateDraft["frequency"])}
                className={inputClass}
              >
                {RECURRING_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {RECURRING_FREQUENCY_LABELS[freq]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              開始日
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClass}
              />
              {errors.startDate && <span className={errorTextClass}>{errors.startDate}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500">
              終了日（任意）
              <input
                type="date"
                value={draft.endDate ?? ""}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
              />
              {errors.endDate && <span className={errorTextClass}>{errors.endDate}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs text-stone-500 sm:col-span-2">
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

          <button
            type="submit"
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors self-start"
          >
            テンプレートを追加
          </button>
        </form>
      </section>

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-stone-800">登録済みテンプレート</h3>

        {templates.length === 0 ? (
          <p className="text-sm text-stone-500">まだテンプレートが登録されていません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-left text-xs text-stone-500">
                  <th className="py-2 pr-4">摘要</th>
                  <th className="py-2 pr-4">金額</th>
                  <th className="py-2 pr-4">勘定科目</th>
                  <th className="py-2 pr-4">頻度</th>
                  <th className="py-2 pr-4">開始日</th>
                  <th className="py-2 pr-4">終了日</th>
                  <th className="py-2 pr-4">状態</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-stone-100">
                    <td className="py-2 pr-4">{template.description}</td>
                    <td className="py-2 pr-4">{yen.format(template.amount)}円</td>
                    <td className="py-2 pr-4">{template.account}</td>
                    <td className="py-2 pr-4">{RECURRING_FREQUENCY_LABELS[template.frequency]}</td>
                    <td className="py-2 pr-4">{template.startDate}</td>
                    <td className="py-2 pr-4">{template.endDate ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {template.active ? (
                        <span className="text-emerald-700">有効</span>
                      ) : (
                        <span className="text-stone-400">無効</span>
                      )}
                    </td>
                    <td className="py-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(template.id)}
                        className="text-xs text-stone-600 underline hover:text-stone-900"
                      >
                        {template.active ? "無効化" : "有効化"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(template.id)}
                        className="text-xs text-red-700 underline hover:text-red-900"
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

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-stone-800">対象月分を一括生成</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            対象年月
            <input
              type="month"
              value={targetYearMonth}
              onChange={(e) => setTargetYearMonth(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={templates.length === 0}
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300"
          >
            {targetYearMonth} 分を一括生成
          </button>
        </div>

        {lastResult && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-stone-700">
              {lastResult.generated.length}件の仕訳を自動確定しました
              {lastResult.skipped.length > 0 && `（${lastResult.skipped.length}件はスキップ）`}。
            </p>
            {lastResult.generated.length > 0 && (
              <ul className="text-xs text-stone-600 list-disc pl-5">
                {lastResult.generated.map((entry) => (
                  <li key={entry.id}>
                    {entry.date} {entry.description} {yen.format(entry.amount)}円（{entry.account}）
                  </li>
                ))}
              </ul>
            )}
            {lastResult.skipped.length > 0 && (
              <ul className="text-xs text-amber-700 list-disc pl-5">
                {lastResult.skipped.map((skip) => (
                  <li key={skip.templateId}>
                    {templates.find((t) => t.id === skip.templateId)?.description ?? skip.templateId}:{" "}
                    {SKIP_REASON_LABELS[skip.reason]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
