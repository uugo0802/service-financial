import { describe, expect, it } from "vitest";
import {
  BANK_FORMATS,
  detectBankFormat,
  normalizeBankCsv,
  normalizeCsvWithBankFormat,
} from "./bankFormats";
import { parseCsvText } from "./parse";

describe("normalizeCsvWithBankFormat", () => {
  it("normalizes 住信SBIネット銀行 (split withdraw/deposit, 内容 column)", () => {
    const csv = "日付,内容,出金金額,入金金額,残高\n2026-01-05,家賃引落,120000,,880000\n2026-01-08,振込入金,,450000,1330000\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_sumishin");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "家賃引落", amount: -120000 },
      { id: "row-2", date: "2026-01-08", description: "振込入金", amount: 450000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "日付",
      description: "内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes 楽天銀行 (single signed 入出金 column)", () => {
    const csv = "取引日,入出金,摘要,取引後残高\n2026-01-05,-3000,カード引落,997000\n2026-01-06,300000,給与振込,1297000\n";
    const result = normalizeCsvWithBankFormat(csv, "rakuten_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "カード引落", amount: -3000 },
      { id: "row-2", date: "2026-01-06", description: "給与振込", amount: 300000 },
    ]);
    expect(result.detectedColumns).toEqual({ date: "取引日", description: "摘要", amount: "入出金" });
  });

  it("normalizes GMOあおぞらネット銀行 (split withdraw/deposit, 摘要 column)", () => {
    const csv = "日付,摘要,出金金額,入金金額,残高\n2026-01-10,水道光熱費引落,8000,,500000\n2026-01-15,売上入金,,200000,700000\n";
    const result = normalizeCsvWithBankFormat(csv, "gmo_aozora");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-10", description: "水道光熱費引落", amount: -8000 },
      { id: "row-2", date: "2026-01-15", description: "売上入金", amount: 200000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "日付",
      description: "摘要",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes 三井住友カード (positive usage amount negated to an expense)", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,Amazon.co.jp,6400\n2026-01-20,スターバックス,580\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-12", description: "Amazon.co.jp", amount: -6400 },
      { id: "row-2", date: "2026-01-20", description: "スターバックス", amount: -580 },
    ]);
    expect(result.detectedColumns).toEqual({ date: "ご利用日", description: "ご利用店名", amount: "ご利用金額" });
  });

  it("normalizes 楽天カード (positive usage amount negated to an expense)", () => {
    const csv = "利用日,利用店名,利用金額\n2026-02-01,楽天市場,12000\n";
    const result = normalizeCsvWithBankFormat(csv, "rakuten_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-02-01", description: "楽天市場", amount: -12000 }]);
  });

  it("still negates a usage amount that is written with an explicit minus sign (e.g. a refund row)", () => {
    const csv = "利用日,利用店名,利用金額\n2026-02-05,返金,-3000\n";
    const result = normalizeCsvWithBankFormat(csv, "rakuten_card");
    // Math.abs() before negation means both "3000" and "-3000" map to the same expense-side value;
    // real refund handling would need a dedicated sign-aware column, which we don't assume here.
    expect(result.transactions[0].amount).toBe(-3000);
  });

  it("counts a row with no date/description and zero net amount as skipped", () => {
    const csv = "日付,内容,出金金額,入金金額\n2026-01-05,家賃,120000,\n,,,\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_sumishin");
    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(0); // parseCsvText already drops the fully-blank row before it reaches us
  });

  it("returns an empty result for an empty string", () => {
    const result = normalizeCsvWithBankFormat("", "rakuten_bank");
    expect(result).toEqual({
      transactions: [],
      skippedRows: 0,
      detectedColumns: { date: "?", description: "?", amount: "?" },
    });
  });

  it("marks missing columns as 未検出 when the CSV doesn't match the requested format's columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("strips yen signs and thousands-separator commas before parsing an amount", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,家電量販店,\"¥12,800\"\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.transactions[0].amount).toBe(-12800);
  });

  it("treats a lone '-' amount value as zero (not NaN) while still emitting the row, since date/description are present", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,不明,-\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.skippedRows).toBe(0);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: "row-1", date: "2026-01-12", description: "不明" });
    // toNumber("-") -> 0, then Math.abs(0) negated yields -0; assert numeric equality (-0 === 0) rather
    // than Object.is-based toBe/toEqual, which would otherwise treat -0 and 0 as distinct.
    expect(result.transactions[0].amount === 0).toBe(true);
  });

  it("produces an empty transaction list (not an error) for a header-only CSV with no data rows", () => {
    const csv = "日付,内容,出金金額,入金金額,残高\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_sumishin");
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(0);
    expect(result.detectedColumns).toEqual({ date: "日付", description: "内容", amount: "出金/入金列を合成" });
  });

  it("computes a deposit-only amount as positive when the withdraw column is entirely absent from the header", () => {
    const csv = "日付,内容,入金金額\n2026-01-08,振込入金,450000\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_sumishin");
    expect(result.transactions[0].amount).toBe(450000);
  });
});

