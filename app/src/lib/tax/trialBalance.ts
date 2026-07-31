// ------------------------------------------------------------------
// 合計残高試算表（合計試算表＋残高試算表）の簡易生成。
//
// このアプリの記帳データ（CategorizedTransaction、journal/entries.tsの手入力分も含む）は
// notesForm.ts に記載の通り「預金口座等の入出金明細（現金の授受）のみを機械的に集計した
// 現金主義的な簡易処理」であり、1取引＝1勘定科目＋符号付き金額という単式簿記に近い形で
// 保持されている（複式簿記の借方・貸方双方の相手科目は保持していない）。
//
// 試算表は本来「各仕訳の借方合計＝貸方合計」という複式簿記の検算を目的とした帳票のため、
// ここでは balanceSheetForm.ts / equityChangeForm.ts と同じ簡易化の考え方を踏襲し、
// 各取引の「もう片方」の相手科目を現金及び預金（cashAccount、既定値「現金及び預金」）と
// みなして機械的に複式化する：
//   - 入金（amount > 0）: 現金及び預金を借方、取引の勘定科目（売上高等）を貸方に計上
//   - 出金（amount < 0）: 取引の勘定科目（経費等）を借方、現金及び預金を貸方に計上
// この結果、当期発生高は科目を問わず必ず借方合計＝貸方合計になる（1取引ごとに同額を
// 借方・貸方へ振り分けているため）。前期繰越高についても借方合計と貸方合計が一致していれば、
// 残高（前期繰越高＋当期借方合計－当期貸方合計）ベースでも借方合計＝貸方合計となり、
// これが合計残高試算表の基本的な検算（貸借一致）となる。
//
// 正式な複式簿記の総勘定元帳・仕訳帳を保持しているわけではないため、あくまで概算の
// 下書き帳票である点に留意すること（他のtax/*.tsと同様、正式な会計帳簿ではない）。
// ------------------------------------------------------------------

import { CategorizedTransaction } from "../categorize/engine";

/** 現金及び預金として扱う勘定科目の既定名。CategorizedTransaction.account には現れない想定の名称。 */
export const DEFAULT_CASH_ACCOUNT = "現金及び預金";

/** 前期繰越高の入力単位。借方残高の科目はdebit、貸方残高の科目はcreditのみを指定する（両方指定した場合は相殺前提でnetを計算に用いる） */
export interface OpeningBalanceInput {
  debit?: number;
  credit?: number;
}

/** 科目名 → 前期繰越高。指定のない科目は前期繰越高0として扱う */
export type OpeningBalances = Record<string, OpeningBalanceInput>;

export interface BuildTrialBalanceOptions {
  /** 取引明細の相手科目として扱う現金及び預金の科目名。既定は DEFAULT_CASH_ACCOUNT */
  cashAccount?: string;
  /** 前期繰越高（科目名 → {debit, credit}）。省略した科目は前期繰越高0として扱う */
  openingBalances?: OpeningBalances;
  /** 集計対象期間の開始日（YYYY-MM-DD、この日を含む）。省略時は全取引を対象にする */
  periodStart?: string;
  /** 集計対象期間の終了日（YYYY-MM-DD、この日を含む）。省略時は全取引を対象にする */
  periodEnd?: string;
}

export interface TrialBalanceLine {
  account: string;
  /** 前期繰越高。借方残高はプラス、貸方残高はマイナスで表す */
  openingBalance: number;
  /** 当期の借方合計（借方に計上された取引の絶対値の合計） */
  periodDebit: number;
  /** 当期の貸方合計（貸方に計上された取引の絶対値の合計） */
  periodCredit: number;
  /** 残高（前期繰越高＋当期借方合計－当期貸方合計）。借方残高はプラス、貸方残高はマイナスで表す */
  closingBalance: number;
}

export interface TrialBalance {
  periodStart: string;
  periodEnd: string;
  lines: TrialBalanceLine[];
  /** 前期繰越高の借方合計（openingBalanceがプラスの科目の合計） */
  openingDebitTotal: number;
  /** 前期繰越高の貸方合計（openingBalanceがマイナスの科目の絶対値の合計） */
  openingCreditTotal: number;
  /** 当期借方合計（全科目合計） */
  periodDebitTotal: number;
  /** 当期貸方合計（全科目合計） */
  periodCreditTotal: number;
  /** 残高の借方合計（closingBalanceがプラスの科目の合計） */
  closingDebitTotal: number;
  /** 残高の貸方合計（closingBalanceがマイナスの科目の絶対値の合計） */
  closingCreditTotal: number;
  /** 残高ベースの貸借一致検算結果（closingDebitTotal === closingCreditTotal）。isTrialBalanceBalanced()と同じ判定 */
  balanced: boolean;
}

// 円未満の丸め誤差を許容するための閾値
const EPSILON = 1;

function isApproximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * 合計残高試算表の貸借一致検算。残高（closingDebitTotal/closingCreditTotal）が一致しているかを判定する。
 * 複式簿記の基本原則（借方合計＝貸方合計）が成り立っているかどうかの唯一のチェックポイント。
 */
