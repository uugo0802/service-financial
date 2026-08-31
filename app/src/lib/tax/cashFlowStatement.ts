// ------------------------------------------------------------------
// 簡易キャッシュ・フロー計算書（間接法）の生成。
//
// docs/superpowers/specs/2026-08-31-simplified-cash-flow-statement-design.md の設計に沿う。
// マイクロ法人向けの簡易版として、営業・投資・財務の3区分＋期末現金残高との整合性
// チェックのみを対象とし、為替換算調整額等その他の区分は扱わない。直接法には対応しない
// （常に間接法のみ）。
//
// 各区分の計算根拠:
//   - 営業活動によるキャッシュ・フロー: 当期純利益（buildBalanceSheetForm() に渡すのと
//     同じ netIncome。法人税等・消費税等控除後） + 減価償却費（別表十六（一）の当期償却額
//     合計、buildDepreciationScheduleForm() の totals.currentYearDepreciationExpenseTotal）
//     ± 未払法人税等の増減 ± 未払消費税等の増減。未払法人税等・未払消費税等はいずれも
//     balanceSheetForm.ts と同じ「期首残高は0」という前提を踏襲するため、balanceSheet の
//     期末残高（unpaidCorporateTaxes・unpaidConsumptionTax）がそのまま当期の増加額になる。
//   - 投資活動によるキャッシュ・フロー: 当期中（fiscalPeriod内）に取得日がある固定資産の
//     取得価額の合計をマイナス計上する。期首以前に取得済みの資産・翌期以降取得予定の資産は
//     含めない。
//   - 財務活動によるキャッシュ・フロー: 借入金の当期増減（loanAmortization.ts の
//     summarizeLoanForPeriod() が返す期首・期末元本残高の差の合計）。loansが空の場合は0。
//   - 期末現金残高との整合性チェック: 上記3区分の合計 + 期首現金残高 が、貸借対照表の
//     期末現金及び預金（balanceSheet.endingCash）と一致するかを検算し、差額があれば
//     warningとして返す（旧ブランチの「built-in reconciliation check」を踏襲）。
// ------------------------------------------------------------------

import { Asset, FiscalPeriod } from "./depreciation";
import { buildDepreciationScheduleForm } from "./depreciationScheduleForm";
import { Loan, summarizeLoanForPeriod } from "./loanAmortization";

export interface CashFlowStatementInputs {
  /** 対象期間（fixedAssets・loansの期首・期末残高の計算に使用） */
  fiscalPeriod: FiscalPeriod;
  /** 当期純利益（法人税等・消費税等すべて控除後。buildBalanceSheetForm()に渡すnetIncomeと同じ値） */
  netIncome: number;
  /** 未払法人税等（balanceSheet.unpaidCorporateTaxes。期首0前提のため、そのまま当期の増加額） */
  unpaidCorporateTaxes: number;
  /** 未払消費税等（balanceSheet.unpaidConsumptionTax。期首0前提のため、そのまま当期の増加額） */
  unpaidConsumptionTax: number;
  /** 固定資産一覧（fixed_assets）。減価償却費の加算・投資活動区分の算出に使用。データが無ければ空配列 */
  fixedAssets: Asset[];
  /** 借入金一覧（loans）。財務活動区分の算出に使用。データが無ければ空配列 */
  loans: Loan[];
  /** 期首現金及び預金残高（balanceSheet.openingCash相当） */
  openingCash: number;
  /** 貸借対照表の期末現金及び預金（balanceSheet.endingCash）。整合性チェックの基準値 */
  balanceSheetEndingCash: number;
}

export interface CashFlowLine {
  label: string;
  amount: number;
}

export interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  /** このセクション内のlines合計（区分小計） */
  subtotal: number;
}

export interface CashFlowStatement {
  fiscalPeriod: FiscalPeriod;
  operating: CashFlowSection; // 営業活動によるキャッシュ・フロー
  investing: CashFlowSection; // 投資活動によるキャッシュ・フロー
  financing: CashFlowSection; // 財務活動によるキャッシュ・フロー
  /** 現金及び現金同等物の当期増減額（operating.subtotal + investing.subtotal + financing.subtotal） */
  netChangeInCash: number;
  /** 現金及び現金同等物の期首残高 */
  openingCash: number;
  /** 現金及び現金同等物の期末残高（openingCash + netChangeInCash。このキャッシュ・フロー計算書側の積み上げ結果） */
  calculatedEndingCash: number;
  /** 貸借対照表の現金及び預金（期末）。整合性チェックの基準値としてそのまま転記する */
  balanceSheetEndingCash: number;
  /** balanceSheetEndingCash - calculatedEndingCash（不一致の場合の差額） */
  reconciliationDifference: number;
  /** 差額が実質ゼロ（1円未満）であれば true。balanceSheetForm.tsのbalancedと同じ閾値の考え方 */
  balanced: boolean;
  /** 不一致の場合の警告文を含む注記 */
  notes: string[];
}

