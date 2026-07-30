import { describe, expect, it } from "vitest";
import { applyCustomMapping, validateCustomMapping } from "./customMapping";
import { parseCsvText } from "./parse";

describe("applyCustomMapping", () => {
  it("normalizes a valid signed-mode mapping (single amount column)", () => {
    const csv = "取引日,内容,金額,残高\n2026-01-05,家賃引落,-120000,880000\n2026-01-08,振込入金,450000,1330000\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "取引日", description: "内容", amount: "金額" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([
      { id: "custom-row-1", date: "2026-01-05", description: "家賃引落", amount: -120000 },
      { id: "custom-row-2", date: "2026-01-08", description: "振込入金", amount: 450000 },
    ]);
    expect(result.skippedRows).toBe(0);
    expect(result.detectedColumns).toEqual({ date: "取引日", description: "内容", amount: "金額" });
  });

  it("normalizes a valid split-mode mapping (separate withdraw/deposit columns)", () => {
    const csv = "日付,お取引内容,お引出し,お預入れ\n2026-01-10,水道光熱費引落,8000,\n2026-01-15,売上入金,,200000\n";
    const result = applyCustomMapping(csv, {
      mode: "split",
      date: "日付",
      description: "お取引内容",
      withdraw: "お引出し",
      deposit: "お預入れ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([
      { id: "custom-row-1", date: "2026-01-10", description: "水道光熱費引落", amount: -8000 },
      { id: "custom-row-2", date: "2026-01-15", description: "売上入金", amount: 200000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "日付",
      description: "お取引内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes a valid split-mode mapping when only the deposit column is mapped", () => {
    const csv = "日付,内容,入金\n2026-02-01,給与,300000\n";
    const result = applyCustomMapping(csv, {
      mode: "split",
      date: "日付",
      description: "内容",
      withdraw: "",
      deposit: "入金",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([{ id: "custom-row-1", date: "2026-02-01", description: "給与", amount: 300000 }]);
  });

  it("returns an error when a mapped header does not exist in the CSV (missing required header)", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "日付", description: "摘要", amount: "取引金額" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { field: "amount", message: "「金額」に指定された列「取引金額」がCSVのヘッダー行に見つかりません。" },
    ]);
  });

  it("returns an error for each missing/unselected field when several are wrong at once", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "存在しない列", description: "", amount: "金額" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.field).sort()).toEqual(["date", "description"]);
  });

  it("returns an error requiring at least one of withdraw/deposit in split mode when neither is selected", () => {
    const csv = "日付,内容,出金,入金\n2026-01-05,家賃,120000,\n";
    const result = applyCustomMapping(csv, { mode: "split", date: "日付", description: "内容", withdraw: "", deposit: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { field: "withdraw", message: "「出金」「入金」のうち、少なくとも一方に対応する列を選択してください。" },
    ]);
  });

  it("returns an error for an empty CSV (no header row to map against)", () => {
    const result = applyCustomMapping("", { mode: "signed", date: "日付", description: "摘要", amount: "金額" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { field: "date", message: "「日付」に指定された列「日付」がCSVのヘッダー行に見つかりません。" },
      { field: "description", message: "「摘要（取引内容）」に指定された列「摘要」がCSVのヘッダー行に見つかりません。" },
      { field: "amount", message: "「金額」に指定された列「金額」がCSVのヘッダー行に見つかりません。" },
    ]);
  });

  it("produces an empty transaction list (not an error) for a header-only CSV with no data rows", () => {
    const csv = "日付,摘要,金額\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "日付", description: "摘要", amount: "金額" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(0);
  });

  it("treats malformed amount values (non-numeric / lone '-') as zero rather than throwing or emitting NaN", () => {
    const csv = "日付,摘要,金額\n2026-01-05,不明な明細,ABC\n2026-01-06,別の明細,-\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "日付", description: "摘要", amount: "金額" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].amount).toBe(0);
    expect(result.transactions[1].amount).toBe(0);
    expect(Number.isNaN(result.transactions[0].amount)).toBe(false);
  });

  it("strips yen signs and thousands-separator commas before parsing an amount", () => {
    const csv = 'ご利用日,ご利用店名,ご利用金額\n2026-01-12,家電量販店,"¥12,800"\n';
    const result = applyCustomMapping(csv, {
      mode: "signed",
      date: "ご利用日",
      description: "ご利用店名",
      amount: "ご利用金額",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].amount).toBe(12800);
  });

  it("counts a row with no date/description and zero net amount as skipped", () => {
    const csv = "日付,内容,金額,メモ\n2026-01-05,家賃,-120000,\n,,0,備考のみ\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "日付", description: "内容", amount: "金額" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(1);
  });

  it("matches mapped header names case-insensitively and tolerant of surrounding whitespace", () => {
    const csv = " DATE , description ,AMOUNT\n2026-02-01,coffee,-500\n";
    const result = applyCustomMapping(csv, { mode: "signed", date: "date", description: "DESCRIPTION", amount: "amount" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toEqual([{ id: "custom-row-1", date: "2026-02-01", description: "coffee", amount: -500 }]);
  });
});

describe("validateCustomMapping", () => {
  it("returns no errors for a complete, valid signed-mode mapping", () => {
    const header = parseCsvText("日付,摘要,金額\n")[0];
    const errors = validateCustomMapping(header, { mode: "signed", date: "日付", description: "摘要", amount: "金額" });
    expect(errors).toEqual([]);
  });

  it("returns no errors for a complete, valid split-mode mapping", () => {
    const header = parseCsvText("日付,内容,出金,入金\n")[0];
    const errors = validateCustomMapping(header, {
      mode: "split",
      date: "日付",
      description: "内容",
      withdraw: "出金",
      deposit: "入金",
    });
    expect(errors).toEqual([]);
  });

  it("flags an unselected required field distinctly from a header that doesn't exist", () => {
    const header = parseCsvText("日付,摘要,金額\n")[0];
    const errors = validateCustomMapping(header, { mode: "signed", date: "日付", description: "", amount: "存在しない" });
    expect(errors).toEqual([
      { field: "description", message: "「摘要（取引内容）」に対応する列を選択してください。" },
      { field: "amount", message: "「金額」に指定された列「存在しない」がCSVのヘッダー行に見つかりません。" },
    ]);
  });
});
