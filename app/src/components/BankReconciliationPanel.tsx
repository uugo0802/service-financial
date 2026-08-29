"use client";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { reconcileBankBalance } from "@/lib/reconcile/bankReconciliation";

export interface BankReconciliationPanelProps {
  /** 突合対象期間として取り込み済みの取引一覧（プレビュー表示にも使う） */
  transactions: CategorizedTransaction[];
  /** 期首残高の初期表示値（未入力状態から始めたい場合は省略） */
  initialOpeningBalance?: string;
  /** 実際の期末残高の初期表示値 */
  initialActualClosingBalance?: string;
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const inputClass =
  "w-full max-w-xs border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-red-700 dark:focus:border-red-400 tabular-nums";
const labelClass = "block text-xs text-muted-foreground mb-1";

/**
 * 銀行残高突合（銀行残高突合チェック）パネル。
 *
 * 取込済みの取引一覧に対して、ユーザーが自分の目で銀行明細から読み取った
 * 「期首残高」と「実際の期末残高」を入力すると、
 *   期首残高 + 取込済み取引の金額合計 = 期末残高（あるべき値）
 * を計算し、実際の期末残高と一致するかどうかを判定する（計算は
 * reconcileBankBalance という純粋関数に委譲し、このコンポーネントは
 * フォーム状態の管理と結果表示のみを担う）。
 *
 * 一致しない場合は、不足・過大のどちらの方向にズレているかに応じて
 * 「取込漏れの可能性」「重複取込の可能性」のヒントを表示し、
 * 非専門家のユーザーでも次に何を確認すればよいかの当たりがつくようにする。
 */
export function BankReconciliationPanel({
  transactions,
  initialOpeningBalance = "",
  initialActualClosingBalance = "",
}: BankReconciliationPanelProps) {
  const [openingBalanceInput, setOpeningBalanceInput] = useState(initialOpeningBalance);
  const [actualClosingBalanceInput, setActualClosingBalanceInput] = useState(initialActualClosingBalance);

  const openingBalance = Number(openingBalanceInput);
  const actualClosingBalance = Number(actualClosingBalanceInput);
  const hasValidInputs =
    openingBalanceInput.trim() !== "" &&
    actualClosingBalanceInput.trim() !== "" &&
    Number.isFinite(openingBalance) &&
    Number.isFinite(actualClosingBalance);

  const result = useMemo(() => {
    if (!hasValidInputs) return null;
    return reconcileBankBalance({ transactions, openingBalance, actualClosingBalance });
  }, [hasValidInputs, transactions, openingBalance, actualClosingBalance]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid sm:grid-cols-2 gap-4 bg-surface border border-border rounded p-4">
        <div>
          <label className={labelClass} htmlFor="opening-balance">
            期首残高（この期間の開始時点の、銀行明細上の残高）
          </label>
          <input
            id="opening-balance"
            type="number"
            step="any"
            value={openingBalanceInput}
            onChange={(e) => setOpeningBalanceInput(e.target.value)}
            placeholder="例：1000000"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="actual-closing-balance">
            実際の期末残高（この期間の終了時点の、銀行明細上の残高）
          </label>
          <input
            id="actual-closing-balance"
            type="number"
            step="any"
            value={actualClosingBalanceInput}
            onChange={(e) => setActualClosingBalanceInput(e.target.value)}
            placeholder="例：1230000"
            className={inputClass}
          />
        </div>
        <p className="sm:col-span-2 text-xs text-muted-foreground leading-relaxed">
          いずれも、実際にお手元の銀行明細（Web明細・通帳）に記載されている残高をそのまま入力してください。
          このツールが残高を推測することはありません。
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">
          突合対象の取引明細
          <span className="text-xs font-normal text-muted-foreground ml-2">{transactions.length}件</span>
        </h3>
        <div className="overflow-x-auto border border-border bg-surface max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-left text-muted-foreground text-xs">
                <th className="px-3 py-2 font-normal">日付</th>
                <th className="px-3 py-2 font-normal">摘要</th>
                <th className="px-3 py-2 font-normal text-right">金額</th>
                <th className="px-3 py-2 font-normal">勘定科目</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{t.date}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={t.description}>
                    {t.description}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      t.amount < 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {yen.format(t.amount)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{t.account}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">突合結果</h3>
        {!result ? (
          <p className="text-sm text-muted-foreground">
            期首残高と実際の期末残高を入力すると、取込済み取引との突合結果を表示します。
          </p>
        ) : (
          <div
            className={`border rounded p-5 flex flex-col gap-3 ${
              result.isReconciled
                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${
                  result.isReconciled ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"
                }`}
              >
                {result.isReconciled ? "一致しました（残高突合OK）" : "一致しません（要確認）"}
              </span>
            </div>

            <dl className="text-sm space-y-1.5">
              <ResultRow label="期首残高" value={yen.format(result.openingBalance)} />
              <ResultRow label="取込済み取引の金額合計" value={yen.format(result.netTransactionAmount)} />
              <ResultRow label="計算上の期末残高（期首残高＋取引合計）" value={yen.format(result.expectedClosingBalance)} />
              <ResultRow label="実際の期末残高（入力値）" value={yen.format(result.actualClosingBalance)} />
              <ResultRow
                label="差額（実際 − 計算上）"
                value={yen.format(result.discrepancy)}
                strong
                emphasisClassName={result.isReconciled ? "" : "text-red-700 dark:text-red-400"}
              />
            </dl>

            {!result.isReconciled && result.hint && (
              <div className="mt-1 border-t border-red-200 dark:border-red-800 pt-3">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">{result.hint.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{result.hint.message}</p>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
          このチェックは、取り込んだ取引データが期間全体を過不足なく反映しているかを機械的に検算するものであり、
          税務代理・個別具体的な税務相談には該当しません。差額の原因の最終的な特定・記帳内容の修正はご自身、
          または税理士等の専門家にご確認のうえ行ってください。
        </p>
      </section>
    </div>
  );
}

function ResultRow({
  label,
  value,
  strong,
  emphasisClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  emphasisClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-base" : ""} ${emphasisClassName ?? ""}`}>{value}</dd>
    </div>
  );
}
