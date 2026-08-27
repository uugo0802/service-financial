// ------------------------------------------------------------------
// 借入金の元本・利息の月次返済スケジュール計算（元金均等・元利均等）。
//
// depreciation.ts と同じ位置付けで、正式な金融機関発行の返済予定表の
// 完全な代替ではなく、標準的な金融数学の公式（複利計算）に基づく
// 概算シミュレーションです。実際の返済予定表とは、四捨五入・営業日調整・
// 実日数ベースの端数処理等の細かな違いにより完全には一致しない場合が
// あります。最終的な金額は必ず金融機関発行の返済予定表と照合してください。
//
// 対応している考え方:
// - 元金均等返済（equal-principal、未指定時の既定値）: 毎回の元本返済額を
//   一定にする方式。利息は毎回の返済前元本残高 × 月利（年利率 ÷ 12）で計算する。
// - 元利均等返済（equal-payment）: 毎回の返済額（元本＋利息）を一定にする方式。
//   毎回の返済額は複利年金現価法の標準公式
//   （返済額 = 元本 × 月利 ÷ (1 - (1 + 月利)^-返済回数)）で算出する。
// - 毎月1回、借入日（startDate）の1ヶ月後を初回返済日とし、以降term_months回、
//   毎月同じ日にちで返済する前提（該当日が存在しない月は、その月の末日に
//   繰り下げる。例: 1/31起算 → 2月は2/28（うるう年は2/29））。
// - 月利は年利率 ÷ 12（単利的な月割り。日割り計算は行わない）。
// - 最終回（term_months回目）は、それまでの四捨五入による端数を吸収するため、
//   元本返済額を「その時点の残存元本残高」に一致させ、確実に残高が0円になる
//   ようにする（depreciation.tsの備忘価額1円までの償却ロジックと同じ考え方）。
//
// 対応していない・簡略化している点（コメントとして明示）:
// - 保証料・事務手数料・団体信用生命保険料等、利息以外の付随費用は対象外。
// - 返済日が金融機関の休業日に当たる場合の翌営業日繰り下げ等は考慮しない。
// - 繰上返済（期限前一部弁済・全部弁済）には対応していない。
// - ボーナス月併用返済等、毎月一定でない返済方式には対応していない。
// ------------------------------------------------------------------

import { FiscalPeriod } from "./depreciation";

/** 借入金の返済方式。equal-principal = 元金均等、equal-payment = 元利均等 */
export type LoanRepaymentType = "equal-principal" | "equal-payment";

export interface Loan {
  id: string;
  name: string; // 例:「日本政策金融公庫 運転資金」
  principalAmount: number; // 借入元本（円）
  interestRate: number; // 年利率（例: 0.0175 = 1.75%）
  startDate: string; // 借入年月日（"YYYY-MM-DD"）。初回返済日はこの1ヶ月後
  termMonths: number; // 返済回数（月）
  /** 返済方式。未指定の場合は "equal-principal"（元金均等）として計算する。 */
  repaymentType?: LoanRepaymentType;
}

export interface LoanInstallment {
  installmentNumber: number; // 第n回（1始まり）
  paymentDate: string; // 返済日（"YYYY-MM-DD"）
  openingPrincipal: number; // 返済前の元本残高
  principalPayment: number; // 元本返済額
  interestPayment: number; // 利息額
  totalPayment: number; // 元利合計返済額（principalPayment + interestPayment）
  closingPrincipal: number; // 返済後の元本残高
}

export interface LoanAmortizationSchedule {
  loan: Loan;
  /** 実際に採用した返済方式（loan.repaymentType未指定時は "equal-principal"） */
  repaymentType: LoanRepaymentType;
  installments: LoanInstallment[];
  totalPrincipal: number; // 全期間の元本返済額合計（＝principalAmountと一致するはず）
  totalInterest: number; // 全期間の利息総額
}

/** "YYYY-MM-DD" → {year, month, day}（月は1-12） */
function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

/** 指定した年・月（1-12）の末日を返す */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 指定日の n ヶ月後の日付を返す（"YYYY-MM-DD"）。該当日が存在しない月は
 * その月の末日に繰り下げる（例: 1/31 の1ヶ月後 → 2/28 または 2/29）。
 */
