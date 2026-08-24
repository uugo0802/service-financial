import { describe, expect, it } from "vitest";
import {
  MIGRATION_FORMATS,
  detectMigrationFormat,
  parseMigrationCsvBuffer,
  parseMigrationCsvText,
  parseMigrationCsvWithFormat,
} from "./migrationImport";
import { parseCsvText } from "./parse";

describe("parseMigrationCsvWithFormat", () => {
  it("normalizes a freee journal export: expense row (借方 non-BS account) becomes a negative amount, keeping the original account name", () => {
    const csv =
      "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-01-12,消耗品費,普通預金,6400,Amazon.co.jpでの購入\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions).toEqual([
      {
        id: "migration-row-1",
        date: "2026-01-12",
        description: "Amazon.co.jpでの購入",
        amount: -6400,
        account: "消耗品費",
        taxCategory: "課税仕入10%",
        confidence: 1,
        source: "rule",
        note: "移行インポート（元データの勘定科目を保持。税区分・符号は自動推定のため要確認）",
      },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "日付",
      debitAccount: "借方勘定科目",
      creditAccount: "貸方勘定科目",
      amount: "金額",
      description: "摘要",
    });
  });

  it("normalizes a freee journal export: income row (貸方 revenue account) becomes a positive amount", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-01-15,普通預金,売上高,300000,A社 業務委託料\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions).toEqual([
      {
        id: "migration-row-1",
        date: "2026-01-15",
        description: "A社 業務委託料",
        amount: 300000,
        account: "売上高",
        taxCategory: "課税売上10%",
        confidence: 1,
        source: "rule",
        note: "移行インポート（元データの勘定科目を保持。税区分・符号は自動推定のため要確認）",
      },
    ]);
  });

  it("treats a transfer between two BS accounts (both 借方/貸方 are cash/bank-like) as a non-P&L transfer with taxCategory 対象外", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-02-01,現金,普通預金,50000,ATMで引き出し\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0]).toMatchObject({
      account: "現金",
      amount: -50000,
      taxCategory: "対象外",
      confidence: 1,
      source: "rule",
    });
  });

  it("marks an account name with no match in the existing dictionary as 要確認/uncategorized while still preserving the account name", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-02-03,雑費,普通預金,1200,謎の引き落とし\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0]).toMatchObject({
      account: "雑費",
      amount: -1200,
      taxCategory: "要確認",
      confidence: 0,
      source: "uncategorized",
    });
  });

  it("normalizes a マネーフォワード journal export using its 取引日/貸方科目 column names", () => {
    const csv = "取引日,借方勘定科目,貸方科目,金額,摘要\n" + "2026-03-01,地代家賃,普通預金,120000,オフィス家賃\n";
    const result = parseMigrationCsvWithFormat(csv, "moneyforward");
    expect(result.transactions).toEqual([
      {
        id: "migration-row-1",
        date: "2026-03-01",
        description: "オフィス家賃",
        amount: -120000,
        account: "地代家賃",
        taxCategory: "課税仕入10%",
        confidence: 1,
        source: "rule",
        note: "移行インポート（元データの勘定科目を保持。税区分・符号は自動推定のため要確認）",
      },
    ]);
    expect(result.detectedColumns).toEqual({
      date: "取引日",
      debitAccount: "借方勘定科目",
      creditAccount: "貸方科目",
      amount: "金額",
      description: "摘要",
    });
  });

  it("strips yen signs and thousands-separator commas before parsing the 金額 column", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + '2026-01-12,消耗品費,普通預金,"¥12,800",家電量販店\n';
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0].amount).toBe(-12800);
  });

  // Regression: full-width (全角) digits/comma are used by some legacy exports and by users
  // hand-editing a CSV on a Japanese IME. Before NFKC normalization was added to this module's
  // toNumber() (matching the fix already applied in parse.ts/bankFormats.ts), Number("１２０，０００")
  // was NaN and toNumber() silently fell back to 0, making a real migrated expense vanish.
  it("parses a full-width (全角) 金額 value with a full-width thousands comma, not silently treating it as zero", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-01-12,消耗品費,普通預金,１２０，０００,パソコン購入\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0].amount).toBe(-120000);
  });

  it("counts a fully blank data row as skipped, not as a zero-amount transaction", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-01-05,消耗品費,普通預金,1000,文房具\n,,,,\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(0); // parseCsvText already drops the fully-blank row before it reaches us
  });

  it("falls back to 不明/(摘要なし) placeholders when date/description are missing but the row is otherwise non-blank", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + ",消耗品費,普通預金,500,\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0]).toMatchObject({ date: "不明", description: "(摘要なし)" });
  });

  it("marks missing columns as 未検出 when the CSV doesn't match the requested format's columns", () => {
    const csv = "foo,bar\n1,2\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.detectedColumns).toEqual({
      date: "未検出",
      debitAccount: "未検出",
      creditAccount: "未検出",
      amount: "未検出",
      description: "未検出",
    });
  });

  it("returns an empty result for an empty string", () => {
    const result = parseMigrationCsvWithFormat("", "freee");
    expect(result).toEqual({
      transactions: [],
      skippedRows: 0,
      detectedColumns: { date: "?", debitAccount: "?", creditAccount: "?", amount: "?", description: "?" },
    });
  });

  it("applies collapse rule (c): a 借方 BS account paired with a 貸方 account that is neither BS nor an income keyword is treated as income (documented heuristic limitation)", () => {
    // 借方=普通預金 (BS) so rule (b) does not fire; 貸方=旅費交通費 is neither a BS account nor
    // an income keyword, so rule (c) collapses it as an income leg on the credit side even though
    // 旅費交通費 is ordinarily an expense account. This is the documented fallback in case neither
    // side looks like income/BS, and it is currently completely untested.
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-04-10,普通預金,旅費交通費,5000,経費の取消し\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0]).toMatchObject({
      account: "旅費交通費",
      amount: 5000,
      taxCategory: "要確認",
      confidence: 0,
      source: "uncategorized",
    });
  });

  it("falls back to '要確認(未分類)' as a pure transfer when neither debit nor credit account columns are detected at all", () => {
    // Neither format's debit/credit headers are present, so both accounts resolve to "" and
    // isBsAccount("") short-circuits to true via the ternary default, landing in branch (d) with
    // bothSidesKnown=false.
    const csv = "日付,摘要,金額\n" + "2026-01-05,家賃,120000\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0]).toMatchObject({
      account: "要確認(未分類)",
      amount: -120000,
      taxCategory: "要確認",
      confidence: 0,
      source: "uncategorized",
    });
  });

  it("ignores the original sign of the 金額 column: the debit/credit heuristic alone determines the resulting sign", () => {
    // Even though the raw CSV value is negative, absAmount is taken via Math.abs before the
    // debit/credit heuristic assigns the sign, so an expense row stays negative regardless of
    // whether the source system exported a positive or negative number.
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n" + "2026-01-12,消耗品費,普通預金,-6400,文房具\n";
    const result = parseMigrationCsvWithFormat(csv, "freee");
    expect(result.transactions[0].amount).toBe(-6400);
  });
});

