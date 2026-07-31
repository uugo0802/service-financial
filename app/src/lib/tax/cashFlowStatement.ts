import { ProfitLossStatement } from "./plStatement";
import { BalanceSheetForm } from "./balanceSheetForm";

// ------------------------------------------------------------------
// キャッシュフロー計算書（簡易間接法）の生成。
//
// このアプリは銀行口座等の取引明細（フロー情報）しか保持しておらず、
// 固定資産台帳・借入金台帳・増資履歴などのストック情報を持っていない。
// そのため「正式なキャッシュフロー計算書」（会社計算規則・企業会計基準に
// 準拠したもの）は作成できず、あくまで
//   ・当期純利益（貸借対照表と整合させた値。buildBalanceSheetForm の出力）
//   ・減価償却費、固定資産の売買、借入・返済、増資、配当など
//     このアプリが自動集計できない項目（利用者が任意入力）
// を組み合わせた「簡易試算」を作る。
//
// 営業活動区分の「未払法人税等の増加額」「未払消費税等の増加額」は、
// balanceSheetForm.ts と同じ前提（期首時点の負債はゼロ）を利用し、
// 当期末残高＝当期中の増加額とみなして計算している。この前提のため、
// 減価償却費・投資活動・財務活動をすべて0（未入力）のまま試算すると、
// 営業活動によるキャッシュフローは必ず「期末現金－期首現金（実際の現金増減）」
// と一致する（内部整合性の検算になる）。減価償却費や投資・財務活動の金額を
// 入力すると、それらは取引明細からは検出できない追加情報として扱われるため、
// 試算上の期末現金と貸借対照表の期末現金（実際の入出金の集計）は一致しなく
// なる場合がある。これは計算間違いではなく、入力した非資金項目・追加の
// 投資財務活動が明細データの外側にある情報であることに起因する。
//
// 【重要】本機能は税理士法上の「個別具体的な税務相談」や正式な決算書の
// 作成にはあたらない、下書き・試算のためのツールである。金額は必ず
// 利用者自身の判断・確認のもとでご利用いただくこと。
// ------------------------------------------------------------------

export interface CashFlowLine {
  label: string;
  amount: number;
}

/** 投資活動・財務活動に関する任意入力項目（本アプリが取引明細から自動集計できない項目） */
export interface CashFlowSimplifiedInputs {
  /** 減価償却費（任意）。固定資産台帳を保持していないため利用者が入力する。未入力の場合は0として扱う */
  depreciationExpense?: number;
  /** 固定資産等の取得による支出（任意、正の数で入力） */
  assetPurchases?: number;
  /** 固定資産等の売却による収入（任意、正の数で入力） */
  assetSales?: number;
  /** 借入による収入（任意、正の数で入力） */
  borrowings?: number;
  /** 借入金の返済による支出（任意、正の数で入力） */
  loanRepayments?: number;
  /** 増資による収入（任意、正の数で入力） */
  capitalIncrease?: number;
  /** 配当金の支払額（任意、正の数で入力） */
  dividendsPaid?: number;
}

export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;

  operatingLines: CashFlowLine[];
  operatingActivitiesCashFlow: number;

  investingLines: CashFlowLine[];
  investingActivitiesCashFlow: number;

  financingLines: CashFlowLine[];
  financingActivitiesCashFlow: number;

  /** 現金及び現金同等物の増減額（営業＋投資＋財務） */
  netChangeInCash: number;
  /** 現金及び現金同等物の期首残高（貸借対照表フォームの期首現金） */
  openingCashBalance: number;
  /** 現金及び現金同等物の期末残高（この試算上の計算値＝期首残高＋増減額） */
  endingCashBalanceEstimate: number;
  /**
   * 貸借対照表フォームが算出した実際の期末現金残高（取引明細の入出金集計そのもの）。
   * 減価償却費や投資・財務活動を入力していない場合、endingCashBalanceEstimate と一致する。
   */
  actualEndingCashBalance: number;
  /** 上記2つの期末現金残高が一致しているか（誤差1円未満なら一致とみなす） */
  reconcilesWithBalanceSheet: boolean;

  /**
   * 営業活動によるキャッシュフロー ÷ 売上高（当期収入合計）。
   * 「利益は出ているのに手元資金が増えない」等を可視化するための参考指標。
   * 売上高が0（収入取引がない期）は比率が定義できないため null を返す
   * （0除算によるInfinity/NaNの発生を避ける）。
   */
  operatingCashFlowToRevenueRatio: number | null;

  /**
   * 営業活動によるキャッシュフロー－当期純利益。
   * 会計上の利益と実際の資金繰りの差（減価償却費・未払税金の増減等による差）を示す。
   */
  cashFlowToNetIncomeGap: number;

  /** UI表示・説明用の前提条件・注意事項 */
  assumptions: string[];
}

function clampNonNegative(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
}

/** 符号を反転する。`-0`（JavaScriptで0を反転すると発生する）を`0`に正規化して返す。 */
function negate(value: number): number {
  return value === 0 ? 0 : -value;
}

