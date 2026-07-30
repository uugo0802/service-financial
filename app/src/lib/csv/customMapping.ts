import { Transaction } from "../categorize/engine";
import { decodeCsvBuffer } from "./decode";
import { parseCsvText, ParseResult } from "./parse";

/**
 * 「自分の銀行が見つからない場合」向けのカスタム列マッピング機能。
 *
 * bankFormats.ts は5つの主要銀行・カード会社のCSVフォーマットのみを想定しており、
 * 一致しない銀行のCSVはヘッダー行から自動判定できず、parse.ts の汎用パーサ（normalizeCsv）も
 * ヘッダー名が一般的な慣例と異なる場合は検出に失敗する可能性がある。
 *
 * このモジュールは、ユーザー自身に「どの列が日付/摘要/金額か」を明示的に指定してもらうことで、
 * どのようなヘッダー名のCSVでも取り込めるようにするフォールバック経路を提供する。
 * CSVのトークナイズ（parseCsvText）・文字コード判定（decodeCsvBuffer）はparse.ts/decode.tsの
 * 既存実装をそのまま再利用し、ここでは「明示的なマッピングの検証」と「マッピングに基づく正規化」のみを行う。
 */

/** 単一の金額列（正負がそのまま収入/支出を表す）を指定するマッピング */
export interface SignedCustomMapping {
  mode: "signed";
  date: string;
  description: string;
  amount: string;
}

/** 出金列・入金列が分かれているCSV向けのマッピング（bankFormats.ts の split モードに相当） */
export interface SplitCustomMapping {
  mode: "split";
  date: string;
  description: string;
  /** 出金列のヘッダー名。入金列と合わせて少なくとも一方の指定が必須 */
  withdraw: string;
  /** 入金列のヘッダー名。出金列と合わせて少なくとも一方の指定が必須 */
  deposit: string;
}

export type CustomColumnMapping = SignedCustomMapping | SplitCustomMapping;

export type CustomMappingField = "date" | "description" | "amount" | "withdraw" | "deposit";

export interface CustomMappingValidationError {
  field: CustomMappingField;
  message: string;
}

export interface CustomMappingSuccess extends ParseResult {
  ok: true;
}

export interface CustomMappingFailure {
  ok: false;
  errors: CustomMappingValidationError[];
}

export type CustomMappingResult = CustomMappingSuccess | CustomMappingFailure;

const FIELD_LABELS: Record<CustomMappingField, string> = {
  date: "日付",
  description: "摘要（取引内容）",
  amount: "金額",
  withdraw: "出金",
  deposit: "入金",
};

function hasHeader(header: string[], candidate: string): boolean {
  return header.some((h) => h.trim().toLowerCase() === candidate.trim().toLowerCase());
}