describe("detectMigrationFormat", () => {
  it("detects freee from its header row (日付/貸方勘定科目)", () => {
    const header = parseCsvText("日付,借方勘定科目,貸方勘定科目,金額,摘要\n")[0];
    expect(detectMigrationFormat(header)).toBe("freee");
  });

  it("detects マネーフォワード from its header row (取引日/貸方科目)", () => {
    const header = parseCsvText("取引日,借方勘定科目,貸方科目,金額,摘要\n")[0];
    expect(detectMigrationFormat(header)).toBe("moneyforward");
  });

  it("is case-insensitive and tolerant of surrounding whitespace in header cells", () => {
    const header = parseCsvText(" 取引日 , 借方勘定科目 , 貸方科目 , 金額 , 摘要 \n")[0];
    expect(detectMigrationFormat(header)).toBe("moneyforward");
  });

  it("returns null for a bank CSV header (not a journal export at all)", () => {
    const header = parseCsvText("日付,内容,出金金額,入金金額,残高\n")[0];
    expect(detectMigrationFormat(header)).toBeNull();
  });

  it("returns null for an empty header row", () => {
    expect(detectMigrationFormat([])).toBeNull();
  });
});

describe("parseMigrationCsvText", () => {
  it("auto-detects freee and normalizes accordingly", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n2026-01-12,消耗品費,普通預金,6400,Amazon\n";
    const result = parseMigrationCsvText(csv);
    expect(result.formatId).toBe("freee");
    expect(result.transactions[0]).toMatchObject({ account: "消耗品費", amount: -6400 });
  });

  it("uses the manual override even when the header would auto-detect differently", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n2026-01-05,消耗品費,普通預金,1000,文房具\n";
    const result = parseMigrationCsvText(csv, "moneyforward");
    expect(result.formatId).toBe("moneyforward");
    // moneyforward looks for a 取引日/貸方科目 column, neither of which exists in this freee-shaped CSV
    expect(result.detectedColumns.date).toBe("未検出");
    expect(result.detectedColumns.creditAccount).toBe("未検出");
  });

  it("returns formatId null (no generic fallback) when the header matches neither freee nor MF", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n";
    const result = parseMigrationCsvText(csv);
    expect(result.formatId).toBeNull();
    expect(result.transactions).toEqual([]);
  });

  it("returns formatId null for an empty string with no override", () => {
    const result = parseMigrationCsvText("");
    expect(result.formatId).toBeNull();
    expect(result.transactions).toEqual([]);
  });
});

