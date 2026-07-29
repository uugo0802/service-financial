"use client";

import { useState } from "react";
import {
  FiscalYearCloseState,
  closeFiscalYear,
  createOpenFiscalYearState,
  reopenFiscalYear,
} from "@/lib/journal/yearClose";

// ------------------------------------------------------------------
// 年度の確定（ロック）／解除を行う操作パネル。
// 電子帳簿保存法4.1「訂正・削除の履歴が残る、または訂正・削除ができないシステムで保存」の
// 要件に対応するため、申告済みの年度を確定するとその年度の仕訳が編集・削除できなくなる、
// という業務ルールをUIから操作できるようにする。
//
// 現時点ではSupabase未接続のため、状態はこのコンポーネント内（クライアント側）で保持する
// プロトタイプ実装。将来的にはDB保存（year_closesテーブル等）＋audit_logsへのINSERTに
// 差し替える想定で、closeFiscalYear/reopenFiscalYearが返すauditEntryはその橋渡しとして
// そのままAPI呼び出しのペイロードに使える形にしてある。
// ------------------------------------------------------------------

interface YearCloseControlProps {
  fiscalYear: number;
  /** 初期状態（省略時は未確定＝オープン扱い） */
  initialState?: FiscalYearCloseState;
}

type ConfirmMode = null | "close" | "reopen";

export function YearCloseControl({ fiscalYear, initialState }: YearCloseControlProps) {
  const [state, setState] = useState<FiscalYearCloseState>(
    initialState ?? createOpenFiscalYearState(fiscalYear)
  );
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  function startClose() {
    setError(null);
    setLastMessage(null);
    setConfirmMode("close");
  }

  function startReopen() {
    setError(null);
    setLastMessage(null);
    setReason("");
    setConfirmMode("reopen");
  }

  function cancel() {
    setConfirmMode(null);
    setReason("");
    setError(null);
  }

  function confirmClose() {
    const result = closeFiscalYear(state);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setLastMessage(result.auditEntry.description);
    setConfirmMode(null);
  }

  function confirmReopen() {
    const result = reopenFiscalYear(state, reason);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setLastMessage(result.auditEntry.description);
    setConfirmMode(null);
    setReason("");
  }

  return (
    <div className="border border-stone-300 bg-white rounded-lg px-4 py-3 flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{fiscalYear}年度</span>
          {state.closed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-900 text-white text-xs px-2.5 py-1">
              確定済み（ロック中）
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 text-stone-600 text-xs px-2.5 py-1">
              未確定
            </span>
          )}
        </div>

        {confirmMode === null && (
          <button
            type="button"
            onClick={state.closed ? startReopen : startClose}
            className={
              state.closed
                ? "text-xs px-3 py-1.5 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
                : "text-xs px-3 py-1.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            }
          >
            {state.closed ? "ロックを解除する" : "年度を確定（ロック）する"}
          </button>
        )}
      </div>

      {state.closed && state.closedAt && (
        <p className="text-xs text-stone-500">確定日時: {state.closedAt}</p>
      )}

      {state.reopenHistory.length > 0 && (
        <ul className="text-xs text-stone-500 list-disc list-inside">
          {state.reopenHistory.map((r, i) => (
            <li key={i}>
              {r.reopenedAt} にロック解除（理由: {r.reason}）
            </li>
          ))}
        </ul>
      )}

      {confirmMode === "close" && (
        <div className="border border-stone-300 bg-stone-50 rounded p-3 flex flex-col gap-2">
          <p className="text-xs text-stone-700">
            {fiscalYear}年度を確定すると、この年度に属する仕訳の編集・削除ができなくなります。よろしいですか？
          </p>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmClose}
              className="text-xs px-3 py-1.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            >
              確定する
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-xs px-3 py-1.5 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {confirmMode === "reopen" && (
        <div className="border border-stone-300 bg-stone-50 rounded p-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone-600">
            解除理由（必須）
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 税務署からの指摘により再修正が必要なため"
              className="w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
          </label>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmReopen}
              className="text-xs px-3 py-1.5 border border-stone-900 bg-stone-900 text-white hover:bg-stone-700 transition-colors"
            >
              ロックを解除する
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-xs px-3 py-1.5 border border-stone-400 bg-white hover:border-stone-600 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {lastMessage && confirmMode === null && (
        <p className="text-xs text-stone-500">最新の操作: {lastMessage}</p>
      )}
    </div>
  );
}
