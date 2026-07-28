// インボイス制度（適格請求書等保存方式）登録番号の形式チェックと、
// それに基づく仕入税額控除可否のルールベース判定。
//
// 位置づけ（重要・必ず遵守すること）:
// - `docs/cto-tech-architecture.md` 3.3章の方針どおり、消費税の仕入税額控除可否のような
//   誤りが直接コンプライアンスリスクにつながる項目は、LLM判定結果をそのまま確定させず
//   「ルールベースの検証ロジック」を必ず通過させる。本ファイルはそのルールベース部分を担う。
// - ここで行うのはあくまで「登録番号の桁数・先頭文字・数字のみ等の形式チェック」であり、
//   チェックデジット（法人番号の検査用数字）の算出・検証や、国税庁
//   「適格請求書発行事業者公表サイト」への実在照会は行わない。
// - `docs/business-plan.md` の法的ポジション（税理士法対応・本人申告支援ツール型）のとおり、
//   本モジュールは個別具体の税務相談・適格性判断を行うものではない。
//   最終的な判断は必ず利用者本人が行うこと。
//
// このファイルは他モジュールから独立して完結する（dictionary.ts / engine.ts / aiEscalate.ts
// は編集しない方針のため、TaxCategory 型のみを読み取り専用で参照する）。

import { TaxCategory } from "./dictionary";

/**
 * この判定ロジック全体に関する注意書き。UI表示用に利用できる。
 * 個別の税務相談ではなく、形式的なルールチェックの結果であることを必ず明示するための文言。
 */
export const INVOICE_VALIDATION_DISCLAIMER =
  "この判定はインボイス登録番号の桁数・先頭文字等に基づく形式チェックの結果であり、" +
  "国税庁「適格請求書発行事業者公表サイト」での実在確認や、個別取引の適格性についての税務相談ではありません。" +
  "最終的な判断は利用者ご自身の責任で行ってください。";

/** 登録番号の形式チェック結果 */
export interface InvoiceNumberFormatResult {
  /** 入力値が「T + 数字13桁」の形式として妥当かどうか */
  valid: boolean;
  /** 前後空白除去・全角→半角正規化・ハイフン除去を行った正規化後の文字列（valid=falseの場合はnull） */
  normalized: string | null;
  /** 不正な場合の理由（UI表示用の短い日本語メッセージ）。valid=trueの場合はundefined */
  reason?: string;
}

/** 仕入税額控除の可否（ルールベース判定の結果） */
export type InvoiceDeductionEligibility =
  /** 登録番号の形式が正しく、仕入税額控除の対象となりうる */
  | "eligible"
  /** 登録番号がない/形式が不正だが、経過措置により一定割合を仕入税額とみなして控除できる期間 */
  | "transitional"
  /** 登録番号がない/形式が不正で、経過措置期間も終了しており原則として控除不可 */
  | "ineligible"
  /** そもそも課税仕入に該当しない税区分（非課税・不課税・対象外・課税売上等）で、控除可否の判定自体が対象外 */
  | "not_applicable";

/** 仕入税額控除の可否判定に必要な入力 */
export interface DeductionEligibilityInput {
  /** 分類済み取引の税区分（`dictionary.ts` の TaxCategory と同一の型を利用） */
  taxCategory: TaxCategory;
  /** 取引先から提示されたインボイス登録番号（未提示・不明の場合は null/undefined） */
  invoiceNumber?: string | null;
  /** 取引日（YYYY-MM-DD形式）。経過措置の適用判定に使用。省略時は経過措置を考慮せず保守的に判定する */
  transactionDate?: string;
}

/** 経過措置により仕入税額とみなして控除できる割合。100=登録番号確認済みで全額、0=控除不可 */
export type DeductibleRatio = 0 | 50 | 80 | 100;

export interface DeductionEligibilityResult {
  eligibility: InvoiceDeductionEligibility;
  deductibleRatio: DeductibleRatio;
  /** UI表示用の警告メッセージ。問題がない場合（eligible / not_applicable）はundefined */
  warning?: string;
  /** 登録番号自体の形式チェック結果（監査ログ・デバッグ表示用に併せて返す） */
  numberFormat: InvoiceNumberFormatResult;
}

/** 消費税の課税仕入に該当し、インボイス制度上の控除可否判定の対象となる税区分 */
const TAXABLE_PURCHASE_CATEGORIES: readonly TaxCategory[] = ["課税仕入10%", "課税仕入8%(軽減)"];

/**
 * 免税事業者等（登録番号なし）からの仕入れに係る経過措置の期限。
 * - 2023-10-01〜2026-09-30: 仕入税額相当額の80%を控除可能
 * - 2026-10-01〜2029-09-30: 仕入税額相当額の50%を控除可能
 * - 2029-10-01以降: 経過措置終了、控除不可
 * 参照: 国税庁「適格請求書等保存方式に関するQ&A」（一般的な制度解説レベル。要専門家確認）
 */
const TRANSITIONAL_80_PERCENT_END = "2026-09-30";
const TRANSITIONAL_50_PERCENT_END = "2029-09-30";

/**
 * インボイス登録番号の形式を正規化する。
 * 全角英数字・全角ハイフン等はNFKC正規化で半角化し、空白・ハイフン類は除去する。
 */
function normalizeCandidate(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s\-‐‑‒–—―ー－]/g, "");
}