/**
 * 簡易間接法によるキャッシュフロー計算書（試算）を作成する。
 *
 * @param pl 対象期間の損益計算書（buildProfitLossStatement の出力）。期間表示と
 *           売上高対比率の算出に利用する。
 * @param bs 対象期間の貸借対照表フォーム（buildBalanceSheetForm の出力）。
 *           当期純利益・期首現金・期末現金・未払法人税等/消費税等の増加額の
 *           算出に利用する。
 * @param simplified 投資活動・財務活動・減価償却費など、取引明細からは
 *           自動集計できない任意入力項目。未指定の項目は0として扱う。
 */
export function buildCashFlowStatement(
  pl: ProfitLossStatement,
  bs: BalanceSheetForm,
  simplified: CashFlowSimplifiedInputs = {}
): CashFlowStatement {
  const depreciationExpense = clampNonNegative(simplified.depreciationExpense);
  const assetPurchases = clampNonNegative(simplified.assetPurchases);
  const assetSales = clampNonNegative(simplified.assetSales);
  const borrowings = clampNonNegative(simplified.borrowings);
  const loanRepayments = clampNonNegative(simplified.loanRepayments);
  const capitalIncrease = clampNonNegative(simplified.capitalIncrease);
  const dividendsPaid = clampNonNegative(simplified.dividendsPaid);

  // 期首の負債はゼロという balanceSheetForm.ts の前提により、
  // 期末の未払残高＝当期中の増加額とみなす。
  const increaseInUnpaidCorporateTaxes = bs.unpaidCorporateTaxes;
  const increaseInUnpaidConsumptionTax = bs.unpaidConsumptionTax;

  const operatingLines: CashFlowLine[] = [
    { label: "当期純利益", amount: bs.netIncome },
    { label: "減価償却費（非資金支出項目の加算）", amount: depreciationExpense },
    { label: "未払法人税等の増加額", amount: increaseInUnpaidCorporateTaxes },
    { label: "未払消費税等の増加額", amount: increaseInUnpaidConsumptionTax },
  ];
  const operatingActivitiesCashFlow = operatingLines.reduce((s, l) => s + l.amount, 0);

  const investingLines: CashFlowLine[] = [
    { label: "固定資産の取得による支出", amount: negate(assetPurchases) },
    { label: "固定資産の売却による収入", amount: assetSales },
  ];
  const investingActivitiesCashFlow = investingLines.reduce((s, l) => s + l.amount, 0);

  const financingLines: CashFlowLine[] = [
    { label: "借入による収入", amount: borrowings },
    { label: "借入金の返済による支出", amount: negate(loanRepayments) },
    { label: "増資による収入", amount: capitalIncrease },
    { label: "配当金の支払額", amount: negate(dividendsPaid) },
  ];
  const financingActivitiesCashFlow = financingLines.reduce((s, l) => s + l.amount, 0);

  const netChangeInCash = operatingActivitiesCashFlow + investingActivitiesCashFlow + financingActivitiesCashFlow;
  const openingCashBalance = bs.openingCash;
  const endingCashBalanceEstimate = openingCashBalance + netChangeInCash;
  const actualEndingCashBalance = bs.endingCash;
  const reconcilesWithBalanceSheet = Math.abs(endingCashBalanceEstimate - actualEndingCashBalance) < 1;

  const operatingCashFlowToRevenueRatio =
    pl.incomeTotal > 0 ? Math.round((operatingActivitiesCashFlow / pl.incomeTotal) * 10000) / 10000 : null;

  const cashFlowToNetIncomeGap = operatingActivitiesCashFlow - bs.netIncome;

  const assumptions = [
    "このアプリは取引明細（フロー情報）のみを保持しているため、固定資産・借入金・増資等の台帳は管理していません。減価償却費・投資活動・財務活動の金額は、入力があった場合のみ試算に反映される任意項目です",
    "「未払法人税等」「未払消費税等」の増減額は、貸借対照表フォームと同じ前提（期首の負債はゼロ）に基づき、期末残高をそのまま当期の増加額として扱っています",
    "本書類は取引明細から機械的に算出した簡易試算であり、企業会計基準・会社計算規則に準拠した正式なキャッシュフロー計算書ではありません。個別の会計処理・税務判断については、必ずご自身または税理士等の専門家にご確認ください",
  ];
  if (!reconcilesWithBalanceSheet) {
    assumptions.push(
      "減価償却費・投資活動・財務活動の入力値により、この試算上の期末現金残高は貸借対照表の期末現金残高（実際の入出金の集計）と一致していません。これらは取引明細からは検出できない追加情報のため、金額の妥当性はご自身でご確認ください"
    );
  }

  return {
    periodStart: pl.periodStart,
    periodEnd: pl.periodEnd,
    operatingLines,
    operatingActivitiesCashFlow,
    investingLines,
    investingActivitiesCashFlow,
    financingLines,
    financingActivitiesCashFlow,
    netChangeInCash,
    openingCashBalance,
    endingCashBalanceEstimate,
    actualEndingCashBalance,
    reconcilesWithBalanceSheet,
    operatingCashFlowToRevenueRatio,
    cashFlowToNetIncomeGap,
    assumptions,
  };
}