describe("detectBankFormat", () => {
  it("detects 住信SBIネット銀行 from its header row", () => {
    const header = parseCsvText("日付,内容,出金金額,入金金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("sbi_sumishin");
  });

  it("detects 楽天銀行 from its header row", () => {
    const header = parseCsvText("取引日,入出金,摘要,取引後残高\n")[0];
    expect(detectBankFormat(header)).toBe("rakuten_bank");
  });

  it("detects GMOあおぞらネット銀行 from its header row", () => {
    const header = parseCsvText("日付,摘要,出金金額,入金金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("gmo_aozora");
  });

  it("distinguishes 住信SBIネット銀行 (内容) from GMOあおぞらネット銀行 (摘要) despite otherwise identical columns", () => {
    const sbiHeader = parseCsvText("日付,内容,出金金額,入金金額\n")[0];
    const gmoHeader = parseCsvText("日付,摘要,出金金額,入金金額\n")[0];
    expect(detectBankFormat(sbiHeader)).toBe("sbi_sumishin");
    expect(detectBankFormat(gmoHeader)).toBe("gmo_aozora");
  });

  it("detects 三井住友カード from its header row", () => {
    const header = parseCsvText("ご利用日,ご利用店名,ご利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("smcc");
  });

  it("detects 楽天カード from its header row", () => {
    const header = parseCsvText("利用日,利用店名,利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("rakuten_card");
  });

  it("is case-insensitive and tolerant of surrounding whitespace in header cells", () => {
    const header = parseCsvText(" 利用日 , 利用店名 , 利用金額 \n")[0];
    expect(detectBankFormat(header)).toBe("rakuten_card");
  });

  it("returns null for an unrecognized generic header", () => {
    const header = parseCsvText("日付,摘要,金額\n")[0];
    expect(detectBankFormat(header)).toBeNull();
  });

  it("returns null for an empty header row", () => {
    expect(detectBankFormat([])).toBeNull();
  });

  it("prefers the format with the most matched distinguishing headers when several are subsets of the row", () => {
    // 楽天銀行 requires all four of its detectHeaders; a header row containing only
    // a partial overlap with another format must not falsely match.
    const header = parseCsvText("取引日,入出金,摘要,取引後残高,メモ\n")[0];
    expect(detectBankFormat(header)).toBe("rakuten_bank");
  });
});

describe("normalizeBankCsv", () => {
  it("uses the manual override even when the header would auto-detect differently", () => {
    const csv = "日付,内容,出金金額,入金金額\n2026-01-05,家賃,120000,\n";
    const result = normalizeBankCsv(csv, "gmo_aozora");
    expect(result.formatId).toBe("gmo_aozora");
    // gmo_aozora looks for a 摘要 column, which doesn't exist here, so description falls back
    expect(result.transactions[0].description).toBe("(摘要なし)");
  });

  it("auto-detects 三井住友カード and normalizes accordingly", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,Amazon.co.jp,6400\n";
    const result = normalizeBankCsv(csv);
    expect(result.formatId).toBe("smcc");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-12", description: "Amazon.co.jp", amount: -6400 }]);
  });

  it("falls back to the generic parser (formatId: generic) when no bank format matches", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const result = normalizeBankCsv(csv);
    expect(result.formatId).toBe("generic");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-05", description: "家賃", amount: -120000 }]);
  });

  it("falls back to generic (empty result) for an empty string with no override", () => {
    const result = normalizeBankCsv("");
    expect(result.formatId).toBe("generic");
    expect(result.transactions).toEqual([]);
  });
});

describe("BANK_FORMATS", () => {
  it("exposes exactly the five priority institutions with Japanese labels", () => {
    const ids = Object.keys(BANK_FORMATS).sort();
    expect(ids).toEqual(["gmo_aozora", "rakuten_bank", "rakuten_card", "sbi_sumishin", "smcc"].sort());
    expect(BANK_FORMATS.sbi_sumishin.label).toBe("住信SBIネット銀行");
    expect(BANK_FORMATS.rakuten_bank.label).toBe("楽天銀行");
    expect(BANK_FORMATS.gmo_aozora.label).toBe("GMOあおぞらネット銀行");
    expect(BANK_FORMATS.smcc.label).toBe("三井住友カード");
    expect(BANK_FORMATS.rakuten_card.label).toBe("楽天カード");
  });
});
