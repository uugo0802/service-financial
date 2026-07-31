"use client";

import { useMemo, useState } from "react";
import { TAX_CATEGORIES } from "@/lib/categorize/dictionary";
import type { Transaction } from "@/lib/categorize/engine";
import {
  DEFAULT_MATCH_TOLERANCE,
  EMPTY_RECURRING_TEMPLATE_DRAFT,
  ExpectedRecurringTransaction,
  RecurringTransactionTemplate,
  RecurringTransactionTemplateDraft,
  computeExpectedRecurringTransactions,
  hasRecurringTransactionTemplateErrors,
  registerRecurringTemplate,
  removeRecurringTemplate,
  suggestRecurringTemplateMatches,
  toggleRecurringTemplateActive,
  validateRecurringTransactionTemplateDraft,
} from "@/lib/journal/recurringTemplates";

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500";
const errorTextClass = "mt-1 text-xs text-red-700";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const STATUS_LABELS: Record<ExpectedRecurringTransaction["status"], string> = {
  recorded: "記帳済み",
  missing: "未記帳（要確認）",
  upcoming: "未到来",
};

const STATUS_BADGE_CLASS: Record<ExpectedRecurringTransaction["status"], string> = {
  recorded: "text-emerald-700",
  missing: "text-red-700",
  upcoming: "text-stone-400",
};

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toYearMonth(date: Date): string {
  return toIsoDate(date).slice(0, 7);
}

interface RecurringTransactionsPanelProps {
  /** 事前登録済みのテンプレート（デモ・初期表示用）。省略時は空の状態から開始する */
  initialTemplates?: RecurringTransactionTemplate[];
  /**
   * 記帳漏れ判定・新規取引とのマッチングの対象となる、既に記帳済みの取引一覧。
   * transactions/page.tsx や journal/page.tsx 側の一覧をそのまま渡す想定。
   */
  recordedTransactions?: Transaction[];
  /** CSV取込・手入力で新たに入ってきた、まだ勘定科目が確定していない取引一覧（マッチ提案の対象） */
  incomingTransactions?: Transaction[];
  /** 「今日」の基準日。省略時はブラウザの実行時刻を使う（テストではDateを固定して渡せる） */
  today?: Date;
}

/**
 * 定期取引テンプレートの登録・一覧管理と、
 * 「当月分の記帳漏れチェック」「新規取込取引とのマッチ提案」を行うパネル。
 * ロジック本体は lib/journal/recurringTemplates.ts に切り出し、ここではUI状態のみを持つ。
 */
