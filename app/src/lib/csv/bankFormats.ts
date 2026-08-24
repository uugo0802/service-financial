import { Transaction } from "../categorize/engine";
import { normalizeCsv, parseCsvText, ParseResult } from "./parse";

/**
 * 銀行・カード会社ごとのCSV列マッピング（住信SBIネット銀行・楽天銀行・
 * GMOあおぞらネット銀行・ゆうちょ銀行・みずほ銀行・三菱UFJ銀行・三井住友銀行・
 * りそな銀行・イオン銀行・PayPay銀行・ソニー銀行・セブン銀行・SBI新生銀行・
 * 三井住友カード・楽天カード・JCBカード・PayPayカード・au PAYカード・
 * dカード・オリコカード）。
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
 * - ゆうちょ銀行: 列は「取扱日,お取り扱い内容,お引出し,お預入れ,残高」を想定
 *   （出金/入金分離型。「取扱日」「お取り扱い内容」という他行にない独自の
 *   列名で区別している）。
 * - みずほ銀行: 列は「年月日,取引内容,出金,入金,残高」を想定（出金/入金分離型。
 *   「年月日」という他行にない日付列名、および「出金」「入金」という
 *   「〜金額」の付かない短い列名で区別している）。
 * - 三菱UFJ銀行: 列は「取引日,入出金先内容,お支払金額,お預入れ,残高」を想定
 *   （出金/入金分離型。「入出金先内容」という独自の摘要列名で楽天銀行
 *   （同じ「取引日」列名だが単一符号金額型）と区別している）。
 * - 三井住友銀行: 列は「年月日,摘要,お支払い金額,お預り金額,残高」を想定（出金/入金
 *   分離型。※未検証の仮定: 「年月日」列名はみずほと同じだが、「お支払い金額」
 *   「お預り金額」という三井住友銀行特有の丁寧語の金額列名（みずほの「出金」
 *   「入金」、三菱UFJの「お支払金額」「お預入れ」とは末尾の送り仮名が異なる）で
 *   区別している。
 * - りそな銀行: 列は「取引日,摘要,支払金額,預り金額,残高」を想定（出金/入金分離型。
 *   ※未検証の仮定: 「取引日」「摘要」は楽天銀行・三菱UFJ銀行と共通だが、
 *   「お」を付けない「支払金額」「預り金額」という金額列名、および出金/入金
 *   分離型（楽天銀行は単一符号型）である点で区別している）。
 * - イオン銀行: 列は「取引日,摘要,取引金額,残高」を想定（単一符号付き金額列
 *   「取引金額」を持つ形式。※未検証の仮定: 「取引日」「摘要」は楽天銀行と
 *   共通だが、単一符号金額列の列名が楽天銀行の「入出金」ではなく「取引金額」
 *   である点、および残高列名が「取引後残高」ではなく「残高」である点で
 *   区別している）。
 * - PayPay銀行: 列は「日付,内容,出金,入金,残高」を想定（出金/入金分離型。
 *   ※未検証の仮定: 「日付」「内容」は住信SBIネット銀行と共通だが、金額列名が
 *   住信SBIの「出金金額」「入金金額」ではなく「金額」を付けない短い
 *   「出金」「入金」（みずほ銀行と同型の命名）である点で区別している）。
 * - ソニー銀行: 列は「取引日,摘要,出金額,入金額,残高」を想定（出金/入金分離型。
 *   ※未検証の仮定: 「取引日」「摘要」は楽天銀行・りそな銀行・イオン銀行と
 *   共通だが、金額列名が「出金額」「入金額」（りそな銀行の「支払金額」
 *   「預り金額」とも異なる独自表記）である点で区別している）。
 * - セブン銀行: 列は「取引日,摘要,入出金額,残高」を想定（単一符号付き金額列
 *   「入出金額」を持つ形式。※未検証の仮定: 「取引日」「摘要」「残高」は
 *   イオン銀行と共通だが、単一符号金額列の列名がイオン銀行の「取引金額」
 *   ではなく「入出金額」である点で区別している）。
 * - SBI新生銀行: 列は「取引日,摘要,お引出し金額,お預入れ金額,残高」を想定
 *   （出金/入金分離型。※未検証の仮定: 「取引日」「摘要」はりそな銀行と共通だが、
 *   金額列名がりそな銀行の「支払金額」「預り金額」ではなく、ゆうちょ銀行の
 *   「お引出し」「お預入れ」に「金額」を加えた「お引出し金額」「お預入れ金額」
 *   である点で区別している）。
 * - 三井住友カード: 列は「ご利用日,ご利用店名,ご利用金額」を想定。カード利用額は
 *   明細上は正の数で記載されるため、支出として負値に変換する。丁寧表現の
 *   「ご利用日」列名で楽天カードと区別している。
 * - 楽天カード: 列は「利用日,利用店名,利用金額」を想定（三井住友カードと同様に
 *   利用額を負値へ変換）。「ご」が付かない列名で三井住友カードと区別している。
 * - JCBカード: 列は「ご利用日,ご利用先,ご利用金額」を想定（カード利用額を負値へ
 *   変換）。「ご利用先」という店名列名で三井住友カードの「ご利用店名」と
 *   区別している。
 * - PayPayカード: 列は「ご利用日,利用店名・商品名,ご利用金額」を想定（カード利用額を
 *   負値へ変換）。「利用店名・商品名」という店名列名で他カードと区別している。
 * - au PAYカード: 列は「利用日,利用先,利用金額」を想定（カード利用額を負値へ変換）。
 *   ※未検証の仮定: 「利用日」「利用金額」は楽天カードと共通だが、店名列名が
 *   楽天カードの「利用店名」ではなく「利用先」である点で区別している。
 * - dカード: 列は「ご利用日,ご利用店名等,ご利用金額」を想定（カード利用額を負値へ
 *   変換）。※未検証の仮定: 「ご利用日」「ご利用金額」は三井住友カードと共通
 *   だが、店名列名が三井住友カードの「ご利用店名」ではなく「ご利用店名等」
 *   （「等」が付く）である点で区別している。
 * - オリコカード: 列は「利用日,利用先名称,利用金額」を想定（カード利用額を
 *   負値へ変換）。※未検証の仮定: 「利用日」「利用金額」は楽天カード・au PAY
 *   カードと共通だが、店名列名が楽天カードの「利用店名」やau PAYカードの
 *   「利用先」ではなく「利用先名称」である点で区別している。
 *
 * これらの列名・区別方法はいずれも未検証の仮説であり、実データ次第で
 * detectHeaders・列候補の調整が必要になる可能性が高い。
 */

