import { CategorizedTransaction, CategorySource } from "../categorize/engine";
import { DEFAULT_INCOME, EXPENSE_RULES, INCOME_RULES, TaxCategory } from "../categorize/dictionary";
import { decodeCsvBuffer } from "./decode";
import { parseCsvText } from "./parse";

/**
 * freee会計 / マネーフォワード クラウド会計・確定申告からの仕訳帳（journal entry）CSVエクスポートを
 * 取り込み、このアプリの CategorizedTransaction 形状に正規化するモジュール。
 *
 * 目的: docs/business-plan.md 7章「他社会計ソフトからの移行導線」に対応する、乗り換えユーザーの
 * 過去の記帳データを一括インポートする機能（切り替えコストを下げ、既存データを捨てずに移行できるようにする）。
 *
 * 重要な前提・簡略化（要検証。実際のfreee/MFエクスポートで人間による検証が必要）:
 *
 * 1. 列名の想定: 実際のfreee/MFエクスポートのサンプルは入手できていないため、以下は課題文および
 *    一般的な仕訳帳エクスポートの慣例から推測した列名である。
 *    - freee: 日付, 借方勘定科目, 貸方勘定科目, 金額, 摘要
 *    - マネーフォワード クラウド会計/確定申告: 取引日, 借方勘定科目, 貸方科目, 金額, 摘要
 *    実際のエクスポートには補助科目・部門・税区分・借方/貸方それぞれの金額列など、より多くの列が
 *    含まれる可能性が高いが、本パーサは上記の最小列セットのみを読み取り、他の列は無視する。
 *
 * 2. 借方・貸方の1金額への圧縮: このアプリは複式簿記の借方/貸方ペアではなく、銀行明細と同様に
 *    「1取引=1件の符号付き金額」というモデルを採用している。そのため仕訳帳の1行（借方勘定科目・
 *    貸方勘定科目・金額）を必ずどちらか一方の勘定科目に代表させ、符号を決める必要がある。
 *    採用したルール（すべて簡易ヒューリスティックであり、正確な会計処理を保証するものではない）:
 *      a. 貸方勘定科目が「売上」「収入」「受取」等の収益科目に見える場合 → 収入取引として扱う
 *         （account = 貸方勘定科目、amount = +金額）。
 *      b. そうでなく、借方勘定科目が現金・預金・売掛金等の資産科目（BS_ACCOUNT_KEYWORDS）に
 *         見えない場合 → 経費取引として扱う（account = 借方勘定科目、amount = -金額）。
 *         これが典型的な「借方:消耗品費 / 貸方:普通預金」のような支出仕訳に対応する。
 *      c. そうでなく、貸方勘定科目も資産科目に見えない場合 → 収入取引として扱う
 *         （account = 貸方勘定科目、amount = +金額）。
 *      d. 借方・貸方の両方が資産科目に見える場合（口座間振替、借入金の返済等）→ 損益に影響しない
 *         純粋な振替とみなし、account = 借方勘定科目、amount = -金額、taxCategory = "対象外" とする。
 *    このヒューリスティックは「フリーランス・マイクロ法人の記帳は経費行が大半を占める」という
 *    経験則に基づく既定値であり、事業内容によっては誤判定が起こり得る。取り込み後は必ず
 *    利用者自身が勘定科目・金額・符号を確認すること。
 *
 * 3. 消費税区分の推定: 取り込んだ勘定科目名を、このアプリの既存ルール辞書（categorize/dictionary.ts）の
 *    account フィールドと突き合わせ、一致すれば同じ税区分を借用する（例: 「消耗品費」→「課税仕入10%」）。
 *    一致しない場合は taxCategory = "要確認" とし、confidence = 0 / source = "uncategorized" として
 *    レビュー対象であることを明示する。freee/MF側の税区分列は読み取っていない（列自体を前提にしていない）。
 *
 * 4. 移行元ソフトで既に人間が確定させた仕訳という前提のため、勘定科目名そのものは推測せず
 *    CSVの値をそのまま account として採用する（このアプリの摘要文字列ベースの自動仕訳ルールで
 *    再判定すると、移行元での分類結果を上書きしてしまうため）。
 */

