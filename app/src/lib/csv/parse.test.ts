import { describe, expect, it } from "vitest";
import { normalizeCsv, parseCsvText } from "./parse";

describe("normalizeCsv", () => {
  it("parses a single-amount-column format (generic)", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n2026-01-08,業務委託料入金,450000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ date: "2026-01-05", description: "家賃", amount: -120000 });
    expect(result.detectedColumns).toEqual({ date: "日付", description: "摘要", amount: "金額" });
  });

  it("parses a 三井住友銀行-style split withdraw/deposit format with 年月日", () => {
    const csv = "年月日,お取り扱い内容,お引出し,お預入れ,残高\n2026-01-05,家賃引落,120000,,880000\n2026-01-08,振込入金,,450000,1330000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "家賃引落", amount: -120000 },
      { id: "row-2", date: "2026-01-08", description: "振込入金", amount: 450000 },
    ]);
  });

  it("parses a credit-card-style format (ご利用日/ご利用店名及び商品名/ご利用金額)", () => {
    const csv = "ご利用日,ご利用店名及び商品名,ご利用金額\n2026-01-12,Amazon.co.jp,6400\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-12", description: "Amazon.co.jp", amount: -6400 }]);
  });

  it("parses a signed single-column format (楽天銀行-style 入出金)", () => {
    const csv = "取引日,入出金先内容,入出金\n2026-01-05,カード引落,-3000\n2026-01-06,給与振込,300000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "カード引落", amount: -3000 },
      { id: "row-2", date: "2026-01-06", description: "給与振込", amount: 300000 },
    ]);
  });

  it("returns empty result with unknown columns when nothing matches", () => {
    const result = normalizeCsv("foo,bar\n1,2\n");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("returns an empty result for an empty string", () => {
    const result = normalizeCsv("");
    expect(result).toEqual({
      transactions: [],
      skippedRows: 0,
      detectedColumns: { date: "?", description: "?", amount: "?" },
    });
  });

  it("returns no transactions for a header-only CSV (no data rows)", () => {
    const result = normalizeCsv("日付,摘要,金額\n");
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(0);
    expect(result.detectedColumns).toEqual({ date: "日付", description: "摘要", amount: "金額" });
  });

  it("counts rows with blank date/description and zero amount as skipped", () => {
    // parseCsvText already drops rows that are *entirely* blank, so to exercise
    // normalizeCsv's own skip logic the row needs a non-blank cell outside the
    // mapped date/description/amount columns (here, the 4th "メモ" column).
    const csv = "日付,摘要,金額,メモ\n2026-01-05,家賃,-120000,\n,,0,備考のみ\n2026-01-08,入金,300000,\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.skippedRows).toBe(1);
  });

  it("matches headers case-insensitively and trims surrounding whitespace", () => {
    const csv = " DATE , description ,AMOUNT\n2026-02-01,coffee,-500\n";
    const result = normalizeCsv(csv);
    expect(result.detectedColumns).toEqual({ date: " DATE ", description: " description ", amount: "AMOUNT" });
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-02-01", description: "coffee", amount: -500 }]);
  });

  it("strips a leading BOM before detecting the header row", () => {
    const csv = "﻿日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const result = normalizeCsv(csv);
    expect(result.detectedColumns).toEqual({ date: "日付", description: "摘要", amount: "金額" });
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-05", description: "家賃", amount: -120000 }]);
  });

  it("parses amounts with yen signs and thousands separators, and treats a bare '-' as zero", () => {
    const csv = '日付,摘要,金額\n2026-01-05,家賃,"¥-120,000"\n2026-01-06,雑費,-\n';
    const result = normalizeCsv(csv);
    expect(result.transactions[0].amount).toBe(-120000);
    // A lone "-" is not a parseable number, so it falls back to 0, and since
    // date/description are non-empty the row is still emitted (not skipped).
    expect(result.transactions[1].amount).toBe(0);
    expect(result.skippedRows).toBe(0);
  });

  it("combines split withdraw/deposit columns even when both have non-zero values", () => {
    const csv = "日付,摘要,お引出し,お預入れ\n2026-01-05,相殺,1000,2500\n";
    const result = normalizeCsv(csv);
    expect(result.transactions[0].amount).toBe(1500);
  });

  it("falls back to '不明'/'(摘要なし)' when date/description columns are missing but amount is non-zero", () => {
    const csv = "金額\n1000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([{ id: "row-1", date: "不明", description: "(摘要なし)", amount: 1000 }]);
  });

  it("treats a short row (missing trailing columns) as amount 0 via the ?? fallback", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃\n";
    const result = normalizeCsv(csv);
    // date/description are present so the row is emitted, with amount defaulting to 0.
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-05", description: "家賃", amount: 0 }]);
    expect(result.skippedRows).toBe(0);
  });
});

describe("parseCsvText", () => {
  it("handles quoted fields containing commas and newlines", () => {
    const csv = '日付,摘要,金額\n2026-01-05,"家賃, 1月分",-120000\n';
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ["日付", "摘要", "金額"],
      ["2026-01-05", "家賃, 1月分", "-120000"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const csv = '日付,摘要\n2026-01-05,"""特別""控除"\n';
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ["日付", "摘要"],
      ["2026-01-05", '"特別"控除'],
    ]);
  });

  it("handles CRLF line endings without emitting blank rows", () => {
    const csv = "日付,摘要,金額\r\n2026-01-05,家賃,-120000\r\n2026-01-08,入金,300000\r\n";
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ["日付", "摘要", "金額"],
      ["2026-01-05", "家賃", "-120000"],
      ["2026-01-08", "入金", "300000"],
    ]);
  });

  it("drops rows that are entirely blank/whitespace", () => {
    const csv = "日付,摘要\n2026-01-05,家賃\n\n   \n2026-01-08,入金\n";
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ["日付", "摘要"],
      ["2026-01-05", "家賃"],
      ["2026-01-08", "入金"],
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseCsvText("")).toEqual([]);
  });
});
