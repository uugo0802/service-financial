import { CategorizedTransaction } from "../categorize/engine";
import { TaxCategory } from "../categorize/dictionary";

// ------------------------------------------------------------------
// 立替経費（立替金）／未払金 管理ロジック。
//
// フリーランス・マイクロ法人のオーナーが、交通費・消耗品費などの事業経費を
// 会社（事業）の口座からではなく個人のお金で立て替えて支払った場合、
// 会社側から見ると「まだ個人へ精算（返金）していない金額」＝未払金（負債）が発生する。
// これは app/src/lib/invoice/receivables.ts（発行済み請求書のうち未収の金額＝未収入金）の
// 鏡像（mirror image）にあたる集計対象であり、aging（経過日数別集計）の考え方をそのまま踏襲する。
//
// これはあくまで記帳・精算管理（誰が・いつ・いくら立て替えていて、いくら未精算か）を補助する
// ツールであり、税務代理・個別具体の税務相談は一切行わない
// （docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
// ------------------------------------------------------------------

/**
 * 立替経費1件分のレコード。
 * 個人（役員・従業員・個人事業主本人）が事業経費を立て替えて支払った際に記録する。
 */
export interface ReimbursableExpenseInput {
  id: string;
  /** 立て替えた人の名前（例: 代表 修吾、従業員 山田太郎） */
  payerName: string;
  /** 経費の内容（摘要） */
  description: string;
  /** 個人が立て替えて支払った日（ISO日付文字列 "YYYY-MM-DD"） */
  paidDate: string;
  /** 精算予定日（ISO日付文字列）。未入力の場合は paidDate を基準に経過日数を計算する */
  reimbursementDueDate?: string | null;
  /** 立替金額（円、税込）。この経費として計上する金額 */
  amount: number;
  /** 想定される勘定科目（例: 旅費交通費、消耗品費） */
  account: string;
  /** 消費税区分（経費自体の税区分。CategorizedTransactionと同じ体系） */
  taxCategory: TaxCategory;
  /** 会社が個人へ精算（返金）した日（ISO日付文字列）。未精算の場合は未入力でよい */
  reimbursedAt?: string | null;
  /**
   * 精算済み金額（円）。reimbursedAt はあるが本項目が未入力の場合、amount が全額精算された
   * ものとして扱う。reimbursedAt が未入力の場合は無視される（未精算金額は常に amount 扱い）。
   */
  reimbursedAmount?: number | null;
}

// receivables.ts（未収入金）の年齢別集計（0-30/31-60/61-90/91+）と同じバケット定義を用いる
// （両機能の見え方を揃えるため意図的に揃えている。ドメインが異なるため型・定義自体は
// このモジュール内に独立して持つ）。
export type AgingBucketKey = "0-30" | "31-60" | "61-90" | "91+";

export interface AgingBucket {
  key: AgingBucketKey;
  /** 表示用ラベル（例: "未精算 0-30日"） */
  label: string;
  /** バケットの下限日数（含む） */
  minDaysOverdue: number;
  /** バケットの上限日数（含む）。上限なしの場合は null */
  maxDaysOverdue: number | null;
  /** 当該バケットに該当する立替経費の件数 */
  count: number;
  /** 当該バケットに該当する未精算金額の合計（円） */
  amount: number;
}

export interface OverdueReimbursement {
  id: string;
  payerName: string;
  description: string;
  account: string;
  paidDate: string;
  /** 精算予定日（未入力の場合は null。この場合 paidDate を基準に daysOverdue を計算している） */
  reimbursementDueDate: string | null;
  /** 精算予定日（なければ立替日）から asOfDate までの経過日数。1以上のみ「精算期日超過」として一覧に含める */
  daysOverdue: number;
  /** 当該立替経費の未精算金額（円） */
  outstandingAmount: number;
}

