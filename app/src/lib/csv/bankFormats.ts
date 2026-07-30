import { Transaction } from "../categorize/engine";
import { normalizeCsv, parseCsvText, ParseResult } from "./parse";

/**
 * 銀行・カード会社ごとのCSV列マッピング（住信SBIネット銀行・楽天銀行・
 * GMOあおぞらネット銀行・三井住友カード・楽天カード）。
 *
 * 重要: 実際の各社CSVサンプルは入手できていないため、以下は公知情報・一般的な
 * ネット銀行/カード会社CSVエクスポートの慣例から推測した列名である。
 * 本番投入前に、各社の実際のエクスポートファイルで必ず人間による検証が必要。
 *
 * 銀行別の前提（要検証）:
 * - 住信SBIネット銀行: 列は「日付,内容,出金金額,入金金額,残高」を想定（出金/入金分離型）。
 *   「内容」列名がGMOあおぞらの「摘要」と異なる点で自動判定している。
 * - 楽天銀行: 列は「取引日,入出金,摘要,取引後残高」を想定。出金は負、入金は正の
 *   単一符号付き金額列（入出金）を持つ形式。
 * - GMOあおぞらネット銀行: 列は「日付,摘要,出金金額,入金金額,残高」を想定
 *   （出金/入金分離型。住信SBIとは「内容」/「摘要」の違いで区別）。
 * - 三井住友カード: 列は「ご利用日,ご利用店名,ご利用金額」を想定。カード利用額は
 *   明細上は正の数で記載されるため、支出として負値に変換する。丁寧表現の
 *   「ご利用日」列名で楽天カードと区別している。
 * - 楽天カード: 列は「利用日,利用店名,利用金額」を想定（三井住友カードと同様に
 *   利用額を負値へ変換）。「ご」が付かない列名で三井住友カードと区別している。
 *
 * これらの列名・区別方法はいずれも未検証の仮説であり、実データ次第で
 * detectHeaders・列候補の調整が必要になる可能性が高い。
 */

export type BankFormatId = "sbi_sumishin" | "rakuten_bank" | "gmo_aozora" | "smcc" | "rakuten_card";

interface SignedAmountConfig {
  mode: "signed";
  headers: string[];
}

interface SplitAmountConfig {
  mode: "split";
  withdrawHeaders: string[];
  depositHeaders: string[];
}

interface ExpenseOnlyAmountConfig {
  mode: "expense";
  headers: string[];
}

type AmountConfig = SignedAmountConfig | SplitAmountConfig | ExpenseOnlyAmountConfig;

interface BankFormatDefinition {
  id: BankFormatId;
  label: string;
  dateHeaders: string[];
  descHeaders: string[];
  amount: AmountConfig;
  /** 自動判定用。ヘッダー行にこれら全てが（大文字小文字・前後空白を無視して）含まれる場合に一致とみなす */
  detectHeaders: string[];
}

export const BANK_FORMATS: Record<BankFormatId, BankFormatDefinition> = {
  sbi_sumishin: {
    id: "sbi_sumishin",
    label: "住信SBIネット銀行",
    dateHeaders: ["日付"],
    descHeaders: ["内容"],
    amount: { mode: "split", withdrawHeaders: ["出金金額"], depositHeaders: ["入金金額"] },
    detectHeaders: ["日付", "内容", "出金金額", "入金金額"],
  },
  rakuten_bank: {
    id: "rakuten_bank",
    label: "楽天銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    amount: { mode: "signed", headers: ["入出金"] },
    detectHeaders: ["取引日", "入出金", "摘要", "取引後残高"],
  },
  gmo_aozora: {
    id: "gmo_aozora",
    label: "GMOあおぞらネット銀行",
    dateHeaders: ["日付"],
    descHeaders: ["摘要"],
    amount: { mode: "split", withdrawHeaders: ["出金金額"], depositHeaders: ["入金金額"] },
    detectHeaders: ["日付", "摘要", "出金金額", "入金金額"],
  },
  smcc: {
    id: "smcc",
    label: "三井住友カード",
    dateHeaders: ["ご利用日"],
    descHeaders: ["ご利用店名"],
    amount: { mode: "expense", headers: ["ご利用金額"] },
    detectHeaders: ["ご利用日", "ご利用店名", "ご利用金額"],
  },
  rakuten_card: {
    id: "rakuten_card",
    label: "楽天カード",
    dateHeaders: ["利用日"],
    descHeaders: ["利用店名"],
    amount: { mode: "expense", headers: ["利用金額"] },
    detectHeaders: ["利用日", "利用店名", "利用金額"],
  },
};