export type MigrationFormatId = "freee" | "moneyforward";

interface MigrationFormatDefinition {
  id: MigrationFormatId;
  label: string;
  dateHeaders: string[];
  debitAccountHeaders: string[];
  creditAccountHeaders: string[];
  amountHeaders: string[];
  descHeaders: string[];
  /** 自動判定用。ヘッダー行にこれら全てが（大文字小文字・前後空白を無視して）含まれる場合に一致とみなす */
  detectHeaders: string[];
}

export const MIGRATION_FORMATS: Record<MigrationFormatId, MigrationFormatDefinition> = {
  freee: {
    id: "freee",
    label: "freee会計",
    dateHeaders: ["日付"],
    debitAccountHeaders: ["借方勘定科目"],
    creditAccountHeaders: ["貸方勘定科目"],
    amountHeaders: ["金額"],
    descHeaders: ["摘要"],
    detectHeaders: ["日付", "借方勘定科目", "貸方勘定科目", "金額", "摘要"],
  },
  moneyforward: {
    id: "moneyforward",
    label: "マネーフォワード クラウド会計/確定申告",
    dateHeaders: ["取引日"],
    debitAccountHeaders: ["借方勘定科目"],
    creditAccountHeaders: ["貸方科目"],
    amountHeaders: ["金額"],
    descHeaders: ["摘要"],
    detectHeaders: ["取引日", "借方勘定科目", "貸方科目", "金額", "摘要"],
  },
};

// 借方・貸方どちらの科目名が「資産・負債・純資産」等のBS科目（＝損益に直接関係しない口座）かを
// 判定するためのキーワード集。ここに一致しない科目名は、経費/収益等のPL科目とみなす。
const BS_ACCOUNT_KEYWORDS = [
  "現金",
  "小口現金",
  "普通預金",
  "当座預金",
  "定期預金",
  "売掛金",
  "買掛金",
  "未払金",
  "未収入金",
  "前受金",
  "前払金",
  "仮払金",
  "仮受金",
  "事業主貸",
  "事業主借",
  "元入金",
  "資本金",
  "借入金",
];

// 貸方科目名が収益科目らしいと判断するためのキーワード集
const INCOME_ACCOUNT_KEYWORDS = ["売上", "収入", "受取"];

function isBsAccount(account: string): boolean {
  return BS_ACCOUNT_KEYWORDS.some((k) => account.includes(k));
}

function looksLikeIncomeAccount(account: string): boolean {
  return INCOME_ACCOUNT_KEYWORDS.some((k) => account.includes(k));
}

// dictionary.ts の勘定科目名 → 税区分 の逆引きマップ（同名科目が複数ルールにある場合は先勝ち）
function buildAccountTaxCategoryMap(rules: { account: string; taxCategory: TaxCategory }[]): Map<string, TaxCategory> {
  const map = new Map<string, TaxCategory>();
  for (const rule of rules) {
    if (!map.has(rule.account)) map.set(rule.account, rule.taxCategory);
  }
  return map;
}

const EXPENSE_ACCOUNT_TAX_CATEGORY = buildAccountTaxCategoryMap(EXPENSE_RULES);
// DEFAULT_INCOME（account: "売上高"）も含める。仕訳帳の貸方に最も頻出する収益科目だが、
// dictionary.ts の INCOME_RULES 配列自体には（フォールバック用の別エクスポートのため）含まれていない。
const INCOME_ACCOUNT_TAX_CATEGORY = buildAccountTaxCategoryMap([...INCOME_RULES, DEFAULT_INCOME]);

interface CollapsedLeg {
  account: string;
  amount: number;
  taxCategory: TaxCategory;
  confidence: number;
  source: CategorySource;
}

/**
 * 仕訳帳1行（借方勘定科目・貸方勘定科目・金額）を、このアプリの単一符号付き金額モデルに圧縮する。
 * 判定ロジックの詳細はファイル冒頭のコメント（前提2）を参照。
 */