function formatYen(amount: number): string {
  return `${Math.round(amount).toLocaleString("ja-JP")}円`;
}

function sectionSubtotal(lines: CashFlowLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

/**
 * 固定資産一覧のうち、対象期間中（fiscalPeriod.start〜fiscalPeriod.end、両端含む）に
 * 取得日がある資産の取得価額の合計を返す（投資活動区分のマイナス計上額の基礎）。
 */
export function sumFixedAssetAcquisitionsWithinPeriod(fixedAssets: Asset[], period: FiscalPeriod): number {
  return fixedAssets
    .filter((asset) => asset.acquisitionDate >= period.start && asset.acquisitionDate <= period.end)
    .reduce((sum, asset) => sum + asset.acquisitionCost, 0);
}

/**
 * 借入金一覧の当期増減（期末元本残高の合計 - 期首元本残高の合計）を返す（財務活動区分の基礎）。
 * loansが空の場合は0。
 */
export function sumLoanNetChangeForPeriod(loans: Loan[], period: FiscalPeriod): number {
  const summaries = loans.map((loan) => summarizeLoanForPeriod(loan, period));
  const openingTotal = summaries.reduce((sum, s) => sum + s.openingPrincipal, 0);
  const closingTotal = summaries.reduce((sum, s) => sum + s.closingPrincipal, 0);
  return closingTotal - openingTotal;
}

export function buildCashFlowStatement(inputs: CashFlowStatementInputs): CashFlowStatement {
  const depreciation = buildDepreciationScheduleForm(inputs.fixedAssets, inputs.fiscalPeriod).totals
    .currentYearDepreciationExpenseTotal;

  const operatingLines: CashFlowLine[] = [
    { label: "当期純利益", amount: inputs.netIncome },
    { label: "減価償却費", amount: depreciation },
    { label: "未払法人税等の増減額", amount: inputs.unpaidCorporateTaxes },
    { label: "未払消費税等の増減額", amount: inputs.unpaidConsumptionTax },
  ];
  const operating: CashFlowSection = {
    title: "営業活動によるキャッシュ・フロー",
    lines: operatingLines,
    subtotal: sectionSubtotal(operatingLines),
  };

  const fixedAssetAcquisitions = sumFixedAssetAcquisitionsWithinPeriod(inputs.fixedAssets, inputs.fiscalPeriod);
  const investingLines: CashFlowLine[] = [{ label: "固定資産の取得による支出", amount: -fixedAssetAcquisitions }];
  const investing: CashFlowSection = {
    title: "投資活動によるキャッシュ・フロー",
    lines: investingLines,
    subtotal: sectionSubtotal(investingLines),
  };

  const loanNetChange = sumLoanNetChangeForPeriod(inputs.loans, inputs.fiscalPeriod);
  const financingLines: CashFlowLine[] = [{ label: "借入金の増減額", amount: loanNetChange }];
  const financing: CashFlowSection = {
    title: "財務活動によるキャッシュ・フロー",
    lines: financingLines,
    subtotal: sectionSubtotal(financingLines),
  };

  const netChangeInCash = operating.subtotal + investing.subtotal + financing.subtotal;
  const calculatedEndingCash = inputs.openingCash + netChangeInCash;
  const reconciliationDifference = inputs.balanceSheetEndingCash - calculatedEndingCash;
  const balanced = Math.abs(reconciliationDifference) < 1;

  const notes: string[] = [];
  if (!balanced) {
    notes.push(
      `キャッシュ・フロー計算書から積み上げた期末現金残高（${formatYen(
        calculatedEndingCash
      )}）と、貸借対照表の現金及び預金（${formatYen(
        inputs.balanceSheetEndingCash
      )}）が一致していません（差額: ${formatYen(reconciliationDifference)}）。入力値をご確認ください。`
    );
  }

  return {
    fiscalPeriod: inputs.fiscalPeriod,
    operating,
    investing,
    financing,
    netChangeInCash,
    openingCash: inputs.openingCash,
    calculatedEndingCash,
    balanceSheetEndingCash: inputs.balanceSheetEndingCash,
    reconciliationDifference,
    balanced,
    notes,
  };
}
