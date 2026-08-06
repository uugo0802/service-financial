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

  it("normalizes ゆうちょ銀行 (split withdraw/deposit, お取り扱い内容 column)", () => {
    const csv =
      "取扱日,お取り扱い内容,お引出し,お預入れ,残高\n2026-01-07,通信費引落,5500,,300000\n2026-01-09,配当入金,,20000,320000\n";
    const result = normalizeCsvWithBankFormat(csv, "yucho");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-07", description: "通信費引落", amount: -5500 },
      { id: "row-2", date: "2026-01-09", description: "配当入金", amount: 20000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取扱日",
      description: "お取り扱い内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes みずほ銀行 (split withdraw/deposit, 年月日/取引内容 columns)", () => {
    const csv = "年月日,取引内容,出金,入金,残高\n2026-01-11,消耗品費引落,3200,,600000\n2026-01-13,業務委託料入金,,150000,750000\n";
    const result = normalizeCsvWithBankFormat(csv, "mizuho");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-11", description: "消耗品費引落", amount: -3200 },
      { id: "row-2", date: "2026-01-13", description: "業務委託料入金", amount: 150000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "年月日",
      description: "取引内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes 三菱UFJ銀行 (split withdraw/deposit, 入出金先内容 column)", () => {
    const csv = "取引日,入出金先内容,お支払金額,お預入れ,残高\n2026-01-14,地代家賃引落,90000,,400000\n2026-01-16,売掛金入金,,300000,700000\n";
    const result = normalizeCsvWithBankFormat(csv, "mufg");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-14", description: "地代家賃引落", amount: -90000 },
      { id: "row-2", date: "2026-01-16", description: "売掛金入金", amount: 300000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取引日",
      description: "入出金先内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes 三井住友銀行 (split withdraw/deposit, 年月日/摘要 columns with polite お支払い金額/お預り金額)", () => {
    const csv =
      "年月日,摘要,お支払い金額,お預り金額,残高\n2026-01-19,家賃引落,110000,,900000\n2026-01-21,売上入金,,250000,1150000\n";
    const result = normalizeCsvWithBankFormat(csv, "smbc_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-19", description: "家賃引落", amount: -110000 },
      { id: "row-2", date: "2026-01-21", description: "売上入金", amount: 250000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "年月日",
      description: "摘要",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes りそな銀行 (split withdraw/deposit, 支払金額/預り金額 columns without お prefix)", () => {
    const csv = "取引日,摘要,支払金額,預り金額,残高\n2026-01-23,通信費引落,6800,,400000\n2026-01-25,業務委託料入金,,180000,580000\n";
    const result = normalizeCsvWithBankFormat(csv, "resona_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-23", description: "通信費引落", amount: -6800 },
      { id: "row-2", date: "2026-01-25", description: "業務委託料入金", amount: 180000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取引日",
      description: "摘要",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes イオン銀行 (single signed 取引金額 column)", () => {
    const csv = "取引日,摘要,取引金額,残高\n2026-01-27,消耗品費引落,-4200,395800\n2026-01-29,業務委託料入金,90000,485800\n";
    const result = normalizeCsvWithBankFormat(csv, "aeon_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-27", description: "消耗品費引落", amount: -4200 },
      { id: "row-2", date: "2026-01-29", description: "業務委託料入金", amount: 90000 },
    ]);
    expect(result.detectedColumns).toEqual({ date: "取引日", description: "摘要", amount: "取引金額" });
  });

  it("normalizes PayPay銀行 (split withdraw/deposit, 日付/内容 columns with short 出金/入金 amount headers)", () => {
    const csv = "日付,内容,出金,入金,残高\n2026-01-30,家賃引落,95000,,300000\n2026-02-02,業務委託料入金,,220000,520000\n";
    const result = normalizeCsvWithBankFormat(csv, "paypay_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-30", description: "家賃引落", amount: -95000 },
      { id: "row-2", date: "2026-02-02", description: "業務委託料入金", amount: 220000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "日付",
      description: "内容",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes ソニー銀行 (split withdraw/deposit, 取引日/摘要 columns with 出金額/入金額 amount headers)", () => {
    const csv = "取引日,摘要,出金額,入金額,残高\n2026-02-03,通信費引落,7200,,410000\n2026-02-05,売上入金,,320000,730000\n";
    const result = normalizeCsvWithBankFormat(csv, "sony_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-02-03", description: "通信費引落", amount: -7200 },
      { id: "row-2", date: "2026-02-05", description: "売上入金", amount: 320000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取引日",
      description: "摘要",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes セブン銀行 (single signed 入出金額 column)", () => {
    const csv = "取引日,摘要,入出金額,残高\n2026-02-04,ATM出金,-10000,90000\n2026-02-06,ATM入金,50000,140000\n";
    const result = normalizeCsvWithBankFormat(csv, "seven_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-02-04", description: "ATM出金", amount: -10000 },
      { id: "row-2", date: "2026-02-06", description: "ATM入金", amount: 50000 },
    ]);
    expect(result.detectedColumns).toEqual({ date: "取引日", description: "摘要", amount: "入出金額" });
  });

  it("normalizes SBI新生銀行 (split withdraw/deposit, お引出し金額/お預入れ金額 amount headers)", () => {
    const csv =
      "取引日,摘要,お引出し金額,お預入れ金額,残高\n2026-02-07,消耗品費引落,4300,,610000\n2026-02-09,業務委託料入金,,210000,820000\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_shinsei_bank");
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-02-07", description: "消耗品費引落", amount: -4300 },
      { id: "row-2", date: "2026-02-09", description: "業務委託料入金", amount: 210000 },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取引日",
      description: "摘要",
      amount: "出金/入金列を合成",
    });
  });

  it("normalizes JCBカード (positive usage amount negated to an expense, ご利用先 column)", () => {
    const csv = "ご利用日,ご利用先,ご利用金額\n2026-01-18,セブンイレブン,980\n";
    const result = normalizeCsvWithBankFormat(csv, "jcb_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-18", description: "セブンイレブン", amount: -980 }]);
    expect(result.detectedColumns).toEqual({ date: "ご利用日", description: "ご利用先", amount: "ご利用金額" });
  });

  it("normalizes PayPayカード (positive usage amount negated to an expense, 利用店名・商品名 column)", () => {
    const csv = "ご利用日,利用店名・商品名,ご利用金額\n2026-01-22,PayPayモール,4500\n";
    const result = normalizeCsvWithBankFormat(csv, "paypay_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-22", description: "PayPayモール", amount: -4500 }]);
    expect(result.detectedColumns).toEqual({
      date: "ご利用日",
      description: "利用店名・商品名",
      amount: "ご利用金額",
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

  it("normalizes au PAYカード (positive usage amount negated to an expense, 利用先 column)", () => {
    const csv = "利用日,利用先,利用金額\n2026-02-08,ローソン,650\n";
    const result = normalizeCsvWithBankFormat(csv, "au_pay_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-02-08", description: "ローソン", amount: -650 }]);
    expect(result.detectedColumns).toEqual({ date: "利用日", description: "利用先", amount: "利用金額" });
  });

  it("normalizes dカード (positive usage amount negated to an expense, ご利用店名等 column)", () => {
    const csv = "ご利用日,ご利用店名等,ご利用金額\n2026-02-10,ドコモショップ,5400\n";
    const result = normalizeCsvWithBankFormat(csv, "d_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-02-10", description: "ドコモショップ", amount: -5400 }]);
    expect(result.detectedColumns).toEqual({ date: "ご利用日", description: "ご利用店名等", amount: "ご利用金額" });
  });

  it("normalizes オリコカード (positive usage amount negated to an expense, 利用先名称 column)", () => {
    const csv = "利用日,利用先名称,利用金額\n2026-02-11,ビックカメラ,32000\n";
    const result = normalizeCsvWithBankFormat(csv, "orico_card");
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-02-11", description: "ビックカメラ", amount: -32000 }]);
    expect(result.detectedColumns).toEqual({ date: "利用日", description: "利用先名称", amount: "利用金額" });
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

  // Regression: full-width (全角) digits/comma/yen sign are used by some legacy bank exports
  // and by users hand-editing CSVs on a Japanese IME. Before NFKC normalization was added,
  // Number("１２，８００") was NaN and toNumber() silently fell back to 0, making a real
  // expense vanish from the ledger instead of surfacing a parse error.
  it("parses a full-width (全角) amount with a full-width thousands comma, not silently treating it as zero", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,家電量販店,１２，８００\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.transactions[0].amount).toBe(-12800);
  });

  it("parses a full-width amount combined with a full-width yen sign", () => {
    const csv = "ご利用日,ご利用店名,ご利用金額\n2026-01-12,家電量販店,￥１２８００\n";
    const result = normalizeCsvWithBankFormat(csv, "smcc");
    expect(result.transactions[0].amount).toBe(-12800);
  });

  it("parses a full-width negative amount in a split withdraw/deposit column", () => {
    const csv = "日付,内容,出金金額,入金金額,残高\n2026-01-05,家賃引落,１２０，０００,,880000\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_sumishin");
    expect(result.transactions[0].amount).toBe(-120000);
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

  // 全角数字の回帰テスト（三井住友銀行/りそな銀行/イオン銀行/au PAYカード/dカード）。
  // toNumber() は raw.normalize("NFKC") で全角→半角に正規化してから解析するため、
  // 正規化前は Number("１１０，０００") が NaN になり金額が黙って0円になっていた。
  it("parses a full-width (全角) amount for 三井住友銀行 (smbc_bank, split withdraw column)", () => {
    const csv = "年月日,摘要,お支払い金額,お預り金額,残高\n2026-01-19,家賃引落,１１０，０００,,900000\n";
    const result = normalizeCsvWithBankFormat(csv, "smbc_bank");
    expect(result.transactions[0].amount).toBe(-110000);
  });

  it("parses a full-width (全角) amount for りそな銀行 (resona_bank, split deposit column)", () => {
    const csv = "取引日,摘要,支払金額,預り金額,残高\n2026-01-25,業務委託料入金,,１８０，０００,580000\n";
    const result = normalizeCsvWithBankFormat(csv, "resona_bank");
    expect(result.transactions[0].amount).toBe(180000);
  });

  it("parses a full-width (全角) amount for イオン銀行 (aeon_bank, signed column)", () => {
    const csv = "取引日,摘要,取引金額,残高\n2026-01-27,消耗品費引落,－４２００,395800\n";
    const result = normalizeCsvWithBankFormat(csv, "aeon_bank");
    expect(result.transactions[0].amount).toBe(-4200);
  });

  it("parses a full-width (全角) amount for au PAYカード (au_pay_card, expense-only column)", () => {
    const csv = "利用日,利用先,利用金額\n2026-02-08,ローソン,６５０\n";
    const result = normalizeCsvWithBankFormat(csv, "au_pay_card");
    expect(result.transactions[0].amount).toBe(-650);
  });

  it("parses a full-width (全角) amount for dカード (d_card, expense-only column)", () => {
    const csv = "ご利用日,ご利用店名等,ご利用金額\n2026-02-10,ドコモショップ,５，４００\n";
    const result = normalizeCsvWithBankFormat(csv, "d_card");
    expect(result.transactions[0].amount).toBe(-5400);
  });

  // 全角数字の回帰テスト（PayPay銀行/ソニー銀行/セブン銀行/SBI新生銀行/オリコカード）。
  it("parses a full-width (全角) amount for PayPay銀行 (paypay_bank, split withdraw column)", () => {
    const csv = "日付,内容,出金,入金,残高\n2026-01-30,家賃引落,９５，０００,,300000\n";
    const result = normalizeCsvWithBankFormat(csv, "paypay_bank");
    expect(result.transactions[0].amount).toBe(-95000);
  });

  it("parses a full-width (全角) amount for ソニー銀行 (sony_bank, split deposit column)", () => {
    const csv = "取引日,摘要,出金額,入金額,残高\n2026-02-05,売上入金,,３２０，０００,730000\n";
    const result = normalizeCsvWithBankFormat(csv, "sony_bank");
    expect(result.transactions[0].amount).toBe(320000);
  });

  it("parses a full-width (全角) amount for セブン銀行 (seven_bank, signed column)", () => {
    const csv = "取引日,摘要,入出金額,残高\n2026-02-04,ATM出金,－１００００,90000\n";
    const result = normalizeCsvWithBankFormat(csv, "seven_bank");
    expect(result.transactions[0].amount).toBe(-10000);
  });

  it("parses a full-width (全角) amount for SBI新生銀行 (sbi_shinsei_bank, split withdraw column)", () => {
    const csv = "取引日,摘要,お引出し金額,お預入れ金額,残高\n2026-02-07,消耗品費引落,４，３００,,610000\n";
    const result = normalizeCsvWithBankFormat(csv, "sbi_shinsei_bank");
    expect(result.transactions[0].amount).toBe(-4300);
  });

  it("parses a full-width (全角) amount for オリコカード (orico_card, expense-only column)", () => {
    const csv = "利用日,利用先名称,利用金額\n2026-02-11,ビックカメラ,３２，０００\n";
    const result = normalizeCsvWithBankFormat(csv, "orico_card");
    expect(result.transactions[0].amount).toBe(-32000);
  });

  it("marks missing columns as 未検出 for 三井住友銀行 (split mode) when the CSV doesn't match its withdraw/deposit columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "smbc_bank");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("marks missing columns as 未検出 for イオン銀行 (signed mode) when the CSV doesn't match its columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "aeon_bank");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("marks missing columns as 未検出 for au PAYカード when the CSV doesn't match its columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "au_pay_card");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("marks missing columns as 未検出 for PayPay銀行 (split mode) when the CSV doesn't match its withdraw/deposit columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "paypay_bank");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("marks missing columns as 未検出 for セブン銀行 (signed mode) when the CSV doesn't match its columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "seven_bank");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("marks missing columns as 未検出 for オリコカード when the CSV doesn't match its columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = normalizeCsvWithBankFormat(csv, "orico_card");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });

  it("treats a row missing its amount columns entirely (undefined cells, short row) as a zero-amount row and still emits it when date/description are present", () => {
    // りそな銀行は5列想定だが、末尾の残高・預り金額列が欠けている（短い）行を投入する。
    const csv = "取引日,摘要,支払金額,預り金額,残高\n2026-01-23,通信費引落\n";
    const result = normalizeCsvWithBankFormat(csv, "resona_bank");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: "row-1", date: "2026-01-23", description: "通信費引落", amount: 0 });
  });

  it("skips a fully malformed row (no date, no description, and a non-numeric amount that parses to zero) for dカード", () => {
    const csv = "ご利用日,ご利用店名等,ご利用金額\n,,不明な値\n";
    const result = normalizeCsvWithBankFormat(csv, "d_card");
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(1);
  });

  it("still emits a row for au PAYカード when only the description is present and the amount column is blank", () => {
    const csv = "利用日,利用先,利用金額\n,ローソン,\n";
    const result = normalizeCsvWithBankFormat(csv, "au_pay_card");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: "row-1", date: "不明", description: "ローソン" });
    // toNumber("") -> 0, then Math.abs(0) negated yields -0; assert numeric equality rather than
    // toMatchObject/toBe, which would otherwise treat -0 and 0 as distinct via Object.is.
    expect(result.transactions[0].amount === 0).toBe(true);
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

  it("detects ゆうちょ銀行 from its header row", () => {
    const header = parseCsvText("取扱日,お取り扱い内容,お引出し,お預入れ,残高\n")[0];
    expect(detectBankFormat(header)).toBe("yucho");
  });

  it("detects みずほ銀行 from its header row", () => {
    const header = parseCsvText("年月日,取引内容,出金,入金,残高\n")[0];
    expect(detectBankFormat(header)).toBe("mizuho");
  });

  it("detects 三菱UFJ銀行 from its header row", () => {
    const header = parseCsvText("取引日,入出金先内容,お支払金額,お預入れ,残高\n")[0];
    expect(detectBankFormat(header)).toBe("mufg");
  });

  it("distinguishes 三菱UFJ銀行 (split, 入出金先内容) from 楽天銀行 (signed, 摘要) despite sharing the 取引日 date column", () => {
    const mufgHeader = parseCsvText("取引日,入出金先内容,お支払金額,お預入れ,残高\n")[0];
    const rakutenHeader = parseCsvText("取引日,入出金,摘要,取引後残高\n")[0];
    expect(detectBankFormat(mufgHeader)).toBe("mufg");
    expect(detectBankFormat(rakutenHeader)).toBe("rakuten_bank");
  });

  it("distinguishes ゆうちょ銀行 from 三菱UFJ銀行 despite both using an お預入れ deposit column", () => {
    const yuchoHeader = parseCsvText("取扱日,お取り扱い内容,お引出し,お預入れ\n")[0];
    const mufgHeader = parseCsvText("取引日,入出金先内容,お支払金額,お預入れ\n")[0];
    expect(detectBankFormat(yuchoHeader)).toBe("yucho");
    expect(detectBankFormat(mufgHeader)).toBe("mufg");
  });

  it("detects 三井住友銀行 from its header row", () => {
    const header = parseCsvText("年月日,摘要,お支払い金額,お預り金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("smbc_bank");
  });

  it("distinguishes 三井住友銀行 (お支払い金額/お預り金額) from みずほ銀行 (出金/入金) despite sharing the 年月日 date column", () => {
    const smbcHeader = parseCsvText("年月日,摘要,お支払い金額,お預り金額,残高\n")[0];
    const mizuhoHeader = parseCsvText("年月日,取引内容,出金,入金,残高\n")[0];
    expect(detectBankFormat(smbcHeader)).toBe("smbc_bank");
    expect(detectBankFormat(mizuhoHeader)).toBe("mizuho");
  });

  it("detects りそな銀行 from its header row", () => {
    const header = parseCsvText("取引日,摘要,支払金額,預り金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("resona_bank");
  });

  it("distinguishes りそな銀行 (支払金額/預り金額, no お prefix) from 三菱UFJ銀行 (お支払金額/お預入れ) despite sharing 取引日", () => {
    const resonaHeader = parseCsvText("取引日,摘要,支払金額,預り金額,残高\n")[0];
    const mufgHeader = parseCsvText("取引日,入出金先内容,お支払金額,お預入れ,残高\n")[0];
    expect(detectBankFormat(resonaHeader)).toBe("resona_bank");
    expect(detectBankFormat(mufgHeader)).toBe("mufg");
  });

  it("detects イオン銀行 from its header row", () => {
    const header = parseCsvText("取引日,摘要,取引金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("aeon_bank");
  });

  it("distinguishes イオン銀行 (signed 取引金額/残高) from 楽天銀行 (signed 入出金/取引後残高) despite sharing 取引日/摘要", () => {
    const aeonHeader = parseCsvText("取引日,摘要,取引金額,残高\n")[0];
    const rakutenHeader = parseCsvText("取引日,入出金,摘要,取引後残高\n")[0];
    expect(detectBankFormat(aeonHeader)).toBe("aeon_bank");
    expect(detectBankFormat(rakutenHeader)).toBe("rakuten_bank");
  });

  it("distinguishes りそな銀行 (split) from イオン銀行 (signed) despite both sharing 取引日/摘要", () => {
    const resonaHeader = parseCsvText("取引日,摘要,支払金額,預り金額,残高\n")[0];
    const aeonHeader = parseCsvText("取引日,摘要,取引金額,残高\n")[0];
    expect(detectBankFormat(resonaHeader)).toBe("resona_bank");
    expect(detectBankFormat(aeonHeader)).toBe("aeon_bank");
  });

  it("detects PayPay銀行 from its header row", () => {
    const header = parseCsvText("日付,内容,出金,入金,残高\n")[0];
    expect(detectBankFormat(header)).toBe("paypay_bank");
  });

  it("distinguishes PayPay銀行 (出金/入金, no 金額 suffix) from 住信SBIネット銀行 (出金金額/入金金額) despite sharing 日付/内容", () => {
    const paypayBankHeader = parseCsvText("日付,内容,出金,入金,残高\n")[0];
    const sbiHeader = parseCsvText("日付,内容,出金金額,入金金額,残高\n")[0];
    expect(detectBankFormat(paypayBankHeader)).toBe("paypay_bank");
    expect(detectBankFormat(sbiHeader)).toBe("sbi_sumishin");
  });

  it("detects ソニー銀行 from its header row", () => {
    const header = parseCsvText("取引日,摘要,出金額,入金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("sony_bank");
  });

  it("distinguishes ソニー銀行 (出金額/入金額) from りそな銀行 (支払金額/預り金額) despite sharing 取引日/摘要", () => {
    const sonyHeader = parseCsvText("取引日,摘要,出金額,入金額,残高\n")[0];
    const resonaHeader = parseCsvText("取引日,摘要,支払金額,預り金額,残高\n")[0];
    expect(detectBankFormat(sonyHeader)).toBe("sony_bank");
    expect(detectBankFormat(resonaHeader)).toBe("resona_bank");
  });

  it("detects セブン銀行 from its header row", () => {
    const header = parseCsvText("取引日,摘要,入出金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("seven_bank");
  });

  it("distinguishes セブン銀行 (signed 入出金額) from イオン銀行 (signed 取引金額) despite sharing 取引日/摘要/残高", () => {
    const sevenHeader = parseCsvText("取引日,摘要,入出金額,残高\n")[0];
    const aeonHeader = parseCsvText("取引日,摘要,取引金額,残高\n")[0];
    expect(detectBankFormat(sevenHeader)).toBe("seven_bank");
    expect(detectBankFormat(aeonHeader)).toBe("aeon_bank");
  });

  it("detects SBI新生銀行 from its header row", () => {
    const header = parseCsvText("取引日,摘要,お引出し金額,お預入れ金額,残高\n")[0];
    expect(detectBankFormat(header)).toBe("sbi_shinsei_bank");
  });

  it("distinguishes SBI新生銀行 (お引出し金額/お預入れ金額) from ゆうちょ銀行 (お引出し/お預入れ) despite the shared お prefix", () => {
    const shinseiHeader = parseCsvText("取引日,摘要,お引出し金額,お預入れ金額,残高\n")[0];
    const yuchoHeader = parseCsvText("取扱日,お取り扱い内容,お引出し,お預入れ,残高\n")[0];
    expect(detectBankFormat(shinseiHeader)).toBe("sbi_shinsei_bank");
    expect(detectBankFormat(yuchoHeader)).toBe("yucho");
  });

  it("detects 三井住友カード from its header row", () => {
    const header = parseCsvText("ご利用日,ご利用店名,ご利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("smcc");
  });

  it("detects 楽天カード from its header row", () => {
    const header = parseCsvText("利用日,利用店名,利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("rakuten_card");
  });

  it("detects JCBカード from its header row", () => {
    const header = parseCsvText("ご利用日,ご利用先,ご利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("jcb_card");
  });

  it("detects PayPayカード from its header row", () => {
    const header = parseCsvText("ご利用日,利用店名・商品名,ご利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("paypay_card");
  });

  it("detects au PAYカード from its header row", () => {
    const header = parseCsvText("利用日,利用先,利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("au_pay_card");
  });

  it("detects dカード from its header row", () => {
    const header = parseCsvText("ご利用日,ご利用店名等,ご利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("d_card");
  });

  it("detects オリコカード from its header row", () => {
    const header = parseCsvText("利用日,利用先名称,利用金額\n")[0];
    expect(detectBankFormat(header)).toBe("orico_card");
  });

  it("distinguishes オリコカード (利用先名称) from au PAYカード (利用先) and 楽天カード (利用店名) despite sharing 利用日/利用金額", () => {
    const oricoHeader = parseCsvText("利用日,利用先名称,利用金額\n")[0];
    const auPayHeader = parseCsvText("利用日,利用先,利用金額\n")[0];
    const rakutenCardHeader = parseCsvText("利用日,利用店名,利用金額\n")[0];
    expect(detectBankFormat(oricoHeader)).toBe("orico_card");
    expect(detectBankFormat(auPayHeader)).toBe("au_pay_card");
    expect(detectBankFormat(rakutenCardHeader)).toBe("rakuten_card");
  });

  it("distinguishes 三井住友カード, JCBカード, and PayPayカード despite all sharing ご利用日/ご利用金額 columns", () => {
    const smccHeader = parseCsvText("ご利用日,ご利用店名,ご利用金額\n")[0];
    const jcbHeader = parseCsvText("ご利用日,ご利用先,ご利用金額\n")[0];
    const paypayHeader = parseCsvText("ご利用日,利用店名・商品名,ご利用金額\n")[0];
    expect(detectBankFormat(smccHeader)).toBe("smcc");
    expect(detectBankFormat(jcbHeader)).toBe("jcb_card");
    expect(detectBankFormat(paypayHeader)).toBe("paypay_card");
  });

  it("distinguishes dカード (ご利用店名等) from 三井住友カード (ご利用店名) despite sharing ご利用日/ご利用金額", () => {
    const dCardHeader = parseCsvText("ご利用日,ご利用店名等,ご利用金額\n")[0];
    const smccHeader = parseCsvText("ご利用日,ご利用店名,ご利用金額\n")[0];
    expect(detectBankFormat(dCardHeader)).toBe("d_card");
    expect(detectBankFormat(smccHeader)).toBe("smcc");
  });

  it("distinguishes au PAYカード (利用先) from 楽天カード (利用店名) despite sharing 利用日/利用金額", () => {
    const auPayHeader = parseCsvText("利用日,利用先,利用金額\n")[0];
    const rakutenCardHeader = parseCsvText("利用日,利用店名,利用金額\n")[0];
    expect(detectBankFormat(auPayHeader)).toBe("au_pay_card");
    expect(detectBankFormat(rakutenCardHeader)).toBe("rakuten_card");
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
  it("exposes exactly the twenty supported institutions with Japanese labels", () => {
    const ids = Object.keys(BANK_FORMATS).sort();
    expect(ids).toEqual(
      [
        "aeon_bank",
        "au_pay_card",
        "d_card",
        "gmo_aozora",
        "jcb_card",
        "mizuho",
        "mufg",
        "orico_card",
        "paypay_bank",
        "paypay_card",
        "rakuten_bank",
        "rakuten_card",
        "resona_bank",
        "sbi_shinsei_bank",
        "sbi_sumishin",
        "seven_bank",
        "smbc_bank",
        "smcc",
        "sony_bank",
        "yucho",
      ].sort()
    );
    expect(BANK_FORMATS.sbi_sumishin.label).toBe("住信SBIネット銀行");
    expect(BANK_FORMATS.rakuten_bank.label).toBe("楽天銀行");
    expect(BANK_FORMATS.gmo_aozora.label).toBe("GMOあおぞらネット銀行");
    expect(BANK_FORMATS.yucho.label).toBe("ゆうちょ銀行");
    expect(BANK_FORMATS.mizuho.label).toBe("みずほ銀行");
    expect(BANK_FORMATS.mufg.label).toBe("三菱UFJ銀行");
    expect(BANK_FORMATS.smbc_bank.label).toBe("三井住友銀行");
    expect(BANK_FORMATS.resona_bank.label).toBe("りそな銀行");
    expect(BANK_FORMATS.aeon_bank.label).toBe("イオン銀行");
    expect(BANK_FORMATS.paypay_bank.label).toBe("PayPay銀行");
    expect(BANK_FORMATS.sony_bank.label).toBe("ソニー銀行");
    expect(BANK_FORMATS.seven_bank.label).toBe("セブン銀行");
    expect(BANK_FORMATS.sbi_shinsei_bank.label).toBe("SBI新生銀行");
    expect(BANK_FORMATS.smcc.label).toBe("三井住友カード");
    expect(BANK_FORMATS.rakuten_card.label).toBe("楽天カード");
    expect(BANK_FORMATS.jcb_card.label).toBe("JCBカード");
    expect(BANK_FORMATS.paypay_card.label).toBe("PayPayカード");
    expect(BANK_FORMATS.au_pay_card.label).toBe("au PAYカード");
    expect(BANK_FORMATS.d_card.label).toBe("dカード");
    expect(BANK_FORMATS.orico_card.label).toBe("オリコカード");
  });
});