describe("parseMigrationCsvBuffer", () => {
  it("decodes a UTF-8 buffer and normalizes it as a freee journal export", () => {
    const csv = "日付,借方勘定科目,貸方勘定科目,金額,摘要\n2026-01-12,消耗品費,普通預金,6400,Amazon\n";
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseMigrationCsvBuffer(buffer);

    expect(result.encoding).toBe("utf-8");
    expect(result.formatId).toBe("freee");
    expect(result.transactions[0]).toMatchObject({ account: "消耗品費", amount: -6400 });
  });

  it("decodes a Shift-JIS (CP932) buffer via decodeCsvBuffer before parsing", () => {
    // Real Shift-JIS bytes for "日付,借方勘定科目,貸方勘定科目,金額,摘要\n2026-01-05,地代家賃,普通預金,120000,家賃\n",
    // produced with `iconv -f UTF-8 -t SHIFT_JIS` and verified to round-trip via TextDecoder("shift_jis")
    // (same technique as decode.test.ts). These bytes are not valid UTF-8, so decodeCsvBuffer must fall
    // back to the shift_jis branch before migrationImport gets to parse the text.
    const sjisBytes = new Uint8Array([
      0x93, 0xfa, 0x95, 0x74, 0x2c, 0x8e, 0xd8, 0x95, 0xfb, 0x8a, 0xa8, 0x92, 0xe8, 0x89, 0xc8, 0x96, 0xda, 0x2c,
      0x91, 0xdd, 0x95, 0xfb, 0x8a, 0xa8, 0x92, 0xe8, 0x89, 0xc8, 0x96, 0xda, 0x2c, 0x8b, 0xe0, 0x8a, 0x7a, 0x2c,
      0x93, 0x45, 0x97, 0x76, 0x0a, 0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x31, 0x2d, 0x30, 0x35, 0x2c, 0x92, 0x6e,
      0x91, 0xe3, 0x89, 0xc6, 0x92, 0xc0, 0x2c, 0x95, 0x81, 0x92, 0xca, 0x97, 0x61, 0x8b, 0xe0, 0x2c, 0x31, 0x32,
      0x30, 0x30, 0x30, 0x30, 0x2c, 0x89, 0xc6, 0x92, 0xc0, 0x0a,
    ]);

    const result = parseMigrationCsvBuffer(sjisBytes.buffer);

    expect(result.encoding).toBe("shift_jis");
    expect(result.formatId).toBe("freee");
    expect(result.transactions[0]).toMatchObject({ account: "地代家賃", amount: -120000 });
  });
});

describe("MIGRATION_FORMATS", () => {
  it("exposes exactly the two supported source formats with Japanese labels", () => {
    const ids = Object.keys(MIGRATION_FORMATS).sort();
    expect(ids).toEqual(["freee", "moneyforward"].sort());
    expect(MIGRATION_FORMATS.freee.label).toBe("freee会計");
    expect(MIGRATION_FORMATS.moneyforward.label).toBe("マネーフォワード クラウド会計/確定申告");
  });
});
