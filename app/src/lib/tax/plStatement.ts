import { CategorizedTransaction } from "../categorize/engine";

export interface PlLine {
  account: string;
  amount: number;
}

export interface ProfitLossStatement {
  incomeLines: PlLine[];
  incomeTotal: number;
  expenseLines: PlLine[];
  expenseTotal: number;
  profit: number;
  periodStart: string;
  periodEnd: string;
}

function groupByAccount(rows: CategorizedTransaction[]): PlLine[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.account, (totals.get(r.account) ?? 0) + Math.abs(r.amount));
  }
  return Array.from(totals.entries())
    .map(([account, amount]) => ({ account, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 勘定科目別の損益集計を作成する。
 * 期間は「取込んだ明細の先頭行・末尾行の日付」であり、正式な会計期間ではない
 * （日付の正規化・並び替えは行っていないため、CSVの並び順に依存する）。
 */
export function buildProfitLossStatement(rows: CategorizedTransaction[]): ProfitLossStatement {
  const income = rows.filter((r) => r.amount > 0);
  const expense = rows.filter((r) => r.amount < 0);

  const incomeLines = groupByAccount(income);
  const expenseLines = groupByAccount(expense);

  const incomeTotal = incomeLines.reduce((s, l) => s + l.amount, 0);
  const expenseTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  return {
    incomeLines,
    incomeTotal,
    expenseLines,
    expenseTotal,
    profit: incomeTotal - expenseTotal,
    periodStart: rows[0]?.date ?? "-",
    periodEnd: rows[rows.length - 1]?.date ?? "-",
  };
}