function findColumn(header: string[], candidates: string[]): number {
  return header.findIndex((h) => candidates.some((c) => h.trim().toLowerCase() === c.toLowerCase()));
}

function hasHeader(header: string[], candidate: string): boolean {
  return header.some((h) => h.trim().toLowerCase() === candidate.toLowerCase());
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[,¥\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * CSVのヘッダー行から、どの銀行/カードフォーマットに一致するかを推測する。
 * 複数一致した場合は detectHeaders がより多い（より具体的な）フォーマットを優先する。
 * どれにも一致しない場合は null を返す。
 */
export function detectBankFormat(header: string[]): BankFormatId | null {
  const candidates = Object.values(BANK_FORMATS).filter((def) =>
    def.detectHeaders.every((h) => hasHeader(header, h))
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.detectHeaders.length - a.detectHeaders.length);
  return candidates[0].id;
}

function normalizeRows(rows: string[][], def: BankFormatDefinition): ParseResult {
  if (rows.length === 0) {
    return { transactions: [], skippedRows: 0, detectedColumns: { date: "?", description: "?", amount: "?" } };
  }

  const header = rows[0];
  const dateIdx = findColumn(header, def.dateHeaders);
  const descIdx = findColumn(header, def.descHeaders);

  const withdrawIdx = def.amount.mode === "split" ? findColumn(header, def.amount.withdrawHeaders) : -1;
  const depositIdx = def.amount.mode === "split" ? findColumn(header, def.amount.depositHeaders) : -1;
  const signedIdx = def.amount.mode === "signed" ? findColumn(header, def.amount.headers) : -1;
  const expenseIdx = def.amount.mode === "expense" ? findColumn(header, def.amount.headers) : -1;

  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = dateIdx >= 0 ? r[dateIdx]?.trim() : "";
    const description = descIdx >= 0 ? r[descIdx]?.trim() : "";

    let amount = 0;
    if (def.amount.mode === "split") {
      const withdraw = withdrawIdx >= 0 ? toNumber(r[withdrawIdx] ?? "0") : 0;
      const deposit = depositIdx >= 0 ? toNumber(r[depositIdx] ?? "0") : 0;
      amount = deposit - Math.abs(withdraw);
    } else if (def.amount.mode === "signed") {
      amount = signedIdx >= 0 ? toNumber(r[signedIdx] ?? "0") : 0;
    } else {
      // expense: カード利用明細は正の数で記載されるため、支出として負値に変換する
      const raw = expenseIdx >= 0 ? toNumber(r[expenseIdx] ?? "0") : 0;
      amount = -Math.abs(raw);
    }

    if (!date && !description && amount === 0) {
      skipped++;
      continue;
    }

    transactions.push({
      id: `row-${i}`,
      date: date || "不明",
      description: description || "(摘要なし)",
      amount,
    });
  }

  let amountColumnLabel: string;
  if (def.amount.mode === "split") {
    amountColumnLabel = withdrawIdx >= 0 || depositIdx >= 0 ? "出金/入金列を合成" : "未検出";
  } else {
    const idx = def.amount.mode === "signed" ? signedIdx : expenseIdx;
    amountColumnLabel = idx >= 0 ? header[idx] : "未検出";
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

/** 指定した銀行/カードフォーマットで生CSVテキストを正規化する（手動指定用） */
export function normalizeCsvWithBankFormat(text: string, formatId: BankFormatId): ParseResult {
  const rows = parseCsvText(text);
  return normalizeRows(rows, BANK_FORMATS[formatId]);
}

export interface BankNormalizeResult extends ParseResult {
  /** 自動判定または手動指定で使われたフォーマットID。判定不能な場合は generic 汎用パーサへフォールバック */
  formatId: BankFormatId | "generic";
}

/**
 * CSVテキストを正規化する。formatId を指定すればそのフォーマットとして処理し（手動オーバーライド）、
 * 未指定の場合はヘッダー行から自動判定する。どの銀行/カードフォーマットにも一致しない場合は
 * parse.ts の汎用パーサ（normalizeCsv）にフォールバックする。
 */
export function normalizeBankCsv(text: string, formatId?: BankFormatId): BankNormalizeResult {
  if (formatId) {
    return { formatId, ...normalizeCsvWithBankFormat(text, formatId) };
  }

  const rows = parseCsvText(text);
  const detected = rows.length > 0 ? detectBankFormat(rows[0]) : null;

  if (detected) {
    return { formatId: detected, ...normalizeRows(rows, BANK_FORMATS[detected]) };
  }

  return { formatId: "generic", ...normalizeCsv(text) };
}