export function isTrialBalanceBalanced(tb: Pick<TrialBalance, "closingDebitTotal" | "closingCreditTotal">): boolean {
  return isApproximatelyEqual(tb.closingDebitTotal, tb.closingCreditTotal);
}

/** 当期発生高（借方合計・貸方合計）の貸借一致検算。1取引ごとに同額を借方・貸方へ計上しているため、通常は常に一致する */
export function isPeriodActivityBalanced(tb: Pick<TrialBalance, "periodDebitTotal" | "periodCreditTotal">): boolean {
  return isApproximatelyEqual(tb.periodDebitTotal, tb.periodCreditTotal);
}

function netOpeningBalance(input: OpeningBalanceInput | undefined): number {
  if (!input) return 0;
  return (input.debit ?? 0) - (input.credit ?? 0);
}

/**
 * 記帳済みの取引明細から、勘定科目ごとの合計残高試算表を作成する。
 * periodStart/periodEndを指定すると、その範囲（両端含む）の取引のみを当期発生高の集計対象にする
 * （前期繰越高は別途openingBalancesで指定するため、範囲外に絞り込んでも前期分が失われることはない）。
 */
export function buildTrialBalance(
  entries: CategorizedTransaction[],
  options: BuildTrialBalanceOptions = {}
): TrialBalance {
  const cashAccount = options.cashAccount ?? DEFAULT_CASH_ACCOUNT;
  const openingBalances = options.openingBalances ?? {};

  const filtered = entries.filter((e) => {
    if (options.periodStart && e.date < options.periodStart) return false;
    if (options.periodEnd && e.date > options.periodEnd) return false;
    return true;
  });

  const periodDebit = new Map<string, number>();
  const periodCredit = new Map<string, number>();

  const addDebit = (account: string, amount: number) =>
    periodDebit.set(account, (periodDebit.get(account) ?? 0) + amount);
  const addCredit = (account: string, amount: number) =>
    periodCredit.set(account, (periodCredit.get(account) ?? 0) + amount);

  for (const entry of filtered) {
    const amount = Math.abs(entry.amount);
    if (amount === 0) continue; // 金額0の仕訳は貸借どちらにも計上しない

    if (entry.amount > 0) {
      // 入金: 現金及び預金（資産）の増加＝借方、取引の勘定科目（収益・負債・純資産の増加等）＝貸方
      addDebit(cashAccount, amount);
      addCredit(entry.account, amount);
    } else {
      // 出金: 取引の勘定科目（費用の増加等）＝借方、現金及び預金（資産）の減少＝貸方
      addDebit(entry.account, amount);
      addCredit(cashAccount, amount);
    }
  }

  const accounts = new Set<string>([...Object.keys(openingBalances), ...periodDebit.keys(), ...periodCredit.keys()]);

  const lines: TrialBalanceLine[] = Array.from(accounts)
    .map((account): TrialBalanceLine => {
      const openingBalance = netOpeningBalance(openingBalances[account]);
      const debit = periodDebit.get(account) ?? 0;
      const credit = periodCredit.get(account) ?? 0;
      return {
        account,
        openingBalance,
        periodDebit: debit,
        periodCredit: credit,
        closingBalance: openingBalance + debit - credit,
      };
    })
    .sort((a, b) => a.account.localeCompare(b.account, "ja"));

  const totals = lines.reduce(
    (acc, line) => {
      acc.openingDebitTotal += Math.max(line.openingBalance, 0);
      acc.openingCreditTotal += Math.max(-line.openingBalance, 0);
      acc.periodDebitTotal += line.periodDebit;
      acc.periodCreditTotal += line.periodCredit;
      acc.closingDebitTotal += Math.max(line.closingBalance, 0);
      acc.closingCreditTotal += Math.max(-line.closingBalance, 0);
      return acc;
    },
    {
      openingDebitTotal: 0,
      openingCreditTotal: 0,
      periodDebitTotal: 0,
      periodCreditTotal: 0,
      closingDebitTotal: 0,
      closingCreditTotal: 0,
    }
  );

  // periodStart/periodEndが明示されない場合のフォールバックは、対象取引の日付の
  // 最小値・最大値を使う（配列の先頭・末尾要素ではない）。銀行・カードのCSVは
  // 新しい取引が先頭に来る「降順」で並んでいることが多く、entries（引数）の並び順を
  // そのまま信用すると「自◯◯至◯◯」の期間表示が実際の取引日と矛盾する
  // （最悪の場合、開始日が終了日より後になる）ため、必ず日付そのものから算出する。
  let fallbackPeriodStart: string | undefined;
  let fallbackPeriodEnd: string | undefined;
  for (const entry of filtered) {
    if (fallbackPeriodStart === undefined || entry.date < fallbackPeriodStart) fallbackPeriodStart = entry.date;
    if (fallbackPeriodEnd === undefined || entry.date > fallbackPeriodEnd) fallbackPeriodEnd = entry.date;
  }

  return {
    periodStart: options.periodStart ?? fallbackPeriodStart ?? "-",
    periodEnd: options.periodEnd ?? fallbackPeriodEnd ?? "-",
    lines,
    ...totals,
    balanced: isApproximatelyEqual(totals.closingDebitTotal, totals.closingCreditTotal),
  };
}
