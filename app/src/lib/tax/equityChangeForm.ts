// ------------------------------------------------------------------
// 株主資本等変動計算書（下書き・試算）の生成。
//
// 期首の資本金・資本剰余金・利益剰余金（繰越利益剰余金）の残高は、
// このアプリが保持する取引明細（フロー情報）だけでは算出できないため、
// 利用者にその3つだけ手入力してもらう想定とする（EquityChangeOpeningBalances）。
// 当期純利益は buildFinancialStatements() が算出した FinancialStatements.netIncome を
// そのまま渡してもらい、繰越利益剰余金に積み増す。増資・減資・資本剰余金の変動・
// 剰余金の配当など、それ以外の当期変動（EquityChangeMovements）は任意入力で、
// 指定がなければすべて0として扱う。
//
// 免責: 税理士法第2条により、税務相談・税務書類の作成は税理士の独占業務。
// このモジュールは入力された残高・変動額を機械的に集計するだけの「下書き・試算」
// 生成であり、期首残高が正しいかどうかの判断や、増資・配当等の会計・税務上の
// 適否についての個別助言は行わない。必ずUI側で「下書き」であることを明示し、
// 最終判断は税理士に相談するよう促すこと（disclaimer フィールドを参照）。
// ------------------------------------------------------------------

export const EQUITY_CHANGE_STATEMENT_DISCLAIMER =
  "この株主資本等変動計算書は、入力された期首残高と当期純利益・当期変動額をもとに機械的に集計した下書き・試算です。" +
  "期首残高が前期の決算書・総勘定元帳と一致しているかはご自身でご確認ください。個別具体の会計・税務判断については税理士にご相談ください。";

export interface EquityChangeOpeningBalances {
  capitalStock: number; // 資本金 当期首残高
  capitalSurplus: number; // 資本剰余金 当期首残高（資本準備金・その他資本剰余金の内訳は区分しない）
  retainedEarnings: number; // 利益剰余金（繰越利益剰余金）当期首残高
}

export interface EquityChangeMovements {
  capitalIncrease?: number; // 新株の発行等による増資額（資本金の増加）
  capitalDecrease?: number; // 減資額（資本金の減少）。正の値で入力する
  capitalSurplusChange?: number; // 上記以外の資本剰余金の当期変動額。増加は正、減少は負で入力する
  dividends?: number; // 剰余金の配当（利益剰余金の減少）。正の値で入力する
  otherRetainedEarningsChange?: number; // 当期純利益・配当以外の利益剰余金の変動。増加は正、減少は負で入力する
}

export interface EquityChangeMovementLine {
  label: string;
  amount: number; // 正の値は増加、負の値は減少
}

// 資本金・資本剰余金・利益剰余金など、株主資本の各区分ごとの期首残高〜期末残高。
export interface EquityComponentChange {
  openingBalance: number;
  movementLines: EquityChangeMovementLine[];
  changeTotal: number;
  endingBalance: number;
}

export interface EquityChangeStatement {
  periodStart: string;
  periodEnd: string;
  capitalStock: EquityComponentChange;
  capitalSurplus: EquityComponentChange;
  retainedEarnings: EquityComponentChange;
  // 株主資本合計。このアプリでは評価・換算差額等区分（その他有価証券評価差額金等）を
  // 扱わないため、純資産合計と同額になる。
  shareholdersEquityTotal: EquityComponentChange;
  netIncome: number;
  // 期末純資産の想定値（例: 貸借対照表の netAssetsTotal）を渡した場合のみ、
  // この計算書の期末残高と一致するかどうかの検算結果を返す。渡さなければ undefined。
  reconcilesWithBalanceSheet?: boolean;
  disclaimer: string;
}

function buildComponentChange(
  openingBalance: number,
  movementLines: EquityChangeMovementLine[]
): EquityComponentChange {
  const changeTotal = movementLines.reduce((s, l) => s + l.amount, 0);
  return {
    openingBalance,
    movementLines,
    changeTotal,
    endingBalance: openingBalance + changeTotal,
  };
}

export function buildEquityChangeForm(
  opening: EquityChangeOpeningBalances,
  periodStart: string,
  periodEnd: string,
  netIncome: number,
  movements: EquityChangeMovements = {},
  expectedNetAssetsEnding?: number
): EquityChangeStatement {
  const capitalIncrease = movements.capitalIncrease ?? 0;
  const capitalDecrease = movements.capitalDecrease ?? 0;
  const capitalSurplusChange = movements.capitalSurplusChange ?? 0;
  const dividends = movements.dividends ?? 0;
  const otherRetainedEarningsChange = movements.otherRetainedEarningsChange ?? 0;

  const capitalStockLines: EquityChangeMovementLine[] = [];
  if (capitalIncrease !== 0) capitalStockLines.push({ label: "新株の発行(増資)", amount: capitalIncrease });
  if (capitalDecrease !== 0) capitalStockLines.push({ label: "減資", amount: -capitalDecrease });
  const capitalStock = buildComponentChange(opening.capitalStock, capitalStockLines);

  const capitalSurplusLines: EquityChangeMovementLine[] = [];
  if (capitalSurplusChange !== 0) {
    capitalSurplusLines.push({ label: "資本剰余金の変動", amount: capitalSurplusChange });
  }
  const capitalSurplus = buildComponentChange(opening.capitalSurplus, capitalSurplusLines);

  const retainedEarningsLines: EquityChangeMovementLine[] = [{ label: "当期純利益", amount: netIncome }];
  if (dividends !== 0) retainedEarningsLines.push({ label: "剰余金の配当", amount: -dividends });
  if (otherRetainedEarningsChange !== 0) {
    retainedEarningsLines.push({ label: "その他の利益剰余金の変動", amount: otherRetainedEarningsChange });
  }
  const retainedEarnings = buildComponentChange(opening.retainedEarnings, retainedEarningsLines);

  const shareholdersEquityTotal = buildComponentChange(
    capitalStock.openingBalance + capitalSurplus.openingBalance + retainedEarnings.openingBalance,
    [...capitalStockLines, ...capitalSurplusLines, ...retainedEarningsLines]
  );

  const reconcilesWithBalanceSheet =
    expectedNetAssetsEnding === undefined
      ? undefined
      : Math.abs(shareholdersEquityTotal.endingBalance - expectedNetAssetsEnding) < 1;

  return {
    periodStart,
    periodEnd,
    capitalStock,
    capitalSurplus,
    retainedEarnings,
    shareholdersEquityTotal,
    netIncome,
    reconcilesWithBalanceSheet,
    disclaimer: EQUITY_CHANGE_STATEMENT_DISCLAIMER,
  };
}
