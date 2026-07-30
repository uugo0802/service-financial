// ------------------------------------------------------------------
// 仕訳の年度確定・ロック機能（純粋ロジック、DBアクセスなし）。
//
// 背景（docs/cto-tech-architecture.md 4.1 電子帳簿保存法）:
// 電子取引データ保存の真実性確保は「(a) タイムスタンプ付与」「(b) 訂正・削除の履歴が残る、
// または訂正・削除ができないシステムで保存」「(c) 事務処理規程の備付け」のいずれかで満たす
// 必要があり、MVPでは実装コストが最も低い (b) を採用する方針（同ドキュメント参照）。
//
// これまで app/src/lib/db/auditLogs.ts はCRUD操作の履歴を残す（(b)の「履歴が残る」側）
// 実装のみだったが、申告確定後の仕訳が黙って編集され得る状態は (b) の
// 「訂正・削除ができないシステムで保存」の要件を満たさないコンプライアンス上の抜け穴だった。
//
// 本モジュールは、年度（fiscalYear、tax/yearArchive.ts の YearlyFilingRecord.fiscalYear と
// 同じセマンティクス＝暦年ベースの「◯◯年分/期」を表す数値）を「確定（ロック）」することで、
// その年度に属する仕訳の編集・削除を防止する。ロック解除（再オープン）には理由の入力を必須とし、
// 監査ログに残すことで、封じ込め漏れなく「訂正・削除の履歴が残る」状態を維持する。
//
// 注: マイクロ法人の会計年度が暦年と一致しない場合（決算期が12月末以外）はこのモデルでは
// 表現できない。tax/yearArchive.ts が同じ前提（暦年=fiscalYear）を置いているため本モジュールも
// それに合わせているが、決算期が任意の法人向けの厳密対応はPhase 1後半以降の課題とする。
// ------------------------------------------------------------------

import { AuditLogRow } from "../db/supabaseClient";
import {
  FISCAL_YEAR_CLOSE_ACTION,
  FISCAL_YEAR_ENTITY_TYPE,
  FISCAL_YEAR_REOPEN_ACTION,
  describeAuditAction,
  describeEntityType,
} from "../db/auditLogs";

/** ロック解除（再オープン）1件分の履歴。理由の入力を必須とすることで無断解除を防ぐ */
export interface FiscalYearReopenRecord {
  /** ISO日時文字列 */
  reopenedAt: string;
  /** 解除理由（空文字不可。バリデーションは reopenFiscalYear 側で行う） */
  reason: string;
}

/** 年度ごとの確定（ロック）状態 */
export interface FiscalYearCloseState {
  /** 対象の会計年度（例: 2025 は「2025年分/期」）。tax/yearArchive.ts の fiscalYear と同じ数値 */
  fiscalYear: number;
  /** true の間は、この年度に属する仕訳の編集・削除が禁止される */
  closed: boolean;
  /** 確定した日時（ISO日時文字列）。未確定なら null */
  closedAt: string | null;
  /** これまでの解除（再オープン）履歴。時系列順（古い→新しい）に追記していく */
  reopenHistory: FiscalYearReopenRecord[];
}