function collapseDebitCredit(debitAccount: string, creditAccount: string, amount: number): CollapsedLeg {
  const absAmount = Math.abs(amount);
  const debitIsBs = debitAccount ? isBsAccount(debitAccount) : true;
  const creditIsBs = creditAccount ? isBsAccount(creditAccount) : true;

  // a. 貸方が明確に収益科目に見える場合は収入取引として扱う
  if (creditAccount && looksLikeIncomeAccount(creditAccount)) {
    return incomeLeg(creditAccount, absAmount);
  }

  // b. 借方がBS科目でない（＝経費科目に見える）場合は経費取引として扱う
  if (debitAccount && !debitIsBs) {
    return expenseLeg(debitAccount, absAmount);
  }

  // c. 上記のいずれにも該当せず、貸方もBS科目に見えない場合は貸方側を収入取引として扱う
  if (creditAccount && !creditIsBs) {
    return incomeLeg(creditAccount, absAmount);
  }

  // d. 借方・貸方の両方がBS科目に見える場合（口座間振替、借入金の返済等）は、損益に影響しない
  //    純粋な振替とみなす。片方の科目名しか取得できなかった場合（列が空・未検出等）は、
  //    確信を持って「対象外」と判定できないため taxCategory = "要確認" とし、レビュー対象にする。
  const account = debitAccount || creditAccount || "要確認(未分類)";
  const bothSidesKnown = Boolean(debitAccount) && Boolean(creditAccount);
  return {
    account,
    amount: -absAmount,
    taxCategory: bothSidesKnown ? "対象外" : "要確認",
    confidence: bothSidesKnown ? 1 : 0,
    source: bothSidesKnown ? "rule" : "uncategorized",
  };
}

function expenseLeg(account: string, absAmount: number): CollapsedLeg {
  const taxCategory = EXPENSE_ACCOUNT_TAX_CATEGORY.get(account);
  return {
    account,
    amount: -absAmount,
    taxCategory: taxCategory ?? "要確認",
    confidence: taxCategory ? 1 : 0,
    source: taxCategory ? "rule" : "uncategorized",
  };
}

function incomeLeg(account: string, absAmount: number): CollapsedLeg {
  const taxCategory = INCOME_ACCOUNT_TAX_CATEGORY.get(account);
  return {
    account,
    amount: absAmount,
    taxCategory: taxCategory ?? "要確認",
    confidence: taxCategory ? 1 : 0,
    source: taxCategory ? "rule" : "uncategorized",
  };
}

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
 * CSVのヘッダー行から、freee/マネーフォワードのどちらの仕訳帳フォーマットに一致するかを推測する。
 * どちらにも一致しない場合は null を返す（bankFormats.ts の detectBankFormat と同様の考え方）。
 */
export function detectMigrationFormat(header: string[]): MigrationFormatId | null {
  const candidates = Object.values(MIGRATION_FORMATS).filter((def) =>
    def.detectHeaders.every((h) => hasHeader(header, h))
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.detectHeaders.length - a.detectHeaders.length);
  return candidates[0].id;
}

export interface MigrationDetectedColumns {
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
  description: string;
}

export interface MigrationParseResult {
  transactions: CategorizedTransaction[];
  skippedRows: number;
  detectedColumns: MigrationDetectedColumns;
}

function emptyResult(): MigrationParseResult {
  return {
    transactions: [],
    skippedRows: 0,
    detectedColumns: { date: "?", debitAccount: "?", creditAccount: "?", amount: "?", description: "?" },
  };
}