/**
 * インボイス登録番号のフォーマットバリデーション。
 *
 * 検証するのは以下の形式のみ（チェックデジットの算出・検証や実在確認は行わない）:
 * - 先頭が半角/全角の "T"（大文字小文字・全角半角は問わず正規化する）
 * - それに続く数字がちょうど13桁（法人: T+法人番号13桁、個人事業主: T+13桁の数字、いずれも桁数は同じ）
 * - "T" と数字以外の文字（数字部分に紛れ込んだ空白・記号等を除く）を含まない
 */
export function validateInvoiceNumberFormat(raw: string | null | undefined): InvoiceNumberFormatResult {
  if (raw == null || raw.trim() === "") {
    return { valid: false, normalized: null, reason: "登録番号が入力されていません" };
  }

  const normalized = normalizeCandidate(raw);

  if (normalized === "") {
    return { valid: false, normalized: null, reason: "登録番号が入力されていません" };
  }

  if (!normalized.startsWith("T")) {
    return { valid: false, normalized: null, reason: "登録番号は「T」から始まる必要があります" };
  }

  const digits = normalized.slice(1);

  if (digits.length === 0) {
    return { valid: false, normalized: null, reason: "「T」の後に数字13桁が必要です" };
  }

  if (!/^\d+$/.test(digits)) {
    return { valid: false, normalized: null, reason: "「T」の後は数字のみである必要があります" };
  }

  if (digits.length !== 13) {
    return {
      valid: false,
      normalized: null,
      reason: `登録番号の数字部分は13桁である必要があります（入力: ${digits.length}桁）`,
    };
  }

  return { valid: true, normalized };
}

/** 取引日から経過措置による仕入税額控除可能割合を求める。日付不明の場合は保守的に0を返す */
function transitionalDeductibleRatio(transactionDate?: string): DeductibleRatio {
  if (!transactionDate) return 0;
  // YYYY-MM-DD形式の文字列比較で判定（rowデータはこの形式を前提とする既存コードと合わせる）
  if (transactionDate <= TRANSITIONAL_80_PERCENT_END) return 80;
  if (transactionDate <= TRANSITIONAL_50_PERCENT_END) return 50;
  return 0;
}

/**
 * 税区分・登録番号・取引日から、仕入税額控除の可否をルールベースで判定する。
 *
 * `docs/cto-tech-architecture.md` 3.3章の方針に基づき、この関数の出力は
 * LLMによる分類結果をそのまま確定させないための「必ず通過させるルールベースの検証」として使う想定。
 * あくまで形式チェックの結果であり、個別取引の適格性についての税務相談ではない
 * （`INVOICE_VALIDATION_DISCLAIMER` を参照）。
 */
export function determineDeductionEligibility(input: DeductionEligibilityInput): DeductionEligibilityResult {
  const numberFormat = validateInvoiceNumberFormat(input.invoiceNumber);

  if (!TAXABLE_PURCHASE_CATEGORIES.includes(input.taxCategory)) {
    return {
      eligibility: "not_applicable",
      deductibleRatio: 0,
      numberFormat,
    };
  }

  if (numberFormat.valid) {
    return {
      eligibility: "eligible",
      deductibleRatio: 100,
      numberFormat,
    };
  }

  const ratio = transitionalDeductibleRatio(input.transactionDate);

  if (ratio > 0) {
    return {
      eligibility: "transitional",
      deductibleRatio: ratio,
      warning:
        "登録番号未確認のため仕入税額控除の適用に注意してください。原則は控除の対象外ですが、" +
        `経過措置により本取引日時点では仕入税額相当額の${ratio}%を控除できる可能性があります` +
        "（帳簿への経過措置適用の記載等の要件あり。ルールに基づく形式チェックであり個別の税務判断ではありません）。",
      numberFormat,
    };
  }

  return {
    eligibility: "ineligible",
    deductibleRatio: 0,
    warning:
      "登録番号未確認のため仕入税額控除の適用に注意してください。適格請求書発行事業者の登録番号が" +
      "形式的に確認できず、経過措置の対象期間外でもあるため、原則として仕入税額控除の対象外です。",
    numberFormat,
  };
}

/** `determineDeductionEligibility` の入力として扱える最小限の取引形状 */
export interface InvoiceAwareTransaction {
  taxCategory: TaxCategory;
  invoiceNumber?: string | null;
  date?: string;
}

/** 既存の分類結果に付加できるインボイス関連の警告フラグ */
export interface InvoiceWarningFlag {
  /** UIで警告表示を出すべきかどうか（transitional / ineligible の場合にtrue） */
  hasInvoiceWarning: boolean;
  /** UI表示用の警告メッセージ（警告がない場合はundefined） */
  invoiceWarningMessage?: string;
  invoiceDeductionEligibility: InvoiceDeductionEligibility;
  invoiceDeductibleRatio: DeductibleRatio;
}

/**
 * 既存の分類結果（`engine.ts` の `CategorizedTransaction` 等、taxCategoryを持つ任意のオブジェクト）に
 * インボイス関連の警告フラグを非破壊で付加するヘルパー。
 * engine.ts 自体は編集せず、呼び出し側で必要に応じて利用する想定の独立ユーティリティ。
 */
export function buildInvoiceWarningFlag<T extends InvoiceAwareTransaction>(tx: T): T & InvoiceWarningFlag {
  const result = determineDeductionEligibility({
    taxCategory: tx.taxCategory,
    invoiceNumber: tx.invoiceNumber,
    transactionDate: tx.date,
  });

  return {
    ...tx,
    hasInvoiceWarning: result.eligibility === "transitional" || result.eligibility === "ineligible",
    invoiceWarningMessage: result.warning,
    invoiceDeductionEligibility: result.eligibility,
    invoiceDeductibleRatio: result.deductibleRatio,
  };
}