function addMonths(iso: string, n: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const totalMonthIndex = year * 12 + (month - 1) + n;
  const targetYear = Math.floor(totalMonthIndex / 12);
  const targetMonth = (totalMonthIndex % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatIsoDate(targetYear, targetMonth, clampedDay);
}

/**
 * 浮動小数点の丸め誤差を吸収しつつ円単位に四捨五入する
 * （depreciation.ts の floorYen と同じ考え方。ここでは四捨五入を用いる）。
 */
function roundYen(amount: number): number {
  return Math.round(amount + (amount >= 0 ? 1e-6 : -1e-6));
}

/**
 * 元利均等返済（equal-payment）の毎回の返済額（元本＋利息）を、複利年金現価法の
 * 標準公式で算出する。月利が0（無利息）の場合は、単純に元本を返済回数で均等割りする。
 */
function annuityPayment(principal: number, monthlyRate: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  if (monthlyRate === 0) return principal / termMonths;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/**
 * 借入金1件について、全返済回（term_months回）の元本・利息の内訳スケジュールを計算する。
 */
export function buildLoanAmortizationSchedule(loan: Loan): LoanAmortizationSchedule {
  const repaymentType: LoanRepaymentType = loan.repaymentType === "equal-payment" ? "equal-payment" : "equal-principal";
  const monthlyRate = loan.interestRate / 12;
  const termMonths = Math.max(0, Math.floor(loan.termMonths));

  const installments: LoanInstallment[] = [];
  let openingPrincipal = Math.max(0, loan.principalAmount);

  const levelPayment =
    repaymentType === "equal-payment" ? roundYen(annuityPayment(openingPrincipal, monthlyRate, termMonths)) : 0;
  const basePrincipalPayment = repaymentType === "equal-principal" && termMonths > 0 ? Math.floor(openingPrincipal / termMonths) : 0;

  for (let n = 1; n <= termMonths; n++) {
    const paymentDate = addMonths(loan.startDate, n);
    const isLastInstallment = n === termMonths;
    const interestPayment = roundYen(openingPrincipal * monthlyRate);

    let principalPayment: number;
    if (repaymentType === "equal-principal") {
      principalPayment = isLastInstallment ? openingPrincipal : basePrincipalPayment;
    } else {
      principalPayment = isLastInstallment ? openingPrincipal : Math.max(0, levelPayment - interestPayment);
    }
    // 端数調整の結果、残存元本残高を超えて返済することがないようガードする
    principalPayment = Math.min(principalPayment, openingPrincipal);

    const closingPrincipal = openingPrincipal - principalPayment;

    installments.push({
      installmentNumber: n,
      paymentDate,
      openingPrincipal,
      principalPayment,
      interestPayment,
      totalPayment: principalPayment + interestPayment,
      closingPrincipal,
    });

    openingPrincipal = closingPrincipal;
  }

  return {
    loan,
    repaymentType,
    installments,
    totalPrincipal: installments.reduce((sum, i) => sum + i.principalPayment, 0),
    totalInterest: installments.reduce((sum, i) => sum + i.interestPayment, 0),
  };
}

/**
 * 指定日（asOfDate）時点の元本残高を返す。
 * 借入日（startDate）より前の日付を指定した場合は0円（まだ借入前）。
 * 返済開始後は、asOfDate以前に返済日が到来した回までの返済を反映した残高を返す
 * （asOfDateがちょうど返済日の場合、その回の返済は反映済みとして扱う）。
 */
export function outstandingPrincipalAsOf(loan: Loan, asOfDate: string): number {
  if (asOfDate < loan.startDate) return 0;

  const schedule = buildLoanAmortizationSchedule(loan);
  let balance = loan.principalAmount;
  for (const installment of schedule.installments) {
    if (installment.paymentDate > asOfDate) break;
    balance = installment.closingPrincipal;
  }
  return balance;
}

/** 対象期間（fiscalPeriod、両端含む）に返済日が含まれる返済回のみを抽出する。生成バッチ等で使用。 */
export function installmentsWithinPeriod(loan: Loan, period: FiscalPeriod): LoanInstallment[] {
  const schedule = buildLoanAmortizationSchedule(loan);
  return schedule.installments.filter((i) => i.paymentDate >= period.start && i.paymentDate <= period.end);
}

export interface LoanPeriodSummary {
  loan: Loan;
  /** 対象期間内に返済日が到来する返済回の一覧 */
  installments: LoanInstallment[];
  totalPrincipalPayment: number;
  totalInterestPayment: number;
  /** 対象期間開始日の前日時点（＝期首時点）の元本残高 */
  openingPrincipal: number;
  /** 対象期間終了日時点（＝期末時点）の元本残高 */
  closingPrincipal: number;
}

/**
 * 借入金1件について、対象期間（事業年度・または特定の月）内の元本・利息の返済状況を集計する。
 * balanceSheetForm.ts（期末残高）・現金を伴わない仕訳の自動生成バッチの両方から利用する想定。
 */
export function summarizeLoanForPeriod(loan: Loan, period: FiscalPeriod): LoanPeriodSummary {
  const installments = installmentsWithinPeriod(loan, period);

  // 期首時点（対象期間開始日の前日）の残高。返済日が期間開始日と同日の回は
  // 「期中の返済」として扱うため、期首残高には含めない。
  const schedule = buildLoanAmortizationSchedule(loan);
  let openingPrincipal = period.start < loan.startDate ? 0 : loan.principalAmount;
  for (const installment of schedule.installments) {
    if (installment.paymentDate >= period.start) break;
    openingPrincipal = installment.closingPrincipal;
  }

  return {
    loan,
    installments,
    totalPrincipalPayment: installments.reduce((sum, i) => sum + i.principalPayment, 0),
    totalInterestPayment: installments.reduce((sum, i) => sum + i.interestPayment, 0),
    openingPrincipal,
    closingPrincipal: outstandingPrincipalAsOf(loan, period.end),
  };
}
