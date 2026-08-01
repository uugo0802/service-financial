"use client";

import { useMemo, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { ReceivableInvoiceInput } from "@/lib/invoice/receivables";
import {
  CombinedPaymentReviewItem,
  InvoicePaymentMatchCandidate,
  matchInvoicePayments,
} from "@/lib/reconcile/invoicePaymentMatching";

export interface InvoicePaymentMatchPanelProps {
  /** 未収の可能性がある発行済み請求書一覧（未収金額0円の請求書を含んでいても構わない） */
  invoices: ReceivableInvoiceInput[];
  /** 突合対象期間として取り込み済みの銀行取引一覧 */
  transactions: CategorizedTransaction[];
}

type MatchDecision = "confirmed" | "rejected";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function candidateKey(candidate: InvoicePaymentMatchCandidate): string {
  return `${candidate.transaction.transactionId}:${candidate.invoiceNumber}`;
}

function combinedKey(item: CombinedPaymentReviewItem): string {
  return `combined:${item.transaction.transactionId}:${item.candidateInvoiceNumbers.join(",")}`;
}

/**
 * 入金消込（銀行取引 → 未収請求書の自動マッチング候補）パネル。
 *
 * matchInvoicePayments という純粋関数に計算を委譲し、このコンポーネントは
 * フォーム状態（各候補を「消込を確定」「違う」のどちらにしたか）の管理と結果表示のみを担う
 * （BankReconciliationPanel.tsx と同じ役割分担のUX方針を踏襲: 計算ロジックは lib 側、
 * UIはあくまで状態管理と表示に徹する）。
 *
 * 確定・却下はこの画面内のローカル状態（useState）のみで完結し、サーバー側の請求書データを
 * 実際に更新するものではない（プロトタイプ）。あくまで「どの入金がどの請求書への支払いか」の
 * 当たりをつけるための補助であり、最終的な消込の確定判断は利用者自身が行う。
 */
export function InvoicePaymentMatchPanel({ invoices, transactions }: InvoicePaymentMatchPanelProps) {
  const [decisions, setDecisions] = useState<Record<string, MatchDecision>>({});

  const result = useMemo(() => matchInvoicePayments({ invoices, transactions }), [invoices, transactions]);

  function decide(key: string, decision: MatchDecision) {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
  }

  function clearDecision(key: string) {
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const confirmedCount = Object.values(decisions).filter((d) => d === "confirmed").length;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid sm:grid-cols-3 gap-3">
        <SummaryTile label="高信頼度マッチ" value={result.highConfidenceMatches.length} accent="emerald" />
        <SummaryTile label="中信頼度マッチ（要確認）" value={result.mediumConfidenceMatches.length} accent="amber" />
        <SummaryTile label="消込を確定した件数" value={confirmedCount} accent="stone" />
      </section>

      <MatchSection
        title="高信頼度マッチ（金額のみで一意に特定）"
        description="入金額が、未収の請求書1件の未収金額とちょうど一致しました。"
        accent="emerald"
        candidates={result.highConfidenceMatches}
        decisions={decisions}
        onConfirm={(key) => decide(key, "confirmed")}
        onReject={(key) => decide(key, "rejected")}
        onClear={clearDecision}
      />

      <MatchSection
        title="中信頼度マッチ（金額＋摘要の名寄せ）"
        description="同額の請求書が複数あったため、取引摘要に含まれる請求先名から絞り込みました。確定前に必ずご確認ください。"
        accent="amber"
        candidates={result.mediumConfidenceMatches}
        decisions={decisions}
        onConfirm={(key) => decide(key, "confirmed")}
        onReject={(key) => decide(key, "rejected")}
        onClear={clearDecision}
      />

      <MatchSection
        title="部分入金（一部入金の可能性）"
        description="入金額が請求書の未収金額を下回っています。分割入金・一部入金の可能性があるため、金額が一致する「マッチ」とは区別して表示しています。"
        accent="orange"
        candidates={result.partialPaymentCandidates}
        decisions={decisions}
        onConfirm={(key) => decide(key, "confirmed")}
        onReject={(key) => decide(key, "rejected")}
        onClear={clearDecision}
        showRemainingBalance
      />

      <section>
        <h3 className="text-sm font-semibold mb-1">まとめ入金の可能性（要確認）</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed max-w-2xl">
          複数の請求書の合計額が1回の入金額と一致しました。どの組み合わせが実際に支払われたかはこのツールでは
          自動判定せず（一般的な組み合わせ探索は行いません）、要確認としてのみフラグを立てています。
        </p>
        {result.combinedPaymentReviewItems.length === 0 ? (
          <EmptyState text="まとめ入金の可能性がある取引はありません。" />
        ) : (
          <div className="flex flex-col gap-3">
            {result.combinedPaymentReviewItems.map((item) => {
              const key = combinedKey(item);
              const decision = decisions[key];
              return (
                <div
                  key={key}
                  className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 rounded p-4 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-medium">{item.transaction.date}</span>{" "}
                      <span className="text-stone-600 dark:text-stone-300">{item.transaction.description}</span>
                    </div>
                    <span className="tabular-nums font-semibold">{yen.format(item.transaction.amount)}</span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-300">
                    請求先候補: {item.clientName} ／ 対象請求書候補: {item.candidateInvoiceNumbers.join(" + ")}
                  </p>
                  <p className="text-xs text-red-800 dark:text-red-300">{item.note}</p>
                  <div>
                    {decision === "confirmed" ? (
                      <DecisionBadge label="確認済み" tone="emerald" onClear={() => clearDecision(key)} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => decide(key, "confirmed")}
                        className="text-xs px-3 py-1.5 border border-stone-400 dark:border-stone-600 rounded hover:border-red-700 dark:hover:border-red-400"
                      >
                        確認済みにする（消込は別途手動で行ってください）
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">
          未消込の入金
          <span className="text-xs font-normal text-stone-500 dark:text-stone-400 ml-2">
            {result.unmatchedDeposits.length}件
          </span>
        </h3>
        {result.unmatchedDeposits.length === 0 ? (
          <EmptyState text="未消込の入金取引はありません。" />
        ) : (
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal">日付</th>
                  <th className="px-3 py-2 font-normal">摘要</th>
                  <th className="px-3 py-2 font-normal text-right">金額</th>
                  <th className="px-3 py-2 font-normal">理由</th>
                </tr>
              </thead>
              <tbody>
                {result.unmatchedDeposits.map((u) => (
                  <tr key={u.transaction.transactionId} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{u.transaction.date}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={u.transaction.description}>
                      {u.transaction.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {yen.format(u.transaction.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">
          対応する入金が見つからない未収請求書
          <span className="text-xs font-normal text-stone-500 dark:text-stone-400 ml-2">
            {result.unmatchedInvoices.length}件
          </span>
        </h3>
        {result.unmatchedInvoices.length === 0 ? (
          <EmptyState text="対応する入金が見つからない未収請求書はありません。" />
        ) : (
          <div className="overflow-x-auto border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400 text-xs">
                  <th className="px-3 py-2 font-normal">請求書番号</th>
                  <th className="px-3 py-2 font-normal">請求先</th>
                  <th className="px-3 py-2 font-normal text-right">未収金額</th>
                </tr>
              </thead>
              <tbody>
                {result.unmatchedInvoices.map((inv) => (
                  <tr key={inv.invoiceNumber} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="px-3 py-2 tabular-nums">{inv.invoiceNumber}</td>
                    <td className="px-3 py-2">{inv.clientName || "（請求先未入力）"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(inv.outstandingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
        このマッチング候補は、入金額・取引摘要からの機械的な当たりづけであり、税理士法に定める税務代理・
        個別具体的な税務相談には該当しません。消込の最終確定は、必ずご自身の銀行口座等の実際の入金記録と
        照らし合わせたうえで行ってください。
      </p>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent: "emerald" | "amber" | "stone" }) {
  const accentClass = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-500",
    stone: "text-stone-700 dark:text-stone-300",
  }[accent];
  return (
    <div className="border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 rounded p-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${accentClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 rounded p-6 text-center text-sm text-stone-500 dark:text-stone-400">
      {text}
    </div>
  );
}

function DecisionBadge({ label, tone, onClear }: { label: string; tone: "emerald" | "stone"; onClear: () => void }) {
  const toneClass = {
    emerald: "border-emerald-400 text-emerald-800 dark:border-emerald-600 dark:text-emerald-300",
    stone: "border-stone-400 text-stone-600 dark:border-stone-600 dark:text-stone-300",
  }[tone];
  return (
    <div className={`inline-flex items-center gap-2 text-xs border rounded px-2 py-1 ${toneClass}`}>
      <span>{label}</span>
      <button type="button" onClick={onClear} className="underline hover:no-underline">
        取り消す
      </button>
    </div>
  );
}

function MatchSection({
  title,
  description,
  accent,
  candidates,
  decisions,
  onConfirm,
  onReject,
  onClear,
  showRemainingBalance,
}: {
  title: string;
  description: string;
  accent: "emerald" | "amber" | "orange";
  candidates: InvoicePaymentMatchCandidate[];
  decisions: Record<string, MatchDecision>;
  onConfirm: (key: string) => void;
  onReject: (key: string) => void;
  onClear: (key: string) => void;
  showRemainingBalance?: boolean;
}) {
  const borderClass = {
    emerald: "border-emerald-300 dark:border-emerald-700",
    amber: "border-amber-300 dark:border-amber-700",
    orange: "border-orange-300 dark:border-orange-700",
  }[accent];
  const bgClass = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    orange: "bg-orange-50 dark:bg-orange-950/30",
  }[accent];

  return (
    <section>
      <h3 className="text-sm font-semibold mb-1">
        {title}
        <span className="text-xs font-normal text-stone-500 dark:text-stone-400 ml-2">{candidates.length}件</span>
      </h3>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed max-w-2xl">{description}</p>

      {candidates.length === 0 ? (
        <EmptyState text="該当する候補はありません。" />
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.map((candidate) => {
            const key = candidateKey(candidate);
            const decision = decisions[key];
            return (
              <div
                key={key}
                className={`border rounded p-4 flex flex-col gap-2 ${
                  decision === "rejected" ? "border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 opacity-60" : `${borderClass} ${bgClass}`
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{candidate.transaction.date}</span>{" "}
                    <span className="text-stone-600 dark:text-stone-300">{candidate.transaction.description}</span>
                  </div>
                  <span className="tabular-nums font-semibold">{yen.format(candidate.transaction.amount)}</span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  請求書 <span className="font-medium">{candidate.invoiceNumber}</span> ／ 請求先: {candidate.clientName} ／
                  未収金額: <span className="tabular-nums">{yen.format(candidate.invoiceOutstandingAmount)}</span>
                  {showRemainingBalance && candidate.remainingBalanceAfterMatch !== undefined && (
                    <>
                      {" "}
                      ／ 消込後の残額:{" "}
                      <span className="tabular-nums font-medium">{yen.format(candidate.remainingBalanceAfterMatch)}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">{candidate.reason}</p>

                <div className="flex items-center gap-2">
                  {decision === "confirmed" && <DecisionBadge label="消込を確定しました" tone="emerald" onClear={() => onClear(key)} />}
                  {decision === "rejected" && <DecisionBadge label="違う（却下）" tone="stone" onClear={() => onClear(key)} />}
                  {!decision && (
                    <>
                      <button
                        type="button"
                        onClick={() => onConfirm(key)}
                        className="text-xs px-3 py-1.5 bg-emerald-700 text-white rounded hover:bg-emerald-800"
                      >
                        消込を確定する
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(key)}
                        className="text-xs px-3 py-1.5 border border-stone-400 dark:border-stone-600 rounded hover:border-red-700 dark:hover:border-red-400"
                      >
                        違う（却下）
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