function normalizeRows(rows: string[][], def: MigrationFormatDefinition): MigrationParseResult {
  if (rows.length === 0) return emptyResult();

  const header = rows[0];
  const dateIdx = findColumn(header, def.dateHeaders);
  const debitIdx = findColumn(header, def.debitAccountHeaders);
  const creditIdx = findColumn(header, def.creditAccountHeaders);
  const amountIdx = findColumn(header, def.amountHeaders);
  const descIdx = findColumn(header, def.descHeaders);

  const transactions: CategorizedTransaction[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = dateIdx >= 0 ? r[dateIdx]?.trim() : "";
    const debitAccount = debitIdx >= 0 ? r[debitIdx]?.trim() ?? "" : "";
    const creditAccount = creditIdx >= 0 ? r[creditIdx]?.trim() ?? "" : "";
    const description = descIdx >= 0 ? r[descIdx]?.trim() : "";
    const rawAmount = amountIdx >= 0 ? toNumber(r[amountIdx] ?? "0") : 0;

    if (!date && !debitAccount && !creditAccount && !description && rawAmount === 0) {
      skipped++;
      continue;
    }

    const collapsed = collapseDebitCredit(debitAccount, creditAccount, rawAmount);

    transactions.push({
      id: `migration-row-${i}`,
      date: date || "不明",
      description: description || "(摘要なし)",
      amount: collapsed.amount,
      account: collapsed.account,
      taxCategory: collapsed.taxCategory,
      confidence: collapsed.confidence,
      source: collapsed.source,
      note: "移行インポート（元データの勘定科目を保持。税区分・符号は自動推定のため要確認）",
    });
  }

  return {
    transactions,
    skippedRows: skipped,
    detectedColumns: {
      date: dateIdx >= 0 ? header[dateIdx] : "未検出",
      debitAccount: debitIdx >= 0 ? header[debitIdx] : "未検出",
      creditAccount: creditIdx >= 0 ? header[creditIdx] : "未検出",
      amount: amountIdx >= 0 ? header[amountIdx] : "未検出",
      description: descIdx >= 0 ? header[descIdx] : "未検出",
    },
  };
}

/** 指定したフォーマット（freee/MF）で生CSVテキストを正規化する（手動指定用） */
export function parseMigrationCsvWithFormat(text: string, formatId: MigrationFormatId): MigrationParseResult {
  const rows = parseCsvText(text);
  return normalizeRows(rows, MIGRATION_FORMATS[formatId]);
}

export interface MigrationCsvTextResult extends MigrationParseResult {
  /** 自動判定または手動指定で使われたフォーマットID。判定不能な場合は null（freee/MF形式として認識できなかった） */
  formatId: MigrationFormatId | null;
}

/**
 * CSVテキストをfreee/マネーフォワードの仕訳帳エクスポートとして正規化する。
 * formatId を指定すればそのフォーマットとして処理し（手動オーバーライド）、未指定の場合は
 * ヘッダー行から自動判定する。どちらのフォーマットにも一致しない場合は formatId: null とし、
 * 空の結果を返す（銀行明細CSVのような汎用フォールバックは行わない。仕訳帳特有の借方/貸方構造を
 * 前提としているため、汎用パーサでは意味のある正規化ができないため）。
 */
export function parseMigrationCsvText(text: string, formatId?: MigrationFormatId): MigrationCsvTextResult {
  if (formatId) {
    return { formatId, ...parseMigrationCsvWithFormat(text, formatId) };
  }

  const rows = parseCsvText(text);
  const detected = rows.length > 0 ? detectMigrationFormat(rows[0]) : null;

  if (detected) {
    return { formatId: detected, ...normalizeRows(rows, MIGRATION_FORMATS[detected]) };
  }

  return { formatId: null, ...emptyResult() };
}

export interface MigrationImportResult extends MigrationCsvTextResult {
  encoding: "utf-8" | "shift_jis";
}

/**
 * ファイルの生バイト列（ArrayBuffer）を受け取り、文字コード判定（decode.tsを再利用）→CSV解析→
 * freee/MF仕訳帳としての正規化、まで一気通貫で行うエントリポイント。
 * クライアント（ブラウザ）でのファイルアップロード処理から呼び出す想定。
 */
export function parseMigrationCsvBuffer(buffer: ArrayBuffer, formatId?: MigrationFormatId): MigrationImportResult {
  const { text, encoding } = decodeCsvBuffer(buffer);
  return { ...parseMigrationCsvText(text, formatId), encoding };
}
