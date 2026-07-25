import { Transaction } from "../categorize/engine";

/** RFC4180風の簡易CSVパーサ（クォート・カンマ内包に対応） */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // 先頭のBOMを除去（Excel等で書き出したCSVはBOM付きが多い）
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// 主要ネット銀行（住信SBI・楽天銀行・ゆうちょ・三井住友・みずほ・三菱UFJ等）・
// クレジットカード（楽天カード・三井住友カード・JCB等）のCSVエクスポートで
// 実際に使われるヘッダー名のバリエーションを収集したもの。完全網羅ではなく、
// 未対応フォーマットは detectedColumns が「未検出」になるので画面上で判別できる。
const DATE_HEADERS = ["日付", "取引日", "利用日", "ご利用日", "年月日", "取扱日", "ご利用年月日", "date"];
const DESC_HEADERS = [
  "摘要",
  "内容",
  "お取引内容",
  "ご利用店名",
  "取引内容",
  "description",
  "摘要・お取引内容",
  "お取り扱い内容",
  "入出金先内容",
  "ご利用店名及び商品名",
  "ご利用先",
  "利用店名・商品名",
  "摘要内容",
];
const AMOUNT_HEADERS = ["金額", "amount", "入出金", "取引金額"];
const WITHDRAW_HEADERS = ["出金金額", "お引出し", "出金", "ご利用金額", "お支払金額"];
const DEPOSIT_HEADERS = ["入金金額", "お預入れ", "入金"];

function findColumn(header: string[], candidates: string[]): number {
  return header.findIndex((h) =>
    candidates.some((c) => h.trim().toLowerCase() === c.toLowerCase())
  );
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[,¥\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export interface ParseResult {
  transactions: Transaction[];
  skippedRows: number;
  detectedColumns: { date: string; description: string; amount: string };
}

/**
 * 銀行・カード会社ごとにフォーマットが異なるCSVを、ヘッダー名のゆらぎを見て
 * {date, description, amount} に正規化する。
 * amount は「金額」列がある場合はそのまま、出金/入金が分かれている場合は
 * 出金を負、入金を正として合成する。
 */
export function normalizeCsv(text: string): ParseResult {
  const rows = parseCsvText(text);
  if (rows.length === 0) {
    return { transactions: [], skippedRows: 0, detectedColumns: { date: "?", description: "?", amount: "?" } };
  }

  const header = rows[0];
  const dateIdx = findColumn(header, DATE_HEADERS);
  const descIdx = findColumn(header, DESC_HEADERS);
  const amountIdx = findColumn(header, AMOUNT_HEADERS);
  const withdrawIdx = findColumn(header, WITHDRAW_HEADERS);
  const depositIdx = findColumn(header, DEPOSIT_HEADERS);

  const hasSingleAmount = amountIdx >= 0;
  const hasSplitAmount = withdrawIdx >= 0 || depositIdx >= 0;

  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = dateIdx >= 0 ? r[dateIdx]?.trim() : "";
    const description = descIdx >= 0 ? r[descIdx]?.trim() : "";

    let amount = 0;
    if (hasSingleAmount) {
      amount = toNumber(r[amountIdx] ?? "0");
    } else if (hasSplitAmount) {
      const withdraw = withdrawIdx >= 0 ? toNumber(r[withdrawIdx] ?? "0") : 0;
      const deposit = depositIdx >= 0 ? toNumber(r[depositIdx] ?? "0") : 0;
      amount = deposit - Math.abs(withdraw);
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

  return {
    transactions,
    skippedRows: skipped,
    detectedColumns: {
      date: dateIdx >= 0 ? header[dateIdx] : "未検出",
      description: descIdx >= 0 ? header[descIdx] : "未検出",
      amount: hasSingleAmount ? header[amountIdx] : hasSplitAmount ? "出金/入金列を合成" : "未検出",
    },
  };
}