/** 未確定（オープン）状態の初期値を作る */
export function createOpenFiscalYearState(fiscalYear: number): FiscalYearCloseState {
  return { fiscalYear, closed: false, closedAt: null, reopenHistory: [] };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 指定した日付が、指定した会計年度（暦年）に属するかどうか。
 * 年度の開始（1/1）・終了（12/31）はどちらも当該年度に含む（境界値はその年度扱い）。
 * 日付の形式が不正な場合は false を返す（＝どの年度のロックにも影響されない扱い）。
 */
export function isDateInFiscalYear(fiscalYear: number, date: string): boolean {
  if (!DATE_ONLY.test(date)) return false;
  const year = Number(date.slice(0, 4));
  return year === fiscalYear;
}

/**
 * 指定した日付の仕訳を、この年度の確定状態のもとで編集・削除してよいかどうか。
 * - 日付がこの年度に属さない場合は、この年度のロックとは無関係なので true（許可）。
 * - 日付がこの年度に属し、かつ年度が確定済み（closed）の場合のみ false（禁止）。
 */
export function isJournalEditAllowed(state: FiscalYearCloseState, entryDate: string): boolean {
  if (!isDateInFiscalYear(state.fiscalYear, entryDate)) return true;
  return !state.closed;
}

/** 監査ログへ渡す説明オブジェクト。auditLogs.ts の型・整形関数をそのまま再利用する */
export interface FiscalYearAuditLogEntry {
  action: AuditLogRow["action"];
  entityType: AuditLogRow["entity_type"];
  entityId: NonNullable<AuditLogRow["entity_id"]>;
  changes: AuditLogRow["changes"];
  /** describeAuditAction/describeEntityType による画面表示用の日本語説明 */
  description: string;
}

function buildAuditEntry(
  action: string,
  fiscalYear: number,
  changes: AuditLogRow["changes"]
): FiscalYearAuditLogEntry {
  return {
    action,
    entityType: FISCAL_YEAR_ENTITY_TYPE,
    entityId: String(fiscalYear),
    changes,
    description: `${describeEntityType(FISCAL_YEAR_ENTITY_TYPE)}(${fiscalYear}年度): ${describeAuditAction(action)}`,
  };
}

/** closeFiscalYear / reopenFiscalYear が成功したときの戻り値 */
export interface FiscalYearActionResult {
  ok: true;
  state: FiscalYearCloseState;
  auditEntry: FiscalYearAuditLogEntry;
}

/** バリデーションエラー・不正な操作（二重確定など）の戻り値 */
export interface FiscalYearActionError {
  ok: false;
  error: string;
}

export type FiscalYearActionOutcome = FiscalYearActionResult | FiscalYearActionError;

/**
 * 年度を確定（ロック）する。
 * 既に確定済みの年度を再度確定しようとした場合は no-op ではなく、明確なエラーを返す
 * （呼び出し側が「何も起きなかった」と誤解して二重に監査ログを積むことを防ぐため）。
 */
export function closeFiscalYear(
  state: FiscalYearCloseState,
  options: { closedAt?: string } = {}
): FiscalYearActionOutcome {
  if (state.closed) {
    return { ok: false, error: `${state.fiscalYear}年度は既に確定済みです` };
  }

  const closedAt = options.closedAt ?? new Date().toISOString();
  const newState: FiscalYearCloseState = { ...state, closed: true, closedAt };

  return {
    ok: true,
    state: newState,
    auditEntry: buildAuditEntry(FISCAL_YEAR_CLOSE_ACTION, state.fiscalYear, {
      before: { closed: false, closedAt: state.closedAt },
      after: { closed: true, closedAt },
    }),
  };
}

/**
 * 確定済みの年度のロックを解除（再オープン）する。
 * 無断でのロック解除を防ぐため、空文字・空白のみの理由は拒否する。
 * 確定されていない（既にオープンな）年度を解除しようとした場合もエラーを返す。
 */
export function reopenFiscalYear(
  state: FiscalYearCloseState,
  reason: string,
  options: { reopenedAt?: string } = {}
): FiscalYearActionOutcome {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "ロック解除には理由の入力が必須です" };
  }

  if (!state.closed) {
    return { ok: false, error: `${state.fiscalYear}年度は確定されていないため、解除の必要がありません` };
  }

  const reopenedAt = options.reopenedAt ?? new Date().toISOString();
  const record: FiscalYearReopenRecord = { reopenedAt, reason: trimmedReason };
  const newState: FiscalYearCloseState = {
    ...state,
    closed: false,
    closedAt: null,
    reopenHistory: [...state.reopenHistory, record],
  };

  return {
    ok: true,
    state: newState,
    auditEntry: buildAuditEntry(FISCAL_YEAR_REOPEN_ACTION, state.fiscalYear, {
      before: { closed: true, closedAt: state.closedAt },
      after: { closed: false, reason: trimmedReason, reopenedAt },
    }),
  };
}