function findColumn(header: string[], candidate: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === candidate.trim().toLowerCase());
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[,¥\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function checkRequiredField(
  header: string[],
  field: CustomMappingField,
  value: string,
  errors: CustomMappingValidationError[]
): void {
  if (!value || value.trim() === "") {
    errors.push({ field, message: `「${FIELD_LABELS[field]}」に対応する列を選択してください。` });
    return;
  }
  if (!hasHeader(header, value)) {
    errors.push({
      field,
      message: `「${FIELD_LABELS[field]}」に指定された列「${value}」がCSVのヘッダー行に見つかりません。`,
    });
  }
}

/**
 * ユーザーが指定したマッピングを、実際のCSVヘッダー行に対して検証する。
 * 必須フィールドが未選択の場合、または選択された列名がヘッダーに存在しない場合にエラーを返す
 * （空のCSV・ヘッダー行がないCSVの場合は header が空配列になるため、すべてのフィールドがエラーになる）。
 */
export function validateCustomMapping(
  header: string[],
  mapping: CustomColumnMapping
): CustomMappingValidationError[] {
  const errors: CustomMappingValidationError[] = [];

  checkRequiredField(header, "date", mapping.date, errors);
  checkRequiredField(header, "description", mapping.description, errors);

  if (mapping.mode === "signed") {
    checkRequiredField(header, "amount", mapping.amount, errors);
    return errors;
  }

  const withdraw = mapping.withdraw?.trim() ?? "";
  const deposit = mapping.deposit?.trim() ?? "";
  if (!withdraw && !deposit) {
    errors.push({
      field: "withdraw",
      message: "「出金」「入金」のうち、少なくとも一方に対応する列を選択してください。",
    });
    return errors;
  }
  if (withdraw && !hasHeader(header, withdraw)) {
    errors.push({
      field: "withdraw",
      message: `「出金」に指定された列「${withdraw}」がCSVのヘッダー行に見つかりません。`,
    });
  }
  if (deposit && !hasHeader(header, deposit)) {
    errors.push({
      field: "deposit",
      message: `「入金」に指定された列「${deposit}」がCSVのヘッダー行に見つかりません。`,
    });
  }

  return errors;
}

function emptyParseResult(): ParseResult {
  return { transactions: [], skippedRows: 0, detectedColumns: { date: "?", description: "?", amount: "?" } };
}

function normalizeRowsWithMapping(rows: string[][], mapping: CustomColumnMapping): ParseResult {
  if (rows.length === 0) return emptyParseResult();

  const header = rows[0];
  const dateIdx = findColumn(header, mapping.date);
  const descIdx = findColumn(header, mapping.description);
  const withdrawIdx = mapping.mode === "split" && mapping.withdraw ? findColumn(header, mapping.withdraw) : -1;
  const depositIdx = mapping.mode === "split" && mapping.deposit ? findColumn(header, mapping.deposit) : -1;
  const amountIdx = mapping.mode === "signed" ? findColumn(header, mapping.amount) : -1;

  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = dateIdx >= 0 ? r[dateIdx]?.trim() : "";
    const description = descIdx >= 0 ? r[descIdx]?.trim() : "";

    let amount = 0;
    if (mapping.mode === "signed") {
      amount = amountIdx >= 0 ? toNumber(r[amountIdx] ?? "0") : 0;
    } else {
      const withdraw = withdrawIdx >= 0 ? toNumber(r[withdrawIdx] ?? "0") : 0;
      const deposit = depositIdx >= 0 ? toNumber(r[depositIdx] ?? "0") : 0;
      amount = deposit - Math.abs(withdraw);
    }

    if (!date && !description && amount === 0) {
      skipped++;
      continue;
    }

    transactions.push({
      id: `custom-row-${i}`,
      date: date || "不明",
      description: description || "(摘要なし)",
      amount,
    });
  }

  let amountColumnLabel: string;
  if (mapping.mode === "signed") {
    amountColumnLabel = amountIdx >= 0 ? header[amountIdx] : "未検出";
  } else {
    amountColumnLabel = withdrawIdx >= 0 || depositIdx >= 0 ? "出金/入金列を合成" : "未検出";
  }

  return {
    transactions,
    skippedRows: skipped,
    detectedColumns: {
      date: dateIdx >= 0 ? header[dateIdx] : "未検出",
      description: descIdx >= 0 ? header[descIdx] : "未検出",
      amount: amountColumnLabel,
    },
  };
}

/**
 * 生CSVテキストを、ユーザー指定のカスタム列マッピングに従って正規化する。
 * マッピングが不正な場合（未選択の必須フィールドがある、指定された列名がヘッダーに存在しない等）は
 * ok:false とエラー一覧を返す。空文字列のCSV（ヘッダー行なし）を渡した場合も、すべての必須フィールドが
 * 「見つからない」ことになるため同じ検証経路でエラーとなる。
 */
export function applyCustomMapping(text: string, mapping: CustomColumnMapping): CustomMappingResult {
  const rows = parseCsvText(text);
  const header = rows.length > 0 ? rows[0] : [];

  const errors = validateCustomMapping(header, mapping);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, ...normalizeRowsWithMapping(rows, mapping) };
}

export interface CustomMappingBufferSuccess extends CustomMappingSuccess {
  encoding: "utf-8" | "shift_jis";
}

export type CustomMappingBufferResult = CustomMappingBufferSuccess | CustomMappingFailure;

/**
 * ファイルの生バイト列（ArrayBuffer）を受け取り、文字コード判定（decode.tsを再利用）→CSV解析→
 * カスタムマッピングによる正規化、まで一気通貫で行うエントリポイント。
 * クライアント（ブラウザ）でのファイルアップロード処理から呼び出す想定。
 */
export function applyCustomMappingToBuffer(buffer: ArrayBuffer, mapping: CustomColumnMapping): CustomMappingBufferResult {
  const { text, encoding } = decodeCsvBuffer(buffer);
  const result = applyCustomMapping(text, mapping);
  if (!result.ok) return result;
  return { ...result, encoding };
}
