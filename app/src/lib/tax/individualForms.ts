import { CategorizedTransaction } from "../categorize/engine";
import { IndividualEstimate } from "./estimate";

// ------------------------------------------------------------------
// 「所得税及び復興特別所得税の確定申告書」第一表と、
// 「所得税青色申告決算書（一般用）」1ページ目・損益計算書の欄構成に沿った表示。
// 記号・番号は国税庁様式に準拠（ア・①など）。給与所得や他の所得区分、
// 社会保険料控除以外の所得控除（生命保険料控除・扶養控除等）は未対応です。
// ------------------------------------------------------------------

export interface IndividualReturnForm {
  incomeSection: { label: string; symbol: string; amount: number }[]; // 収入金額等
  incomeAmountSection: { label: string; symbol: string; amount: number }[]; // 所得金額等
  deductionSection: { label: string; symbol: string; amount: number }[]; // 所得から差し引かれる金額
  taxSection: { label: string; symbol: string; amount: number }[]; // 税金の計算
}

export function buildIndividualReturnForm(estimate: IndividualEstimate): IndividualReturnForm {
  const businessIncomeAfterBlueDeduction = Math.max(
    0,
    estimate.businessProfit - 650_000
  );

  return {
    incomeSection: [{ label: "事業（営業等）", symbol: "ア", amount: estimate.totalIncome }],
    incomeAmountSection: [
      { label: "事業（営業等）", symbol: "①", amount: businessIncomeAfterBlueDeduction },
      { label: "合計", symbol: "⑫", amount: businessIncomeAfterBlueDeduction },
    ],
    deductionSection: [
      { label: "社会保険料控除", symbol: "⑬", amount: estimate.socialInsuranceDeduction },
      { label: "基礎控除", symbol: "㉕", amount: 480_000 },
      { label: "合計", symbol: "㉖", amount: estimate.socialInsuranceDeduction + 480_000 },
    ],
    taxSection: [
      { label: "課税される所得金額", symbol: "㉛", amount: estimate.taxableIncome },
      { label: "上の㉛に対する税額", symbol: "㉜", amount: estimate.incomeTax.tax },
      { label: "差引所得税額", symbol: "㊳", amount: estimate.incomeTax.tax },
      { label: "復興特別所得税額", symbol: "㊶", amount: estimate.reconstructionSurtax },
      { label: "所得税及び復興特別所得税の額", symbol: "㊷", amount: estimate.totalIncomeTax },
    ],
  };
}

export interface BlueReturnPlLine {
  label: string;
  amount: number;
  /** true なら実データがなく0円固定（減価償却費・利子割引料・貸倒金など、当アプリ未対応の科目） */
  unsupported?: boolean;
}

export interface BlueReturnStatement {
  salesTotal: number;
  standardExpenseLines: BlueReturnPlLine[];
  otherExpenseLines: BlueReturnPlLine[]; // 標準科目にない経費（様式の空欄行に相当）
  expenseTotal: number;
  incomeBeforeBlueDeduction: number; // 差引金額
  blueReturnDeduction: number;
  incomeAfterBlueDeduction: number; // 所得金額
}

// 青色申告決算書（一般用）1ページ目・損益計算書の経費欄、標準の並び順
const STANDARD_EXPENSE_ORDER = [
  "租税公課",
  "荷造運賃",
  "水道光熱費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "接待交際費",
  "損害保険料",
  "修繕費",
  "消耗品費",
  "減価償却費",
  "福利厚生費",
  "給料賃金/外注工賃",
  "利子割引料",
  "地代家賃",
  "貸倒金",
];
const UNSUPPORTED_ACCOUNTS = new Set(["減価償却費", "利子割引料", "貸倒金"]);
const STANDARD_DISPLAY_LABEL: Record<string, string> = {
  "給料賃金/外注工賃": "給料賃金・外注工賃（合算表示）",
};

export function buildBlueReturnStatement(rows: CategorizedTransaction[]): BlueReturnStatement {
  // 借入金の実行・出資（元入金）の払込み等（excludeFromIncome）は貸借対照表項目であり、
  // 青色申告決算書の「収入金額」（事業の売上）には含めない。
  const income = rows.filter((r) => r.amount > 0 && !r.excludeFromIncome);
  const expense = rows.filter((r) => r.amount < 0 && !r.personalDeductionOnly);

  const salesTotal = income.reduce((s, r) => s + r.amount, 0);

  const totalsByAccount = new Map<string, number>();
  for (const r of expense) {
    totalsByAccount.set(r.account, (totalsByAccount.get(r.account) ?? 0) + Math.abs(r.amount));
  }

  const standardExpenseLines: BlueReturnPlLine[] = STANDARD_EXPENSE_ORDER.map((account) => ({
    label: STANDARD_DISPLAY_LABEL[account] ?? account,
    amount: totalsByAccount.get(account) ?? 0,
    unsupported: UNSUPPORTED_ACCOUNTS.has(account),
  }));

  const mappedAccounts = new Set(STANDARD_EXPENSE_ORDER);
  const otherExpenseLines: BlueReturnPlLine[] = Array.from(totalsByAccount.entries())
    .filter(([account]) => !mappedAccounts.has(account))
    .map(([account, amount]) => ({ label: account, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expenseTotal =
    standardExpenseLines.reduce((s, l) => s + l.amount, 0) + otherExpenseLines.reduce((s, l) => s + l.amount, 0);

  const incomeBeforeBlueDeduction = salesTotal - expenseTotal;
  const blueReturnDeduction = Math.min(650_000, Math.max(0, incomeBeforeBlueDeduction));

  return {
    salesTotal,
    standardExpenseLines,
    otherExpenseLines,
    expenseTotal,
    incomeBeforeBlueDeduction,
    blueReturnDeduction,
    incomeAfterBlueDeduction: incomeBeforeBlueDeduction - blueReturnDeduction,
  };
}