export function RecurringTransactionsPanel({
  initialTemplates = [],
  recordedTransactions = [],
  incomingTransactions = [],
  today = new Date(),
}: RecurringTransactionsPanelProps) {
  const [templates, setTemplates] = useState<RecurringTransactionTemplate[]>(initialTemplates);
  const [draft, setDraft] = useState<RecurringTransactionTemplateDraft>(EMPTY_RECURRING_TEMPLATE_DRAFT);
  const [errors, setErrors] = useState<ReturnType<typeof validateRecurringTransactionTemplateDraft>>({});

  const asOfDate = useMemo(() => toIsoDate(today), [today]);
  const [targetYearMonth, setTargetYearMonth] = useState(() => toYearMonth(today));

  function set<K extends keyof RecurringTransactionTemplateDraft>(
    key: K,
    value: RecurringTransactionTemplateDraft[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateRecurringTransactionTemplateDraft(draft);
    if (hasRecurringTransactionTemplateErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setTemplates((prev) => registerRecurringTemplate(prev, draft));
    setDraft(EMPTY_RECURRING_TEMPLATE_DRAFT);
  }

  function handleRemove(id: string) {
    setTemplates((prev) => removeRecurringTemplate(prev, id));
  }

  function handleToggleActive(id: string) {
    setTemplates((prev) => toggleRecurringTemplateActive(prev, id));
  }

  const expected = useMemo(
    () => computeExpectedRecurringTransactions(templates, recordedTransactions, targetYearMonth, asOfDate),
    [templates, recordedTransactions, targetYearMonth, asOfDate]
  );
  const missingCount = expected.filter((item) => item.status === "missing").length;

  const suggestions = useMemo(
    () => suggestRecurringTemplateMatches(incomingTransactions, templates),
    [incomingTransactions, templates]
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">定期取引テンプレートを登録する</h2>
        <p className="text-xs text-stone-500 leading-relaxed">
          家賃・サブスクリプション費用・顧問料など、毎月ほぼ同じ内容で発生する取引を登録しておくと、
          取込んだ取引との自動マッチ提案や、当月の記帳漏れチェックに使えます。
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={`${labelClass} sm:col-span-2`}>
              摘要マッチパターン（取引の摘要に含まれる文字列）
              <input
                type="text"
                placeholder="例：オフィス家賃 / 〇〇クラウドサービス"
                value={draft.pattern}
                onChange={(e) => set("pattern", e.target.value)}
                className={inputClass}
              />
              {errors.pattern && <span className={errorTextClass}>{errors.pattern}</span>}
            </label>

            <label className={labelClass}>
              勘定科目
              <input
                type="text"
                placeholder="例：地代家賃"
                value={draft.account}
                onChange={(e) => set("account", e.target.value)}
                className={inputClass}
              />
              {errors.account && <span className={errorTextClass}>{errors.account}</span>}
            </label>

            <label className={labelClass}>
              税区分
              <select
                value={draft.taxCategory}
                onChange={(e) => set("taxCategory", e.target.value as RecurringTransactionTemplateDraft["taxCategory"])}
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

            <label className={labelClass}>
              想定金額（収入は正、支出は負の数値）
              <input
                type="text"
                inputMode="decimal"
                placeholder="例：-150000"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                className={inputClass}
              />
              {errors.amount && <span className={errorTextClass}>{errors.amount}</span>}
            </label>

            <label className={labelClass}>
              想定発生日（毎月の日付、1〜31）
              <input
                type="text"
                inputMode="numeric"
                placeholder="例：27"
                value={draft.dayOfMonth}
                onChange={(e) => set("dayOfMonth", e.target.value)}
                className={inputClass}
              />
              {errors.dayOfMonth && <span className={errorTextClass}>{errors.dayOfMonth}</span>}
            </label>

            <label className={`${labelClass} sm:col-span-2`}>
              メモ（任意）
              <input
                type="text"
                placeholder="例：〇〇不動産への口座振替"
                value={draft.note ?? ""}
                onChange={(e) => set("note", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <p className="text-xs text-stone-400 leading-relaxed">
            マッチング時は想定金額の±{Math.round(DEFAULT_MATCH_TOLERANCE.amountToleranceRatio * 100)}%、想定発生日の前後
            {DEFAULT_MATCH_TOLERANCE.dayOfMonthTolerance}日までのゆらぎを同一取引として扱います。
          </p>

          <button
            type="submit"
            className="text-sm px-5 py-2.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors self-start"
          >
            テンプレートを追加
          </button>
        </form>
      </section>

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">登録済みテンプレート（{templates.length}件）</h2>

        {templates.length === 0 ? (
          <p className="text-sm text-stone-500">まだテンプレートが登録されていません。上のフォームから追加してください。</p>
        ) : (
          <div className="overflow-x-auto border border-stone-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                  <th className="px-3 py-2 font-normal">摘要パターン</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">勘定科目</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">税区分</th>
                  <th className="px-3 py-2 font-normal text-right whitespace-nowrap">想定金額</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">発生日</th>
                  <th className="px-3 py-2 font-normal whitespace-nowrap">状態</th>
                  <th className="px-3 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2">{template.pattern}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{template.account}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{template.taxCategory}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {yen.format(template.amount)}円
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">毎月{template.dayOfMonth}日</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {template.active ? (
                        <span className="text-emerald-700">有効</span>
                      ) : (
                        <span className="text-stone-400">無効</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(template.id)}
                        className="text-xs text-stone-500 hover:text-stone-900 mr-3"
                      >
                        {template.active ? "無効化" : "有効化"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(template.id)}
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

      <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
        <div className="flex items-end gap-3 flex-wrap justify-between">
          <div>
            <h2 className="text-lg font-semibold">当月の記帳漏れチェック</h2>
            <p className="text-xs text-stone-500 leading-relaxed mt-1 max-w-2xl">
              対象月について、登録済みテンプレートごとに一致する取引が記帳済みかどうかを確認します。
              発生予定日を過ぎているのにまだ記帳されていない場合は「未記帳（要確認）」と表示されます。
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            対象年月
            <input
              type="month"
              value={targetYearMonth}
              onChange={(e) => setTargetYearMonth(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {expected.length === 0 ? (
          <p className="text-sm text-stone-500">有効なテンプレートがまだ登録されていません。</p>
        ) : (
          <>
            {missingCount > 0 && (
              <p className="text-sm text-red-700">
                {missingCount}件の定期取引が、想定発生日を過ぎてもまだ記帳されていません。記帳漏れがないかご確認ください。
              </p>
            )}
            <div className="overflow-x-auto border border-stone-300">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">摘要パターン</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">勘定科目</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">期待発生日</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">状態</th>
                    <th className="px-3 py-2 font-normal">一致した取引</th>
                  </tr>
                </thead>
                <tbody>
                  {expected.map((item) => (
                    <tr key={item.template.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2">{item.template.pattern}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.template.account}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{item.expectedDate}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${STATUS_BADGE_CLASS[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </td>
                      <td className="px-3 py-2 text-stone-500">
                        {item.matchedTransaction
                          ? `${item.matchedTransaction.date} ${item.matchedTransaction.description}（${yen.format(item.matchedTransaction.amount)}円）`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {incomingTransactions.length > 0 && (
        <section className="border border-stone-300 bg-white p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">取込取引とのマッチ提案（{suggestions.length}件）</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            新たに取り込まれた取引のうち、登録済みテンプレートに一致しそうなものです。内容をご確認のうえ、
            勘定科目・税区分の確定にご利用ください。
          </p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-stone-500">一致しそうな取引はありませんでした。</p>
          ) : (
            <div className="overflow-x-auto border border-stone-300">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
                    <th className="px-3 py-2 font-normal">取引日</th>
                    <th className="px-3 py-2 font-normal">摘要</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">金額</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">提案テンプレート</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">提案勘定科目</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((suggestion) => (
                    <tr key={suggestion.transaction.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{suggestion.transaction.date}</td>
                      <td className="px-3 py-2">{suggestion.transaction.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {yen.format(suggestion.transaction.amount)}円
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{suggestion.template.pattern}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{suggestion.template.account}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
