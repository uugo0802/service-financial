// 手入力での仕訳追加・編集・削除ロジック。
// CSVアップロード経由の仕訳と同じ CategorizedTransaction 型に準拠させ、
// 一覧・書類プレビュー等の既存ロジックをそのまま再利用できるようにしている。

import { CategorizedTransaction } from "../categorize/engine";
import { TaxCategory } from "../categorize/dictionary";

/** 手入力フォームの入力値。amountはユーザー入力の生文字列のまま保持し、確定時に数値へ変換する */
export interface JournalEntryDraft {
  date: string;
  description: string;
  amount: string;
  account: string;
  taxCategory: TaxCategory;
  note?: string;
}

export type JournalEntryFieldErrors = Partial<
  Record<"date" | "description" | "amount" | "account" | "taxCategory", string>
>;

export const EMPTY_JOURNAL_DRAFT: JournalEntryDraft = {
  date: "",
  description: "",
  amount: "",
  account: "",
  taxCategory: "課税仕入10%",
  note: "",
};

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_FORMAT = /^-?\d+(\.\d+)?$/;

// new Date("2026-02-30") はUTCで3/2へロールオーバーしてしまい NaN にならないため、
// 各要素を分解して実在する日付かどうかを個別に検証する。
function isValidCalendarDate(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** フォーム入力のバリデーション。エラーがなければ空オブジェクトを返す */
export function validateJournalEntryDraft(draft: JournalEntryDraft): JournalEntryFieldErrors {
  const errors: JournalEntryFieldErrors = {};

  const date = draft.date.trim();
  if (!date) {
    errors.date = "日付を入力してください";
  } else if (!DATE_FORMAT.test(date) || !isValidCalendarDate(date)) {
    errors.date = "日付はYYYY-MM-DD形式で入力してください";
  }

  if (!draft.description.trim()) {
    errors.description = "摘要を入力してください";
  }

  const amount = draft.amount.trim();
  if (!amount) {
    errors.amount = "金額を入力してください";
  } else if (!NUMERIC_FORMAT.test(amount)) {
    errors.amount = "金額は数値で入力してください";
  } else if (Number(amount) === 0) {
    errors.amount = "金額は0以外の数値で入力してください";
  }

  if (!draft.account.trim()) {
    errors.account = "勘定科目を入力してください";
  }

  if (!draft.taxCategory) {
    errors.taxCategory = "消費税区分を選択してください";
  }

  return errors;
}

export function hasJournalEntryErrors(errors: JournalEntryFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

function generateJournalEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * draftをCategorizedTransactionへ変換する。
 * 呼び出し側は事前に validateJournalEntryDraft でエラーがないことを確認しておくこと。
 */
export function draftToTransaction(draft: JournalEntryDraft, id: string = generateJournalEntryId()): CategorizedTransaction {
  return {
    id,
    date: draft.date.trim(),
    description: draft.description.trim(),
    amount: Number(draft.amount.trim()),
    account: draft.account.trim(),
    taxCategory: draft.taxCategory,
    confidence: 1,
    source: "manual",
    note: draft.note?.trim() || undefined,
  };
}

/** 編集フォームの初期値を作るため、既存のTransactionをdraftへ逆変換する */
export function transactionToDraft(tx: CategorizedTransaction): JournalEntryDraft {
  return {
    date: tx.date,
    description: tx.description,
    amount: String(tx.amount),
    account: tx.account,
    taxCategory: tx.taxCategory,
    note: tx.note ?? "",
  };
}

export function addJournalEntry(entries: CategorizedTransaction[], draft: JournalEntryDraft): CategorizedTransaction[] {
  return [...entries, draftToTransaction(draft)];
}

export function updateJournalEntry(
  entries: CategorizedTransaction[],
  id: string,
  draft: JournalEntryDraft
): CategorizedTransaction[] {
  return entries.map((entry) => (entry.id === id ? draftToTransaction(draft, id) : entry));
}

export function removeJournalEntry(entries: CategorizedTransaction[], id: string): CategorizedTransaction[] {
  return entries.filter((entry) => entry.id !== id);
}