export interface ReimbursementsSummary {
  /** 集計の基準日（ISO日付文字列） */
  asOfDate: string;
  /** 未精算の立替経費総額（円）。精算予定日前でまだ未精算のものも含む */
  totalOutstanding: number;
  /** 未精算の立替経費件数（精算予定日前を含む） */
  totalOutstandingCount: number;
  /** 精算予定日超過（daysOverdue >= 1）の立替経費に基づく年齢別集計。0-30日→31-60日→61-90日→91日以上の順 */
  agingBuckets: AgingBucket[];
  /** 精算予定日超過の立替経費一覧（daysOverdue 降順） */
  overdueReimbursements: OverdueReimbursement[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AGING_BUCKET_DEFINITIONS: { key: AgingBucketKey; label: string; minDaysOverdue: number; maxDaysOverdue: number | null }[] = [
  { key: "0-30", label: "未精算 0-30日", minDaysOverdue: 1, maxDaysOverdue: 30 },
  { key: "31-60", label: "未精算 31-60日", minDaysOverdue: 31, maxDaysOverdue: 60 },
  { key: "61-90", label: "未精算 61-90日", minDaysOverdue: 61, maxDaysOverdue: 90 },
  { key: "91+", label: "未精算 91日以上", minDaysOverdue: 91, maxDaysOverdue: null },
];

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * ISO日付文字列（"YYYY-MM-DD"）をUTC深夜0時のタイムスタンプに変換する。
 * 不正な日付の場合は NaN を返す（呼び出し側でガードする）。
 */
function toUTCDateMs(isoDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return NaN;
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * 基準日（referenceDate）から asOfDate までの経過日数（切り捨て、整数）を計算する。
 * 不正な日付の場合は NaN を返す。年度をまたいでも単純な日数差で計算するため、
 * 立替から複数の事業年度が経過していても正しく計算できる。
 */
function daysBetween(asOfDate: string, referenceDate: string): number {
  const asOfMs = toUTCDateMs(asOfDate);
  const referenceMs = toUTCDateMs(referenceDate);
  if (Number.isNaN(asOfMs) || Number.isNaN(referenceMs)) return NaN;
  return Math.floor((asOfMs - referenceMs) / MS_PER_DAY);
}

/**
 * 立替経費1件のうち、会社から個人へ既に精算（返金）された金額（円）を計算する。
 * - reimbursedAt が未入力 → 精算額0円（未精算）
 * - reimbursedAt があり reimbursedAmount も入力されている → その金額（下限0円）
 * - reimbursedAt があるが reimbursedAmount が未入力 → amount 全額が精算されたとみなす
 */
export function reimbursedAmountOf(expense: ReimbursableExpenseInput): number {
  if (isBlank(expense.reimbursedAt)) return 0;
  const reimbursedAmount = typeof expense.reimbursedAmount === "number" && Number.isFinite(expense.reimbursedAmount)
    ? expense.reimbursedAmount
    : expense.amount;
  return Math.max(0, reimbursedAmount);
}

/**
 * 立替経費1件の未精算金額（円）を計算する（= amount - reimbursedAmountOf(expense)、下限0円）。
 * receivables.ts の outstandingAmountOf（未収入金）の鏡像にあたる関数。
 */
export function outstandingReimbursementAmountOf(expense: ReimbursableExpenseInput): number {
  const amount = Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0;
  return Math.max(0, amount - reimbursedAmountOf(expense));
}

/** 立替経費が（部分精算ではなく）全額精算済みかどうか。amount が0以下の場合は false を返す */
export function isFullyReimbursed(expense: ReimbursableExpenseInput): boolean {
  const amount = Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0;
  return amount > 0 && outstandingReimbursementAmountOf(expense) === 0;
}

/**
 * 経過日数の基準日として使う日付（精算予定日があればそれ、なければ立替日）を返す。
 */
function referenceDateOf(expense: ReimbursableExpenseInput): string {
  return isBlank(expense.reimbursementDueDate) ? expense.paidDate : expense.reimbursementDueDate!;
}

/**
 * 立替経費一覧と基準日（asOfDate）から、未精算金額の総額・年齢別集計（aging）・
 * 精算予定日超過の立替経費一覧を計算する。
 *
 * 例外は投げない。日付が不正な立替経費（paidDate/reimbursementDueDate が "YYYY-MM-DD" 形式で
 * ない等）は経過日数が計算できないため、年齢別集計・精算予定日超過一覧からは除外するが、
 * 未精算であれば totalOutstanding / totalOutstandingCount には含める（未精算金額を過小報告しないため）。
 */
export function computeReimbursementsSummary(
  expenses: ReimbursableExpenseInput[],
  asOfDate: string
): ReimbursementsSummary {
  const buckets: AgingBucket[] = AGING_BUCKET_DEFINITIONS.map((def) => ({ ...def, count: 0, amount: 0 }));

  let totalOutstanding = 0;
  let totalOutstandingCount = 0;
  const overdueReimbursements: OverdueReimbursement[] = [];

  for (const expense of expenses ?? []) {
    const outstanding = outstandingReimbursementAmountOf(expense);
    if (outstanding <= 0) continue;

    totalOutstanding += outstanding;
    totalOutstandingCount += 1;

    const referenceDate = referenceDateOf(expense);
    const daysOverdue = daysBetween(asOfDate, referenceDate);
    if (Number.isNaN(daysOverdue) || daysOverdue < 1) continue; // 精算期日未到来、または日付不正のためaging対象外

    const bucket = buckets.find(
      (b) => daysOverdue >= b.minDaysOverdue && (b.maxDaysOverdue === null || daysOverdue <= b.maxDaysOverdue)
    );
    if (bucket) {
      bucket.count += 1;
      bucket.amount += outstanding;
    }

    overdueReimbursements.push({
      id: expense.id,
      payerName: expense.payerName,
      description: expense.description,
      account: expense.account,
      paidDate: expense.paidDate,
      reimbursementDueDate: isBlank(expense.reimbursementDueDate) ? null : expense.reimbursementDueDate!,
      daysOverdue,
      outstandingAmount: outstanding,
    });
  }

  overdueReimbursements.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    asOfDate,
    totalOutstanding,
    totalOutstandingCount,
    agingBuckets: buckets,
    overdueReimbursements,
  };
}

// ------------------------------------------------------------------
// 記録・状態変更（record / mark as reimbursed・outstanding）
// ------------------------------------------------------------------

function generateReimbursementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reimbursement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** recordReimbursableExpense への入力。id は省略可（省略時は自動採番） */
export interface RecordReimbursableExpenseParams {
  id?: string;
  payerName: string;
  description: string;
  paidDate: string;
  amount: number;
  account: string;
  taxCategory: TaxCategory;
  reimbursementDueDate?: string | null;
}

/**
 * 個人が立て替えて支払った事業経費を1件記録する。
 * 生成された時点では未精算（reimbursedAt/reimbursedAmount ともに null）として扱う。
 * amount が負数の場合は0円に丸める（マイナスの立替経費は想定しないため）。
 */
export function recordReimbursableExpense(params: RecordReimbursableExpenseParams): ReimbursableExpenseInput {
  return {
    id: params.id ?? generateReimbursementId(),
    payerName: params.payerName.trim(),
    description: params.description.trim(),
    paidDate: params.paidDate,
    reimbursementDueDate: isBlank(params.reimbursementDueDate) ? null : params.reimbursementDueDate!.trim(),
    amount: Number.isFinite(params.amount) ? Math.max(0, params.amount) : 0,
    account: params.account.trim(),
    taxCategory: params.taxCategory,
    reimbursedAt: null,
    reimbursedAmount: null,
  };
}

/**
 * 立替経費を「精算済み（全額または一部）」としてマークする。既存レコードは変更せず、新しいオブジェクトを返す。
 * reimbursedAmount を省略した場合は amount 全額が精算されたものとして扱う（部分精算にしたい場合は明示的に指定する）。
 */
export function markReimbursementSettled(
  expense: ReimbursableExpenseInput,
  reimbursedAt: string,
  reimbursedAmount?: number
): ReimbursableExpenseInput {
  return {
    ...expense,
    reimbursedAt,
    reimbursedAmount: typeof reimbursedAmount === "number" ? reimbursedAmount : null,
  };
}

/**
 * 立替経費を「未精算」に戻す（精算記録の誤入力を取り消す場合など）。既存レコードは変更せず、新しいオブジェクトを返す。
 */
export function markReimbursementOutstanding(expense: ReimbursableExpenseInput): ReimbursableExpenseInput {
  return {
    ...expense,
    reimbursedAt: null,
    reimbursedAmount: null,
  };
}

// ------------------------------------------------------------------
// 仕訳候補（journal entry suggestion）
// ------------------------------------------------------------------

/**
 * 立替経費の未精算残高を計上する際の相手勘定（負債科目）。
 * 個人（役員・従業員）が事業経費を立て替えた時点では会社の現金及び預金は動いていないため、
 * 「経費計上」と「未払金計上」をセットで記録することで、trialBalance.ts が前提とする
 * 「取引の相手科目＝現金及び預金」という単純化されたモデルの中でも、現金の動きを伴わない
 * 取引として正しく（貸借を相殺して）表現できる。
 */
export const REIMBURSEMENT_LIABILITY_ACCOUNT = "未払金";

/** 未払金（立替経費精算）は消費税の課税対象外（すでに経費計上時に税区分を計上済みのため） */
export const REIMBURSEMENT_LIABILITY_TAX_CATEGORY: TaxCategory = "対象外";

export interface ReimbursementJournalEntrySuggestion {
  /**
   * 経費計上仕訳（経費科目のマイナス計上）。
   * liabilityEntry と合計するとちょうど0円になり、現金及び預金が動いていないことを表す
   * （app/src/lib/tax/trialBalance.ts の「取引の相手科目＝現金及び預金」という単純化モデルと整合させるため）。
   */
  expenseEntry: CategorizedTransaction;
  /** 経費計上仕訳（未払金のプラス計上）。上記の相殺用の行 */
  liabilityEntry: CategorizedTransaction;
  /**
   * 精算（会社から個人への返金）仕訳。未払金のマイナス計上＝現金及び預金の減少を表す。
   * 未精算の場合（reimbursedAmountOf(expense) === 0）は null。
   */
  settlementEntry: CategorizedTransaction | null;
}

/**
 * 立替経費1件から、記帳用の仕訳候補（CategorizedTransaction形式）を組み立てる。
 * amount が0円以下の場合は記録すべき経費がないため null を返す。
 *
 * - expenseEntry / liabilityEntry: 立替払いした日（paidDate）付けで、経費科目のマイナス計上と
 *   未払金のプラス計上をペアで生成する（現金の動きなしを表現するため必ずセットで扱うこと）。
 * - settlementEntry: 精算済み金額（reimbursedAmountOf）が0円より大きい場合のみ、精算日
 *   （reimbursedAt）付けで未払金のマイナス計上（＝会社の現金及び預金からの実際の支払い）を生成する。
 */
export function buildReimbursementJournalEntrySuggestion(
  expense: ReimbursableExpenseInput
): ReimbursementJournalEntrySuggestion | null {
  const amount = Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0;
  if (amount <= 0) return null;

  const expenseEntry: CategorizedTransaction = {
    id: `${expense.id}-expense`,
    date: expense.paidDate,
    description: expense.description,
    amount: -amount,
    account: expense.account,
    taxCategory: expense.taxCategory,
    confidence: 1,
    source: "manual",
    note: `${expense.payerName}が立替払いした事業経費（相手勘定は${REIMBURSEMENT_LIABILITY_ACCOUNT}。現金及び預金は動いていません）`,
  };

  const liabilityEntry: CategorizedTransaction = {
    id: `${expense.id}-liability`,
    date: expense.paidDate,
    description: `${expense.description}（${expense.payerName}への${REIMBURSEMENT_LIABILITY_ACCOUNT}計上）`,
    amount,
    account: REIMBURSEMENT_LIABILITY_ACCOUNT,
    taxCategory: REIMBURSEMENT_LIABILITY_TAX_CATEGORY,
    confidence: 1,
    source: "manual",
    note: `${expense.payerName}が立て替えた事業経費のうち、まだ会社から精算（返金）していない金額`,
  };

  const settledAmount = reimbursedAmountOf(expense);
  const settlementEntry: CategorizedTransaction | null =
    settledAmount > 0 && !isBlank(expense.reimbursedAt)
      ? {
          id: `${expense.id}-settlement`,
          date: expense.reimbursedAt!,
          description: `${expense.description}（${expense.payerName}への立替経費精算）`,
          amount: -settledAmount,
          account: REIMBURSEMENT_LIABILITY_ACCOUNT,
          taxCategory: REIMBURSEMENT_LIABILITY_TAX_CATEGORY,
          confidence: 1,
          source: "manual",
          note: `${expense.payerName}へ立替経費を精算（返金）した記録（会社の現金及び預金からの支払い）`,
        }
      : null;

  return { expenseEntry, liabilityEntry, settlementEntry };
}