export type BankFormatId =
  | "sbi_sumishin"
  | "rakuten_bank"
  | "gmo_aozora"
  | "yucho"
  | "mizuho"
  | "mufg"
  | "smbc_bank"
  | "resona_bank"
  | "aeon_bank"
  | "paypay_bank"
  | "sony_bank"
  | "seven_bank"
  | "sbi_shinsei_bank"
  | "smcc"
  | "rakuten_card"
  | "jcb_card"
  | "paypay_card"
  | "au_pay_card"
  | "d_card"
  | "orico_card";

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
  yucho: {
    id: "yucho",
    label: "ゆうちょ銀行",
    dateHeaders: ["取扱日"],
    descHeaders: ["お取り扱い内容"],
    amount: { mode: "split", withdrawHeaders: ["お引出し"], depositHeaders: ["お預入れ"] },
    detectHeaders: ["取扱日", "お取り扱い内容", "お引出し", "お預入れ"],
  },
  mizuho: {
    id: "mizuho",
    label: "みずほ銀行",
    dateHeaders: ["年月日"],
    descHeaders: ["取引内容"],
    amount: { mode: "split", withdrawHeaders: ["出金"], depositHeaders: ["入金"] },
    detectHeaders: ["年月日", "取引内容", "出金", "入金"],
  },
  mufg: {
    id: "mufg",
    label: "三菱UFJ銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["入出金先内容"],
    amount: { mode: "split", withdrawHeaders: ["お支払金額"], depositHeaders: ["お預入れ"] },
    detectHeaders: ["取引日", "入出金先内容", "お支払金額", "お預入れ"],
  },
  smbc_bank: {
    id: "smbc_bank",
    label: "三井住友銀行",
    dateHeaders: ["年月日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: みずほの「出金/入金」、三菱UFJの「お支払金額/お預入れ」と
    // 送り仮名が異なる「お支払い金額/お預り金額」で区別している。
    amount: { mode: "split", withdrawHeaders: ["お支払い金額"], depositHeaders: ["お預り金額"] },
    detectHeaders: ["年月日", "摘要", "お支払い金額", "お預り金額"],
  },
  resona_bank: {
    id: "resona_bank",
    label: "りそな銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: 三菱UFJの「お支払金額/お預入れ」と異なり「お」を付けない
    // 「支払金額/預り金額」で区別している。
    amount: { mode: "split", withdrawHeaders: ["支払金額"], depositHeaders: ["預り金額"] },
    detectHeaders: ["取引日", "摘要", "支払金額", "預り金額"],
  },
  aeon_bank: {
    id: "aeon_bank",
    label: "イオン銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: 楽天銀行と同じ単一符号型だが、金額列名が「入出金」ではなく
    // 「取引金額」、残高列名が「取引後残高」ではなく「残高」である点で区別している。
    amount: { mode: "signed", headers: ["取引金額"] },
    detectHeaders: ["取引日", "摘要", "取引金額", "残高"],
  },
  paypay_bank: {
    id: "paypay_bank",
    label: "PayPay銀行",
    dateHeaders: ["日付"],
    descHeaders: ["内容"],
    // 未検証の仮定: 住信SBIネット銀行と同じ「日付/内容」だが、金額列名が
    // 住信SBIの「出金金額/入金金額」ではなく「金額」を付けない短い
    // 「出金/入金」（みずほ銀行と同型の命名）である点で区別している。
    amount: { mode: "split", withdrawHeaders: ["出金"], depositHeaders: ["入金"] },
    detectHeaders: ["日付", "内容", "出金", "入金"],
  },
  sony_bank: {
    id: "sony_bank",
    label: "ソニー銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: 楽天銀行・りそな銀行・イオン銀行と同じ「取引日/摘要」だが、
    // 金額列名がりそな銀行の「支払金額/預り金額」とも異なる独自表記の
    // 「出金額/入金額」である点で区別している。
    amount: { mode: "split", withdrawHeaders: ["出金額"], depositHeaders: ["入金額"] },
    detectHeaders: ["取引日", "摘要", "出金額", "入金額"],
  },
  seven_bank: {
    id: "seven_bank",
    label: "セブン銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: イオン銀行と同じ単一符号型で「取引日/摘要/残高」も共通だが、
    // 単一符号金額列の列名がイオン銀行の「取引金額」ではなく「入出金額」である
    // 点で区別している。
    amount: { mode: "signed", headers: ["入出金額"] },
    detectHeaders: ["取引日", "摘要", "入出金額", "残高"],
  },
  sbi_shinsei_bank: {
    id: "sbi_shinsei_bank",
    label: "SBI新生銀行",
    dateHeaders: ["取引日"],
    descHeaders: ["摘要"],
    // 未検証の仮定: りそな銀行と同じ「取引日/摘要」だが、金額列名がりそな銀行の
    // 「支払金額/預り金額」ではなく、ゆうちょ銀行の「お引出し/お預入れ」に
    // 「金額」を加えた「お引出し金額/お預入れ金額」である点で区別している。
    amount: { mode: "split", withdrawHeaders: ["お引出し金額"], depositHeaders: ["お預入れ金額"] },
    detectHeaders: ["取引日", "摘要", "お引出し金額", "お預入れ金額"],
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
  jcb_card: {
    id: "jcb_card",
    label: "JCBカード",
    dateHeaders: ["ご利用日"],
    descHeaders: ["ご利用先"],
    amount: { mode: "expense", headers: ["ご利用金額"] },
    detectHeaders: ["ご利用日", "ご利用先", "ご利用金額"],
  },
  paypay_card: {
    id: "paypay_card",
    label: "PayPayカード",
    dateHeaders: ["ご利用日"],
    descHeaders: ["利用店名・商品名"],
    amount: { mode: "expense", headers: ["ご利用金額"] },
    detectHeaders: ["ご利用日", "利用店名・商品名", "ご利用金額"],
  },
  au_pay_card: {
    id: "au_pay_card",
    label: "au PAYカード",
    dateHeaders: ["利用日"],
    descHeaders: ["利用先"],
    // 未検証の仮定: 楽天カードと同じ「利用日/利用金額」だが、店名列名が
    // 「利用店名」ではなく「利用先」である点で区別している。
    amount: { mode: "expense", headers: ["利用金額"] },
    detectHeaders: ["利用日", "利用先", "利用金額"],
  },
  d_card: {
    id: "d_card",
    label: "dカード",
    dateHeaders: ["ご利用日"],
    descHeaders: ["ご利用店名等"],
    // 未検証の仮定: 三井住友カードと同じ「ご利用日/ご利用金額」だが、店名列名が
    // 「ご利用店名」ではなく「ご利用店名等」（「等」付き）である点で区別している。
    amount: { mode: "expense", headers: ["ご利用金額"] },
    detectHeaders: ["ご利用日", "ご利用店名等", "ご利用金額"],
  },
  orico_card: {
    id: "orico_card",
    label: "オリコカード",
    dateHeaders: ["利用日"],
    descHeaders: ["利用先名称"],
    // 未検証の仮定: 楽天カード・au PAYカードと同じ「利用日/利用金額」だが、
    // 店名列名が楽天カードの「利用店名」やau PAYカードの「利用先」ではなく
    // 「利用先名称」である点で区別している。
    amount: { mode: "expense", headers: ["利用金額"] },
    detectHeaders: ["利用日", "利用先名称", "利用金額"],
  },
};

function findColumn(header: string[], candidates: string[]): number {
  return header.findIndex((h) => candidates.some((c) => h.trim().toLowerCase() === c.toLowerCase()));
}

function hasHeader(header: string[], candidate: string): boolean {
  return header.some((h) => h.trim().toLowerCase() === candidate.toLowerCase());
}

function toNumber(raw: string): number {
  // 全角数字・全角カンマ・全角マイナス・全角スペース・全角¥（￥）はNFKC正規化で半角に
  // 変換してから除去する。正規化しないと Number("１２，８００") は NaN になり、
  // 金額が黙って0円として取り込まれてしまう（レガシーな手入力CSV・一部の古い
  // 銀行システムからのエクスポートでは全角数字が使われることがある）。
  const cleaned = raw.normalize("NFKC").replace(/[,¥\s]/g, "");
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
