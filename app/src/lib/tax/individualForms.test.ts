import { describe, expect, it } from "vitest";
import { buildBlueReturnStatement, buildIndividualReturnForm } from "./individualForms";
import { CategorizedTransaction } from "../categorize/engine";
import { IndividualEstimate } from "./estimate";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

function estimate(overrides: Partial<IndividualEstimate>): IndividualEstimate {
  return {
    totalIncome: 8_000_000,
    totalExpense: 3_000_000,
    businessProfit: 5_000_000,
    socialInsuranceDeduction: 400_000,
    lifeInsurancePaidInfo: 100_000,
    blueReturnDeduction: 650_000,
    taxableIncome: 3_470_000,
    incomeTax: { tax: 249_500, marginalRate: 20 },
    reconstructionSurtax: 5_239,
    totalIncomeTax: 254_739,
    consumptionTax: {
      isLikelyExempt: true,
      salesTax: 0,
      purchaseTax: 0,
      payable: 0,
    },
    assumptions: [],
    ...overrides,
  };
}

describe("buildIndividualReturnForm", () => {
  it("applies the 650,000 blue-return deduction to business income when profit exceeds it", () => {
    const form = buildIndividualReturnForm(
      estimate({ businessProfit: 5_000_000, totalIncome: 8_000_000, blueReturnDeduction: 650_000 })
    );

    expect(form.incomeSection).toEqual([{ label: "事業（営業等）", symbol: "ア", amount: 8_000_000 }]);
    expect(form.incomeAmountSection).toEqual([
      { label: "事業（営業等）", symbol: "①", amount: 4_350_000 },
      { label: "合計", symbol: "⑫", amount: 4_350_000 },
    ]);
  });

  it("applies the estimate's 550,000 blue-return deduction (double-entry, paper filing) rather than a hardcoded max", () => {
    const form = buildIndividualReturnForm(
      estimate({ businessProfit: 5_000_000, totalIncome: 8_000_000, blueReturnDeduction: 550_000 })
    );

    expect(form.incomeAmountSection).toEqual([
      { label: "事業（営業等）", symbol: "①", amount: 4_450_000 },
      { label: "合計", symbol: "⑫", amount: 4_450_000 },
    ]);
  });

  it("applies the estimate's 100,000 blue-return deduction (simple bookkeeping)", () => {
    const form = buildIndividualReturnForm(
      estimate({ businessProfit: 5_000_000, totalIncome: 8_000_000, blueReturnDeduction: 100_000 })
    );

    expect(form.incomeAmountSection).toEqual([
      { label: "事業（営業等）", symbol: "①", amount: 4_900_000 },
      { label: "合計", symbol: "⑫", amount: 4_900_000 },
    ]);
  });

  it("clamps business income after blue-return deduction to 0 when profit is below the deduction", () => {
    const form = buildIndividualReturnForm(
      estimate({ businessProfit: 400_000, totalIncome: 400_000, blueReturnDeduction: 650_000 })
    );

    expect(form.incomeAmountSection[0].amount).toBe(0);
    expect(form.incomeAmountSection[1].amount).toBe(0);
  });

  it("clamps business income after blue-return deduction to 0 when profit is negative", () => {
    const form = buildIndividualReturnForm(estimate({ businessProfit: -200_000, totalIncome: 100_000 }));

    expect(form.incomeAmountSection[0].amount).toBe(0);
  });

  it("builds the deduction section from social insurance plus the fixed basic deduction", () => {
    const form = buildIndividualReturnForm(estimate({ socialInsuranceDeduction: 400_000 }));

    expect(form.deductionSection).toEqual([
      { label: "社会保険料控除", symbol: "⑬", amount: 400_000 },
      { label: "基礎控除", symbol: "㉕", amount: 480_000 },
      { label: "合計", symbol: "㉖", amount: 880_000 },
    ]);
  });

  it("builds the tax section directly from the estimate's tax figures", () => {
    const form = buildIndividualReturnForm(
      estimate({
        taxableIncome: 3_470_000,
        incomeTax: { tax: 249_500, marginalRate: 20 },
        reconstructionSurtax: 5_239,
        totalIncomeTax: 254_739,
      })
    );

    expect(form.taxSection).toEqual([
      { label: "課税される所得金額", symbol: "㉛", amount: 3_470_000 },
      { label: "上の㉛に対する税額", symbol: "㉜", amount: 249_500 },
      { label: "差引所得税額", symbol: "㊳", amount: 249_500 },
      { label: "復興特別所得税額", symbol: "㊶", amount: 5_239 },
      { label: "所得税及び復興特別所得税の額", symbol: "㊷", amount: 254_739 },
    ]);
  });
});

describe("buildBlueReturnStatement", () => {
  it("sums income and excludes personal-deduction-only rows from expenses", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高" }),
      tx({ id: "2", amount: 500_000, account: "売上高" }),
      tx({ id: "3", amount: -100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
      tx({
        id: "4",
        amount: -300_000,
        account: "社会保険料(個人)",
        taxCategory: "対象外",
        personalDeductionOnly: true,
      }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.salesTotal).toBe(1_500_000);
    expect(statement.expenseTotal).toBe(100_000);
    const rent = statement.standardExpenseLines.find((l) => l.label === "地代家賃");
    expect(rent?.amount).toBe(100_000);
    expect(statement.otherExpenseLines).toEqual([]);
  });

  it("lists every standard expense account in fixed order, defaulting to 0 when unused", () => {
    const statement = buildBlueReturnStatement([tx({ id: "1", amount: 1_000_000, account: "売上高" })]);

    expect(statement.standardExpenseLines.map((l) => l.label)).toEqual([
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
      "給料賃金・外注工賃（合算表示）",
      "利子割引料",
      "地代家賃",
      "貸倒金",
    ]);
    expect(statement.standardExpenseLines.every((l) => l.amount === 0)).toBe(true);
  });

  it("marks unsupported standard accounts (depreciation, interest/discount, bad debt) even when they have data", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高" }),
      tx({ id: "2", amount: -50_000, account: "減価償却費", taxCategory: "対象外" }),
      tx({ id: "3", amount: -10_000, account: "利子割引料", taxCategory: "対象外" }),
      tx({ id: "4", amount: -5_000, account: "貸倒金", taxCategory: "対象外" }),
      tx({ id: "5", amount: -20_000, account: "通信費", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    const byLabel = (label: string) => statement.standardExpenseLines.find((l) => l.label === label);
    expect(byLabel("減価償却費")).toEqual({ label: "減価償却費", amount: 50_000, unsupported: true });
    expect(byLabel("利子割引料")).toEqual({ label: "利子割引料", amount: 10_000, unsupported: true });
    expect(byLabel("貸倒金")).toEqual({ label: "貸倒金", amount: 5_000, unsupported: true });
    expect(byLabel("通信費")).toEqual({ label: "通信費", amount: 20_000, unsupported: false });
  });

  it("combines 給料賃金 and 外注工賃 rows under a single merged display label", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高" }),
      tx({ id: "2", amount: -200_000, account: "給料賃金/外注工賃", taxCategory: "対象外" }),
      tx({ id: "3", amount: -50_000, account: "給料賃金/外注工賃", taxCategory: "対象外" }),
    ];

    const statement = buildBlueReturnStatement(rows);
    const wages = statement.standardExpenseLines.find((l) => l.label === "給料賃金・外注工賃（合算表示）");
    expect(wages?.amount).toBe(250_000);
  });

  it("puts accounts outside the standard list into otherExpenseLines, sorted by amount descending", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高" }),
      tx({ id: "2", amount: -10_000, account: "雑費", taxCategory: "課税仕入10%" }),
      tx({ id: "3", amount: -40_000, account: "会議費", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.otherExpenseLines).toEqual([
      { label: "会議費", amount: 40_000 },
      { label: "雑費", amount: 10_000 },
    ]);
    expect(statement.standardExpenseLines.find((l) => l.label === "雑費")).toBeUndefined();
    expect(statement.expenseTotal).toBe(50_000);
  });

  it("defaults to capping the blue-return deduction at 550,000 (double-entry, paper filing) when no options are given", () => {
    const rows = [
      tx({ id: "1", amount: 5_000_000, account: "売上高" }),
      tx({ id: "2", amount: -1_000_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.incomeBeforeBlueDeduction).toBe(4_000_000);
    expect(statement.blueReturnDeduction).toBe(550_000);
    expect(statement.incomeAfterBlueDeduction).toBe(3_450_000);
  });

  it("caps the blue-return deduction at 650,000 when double-entry bookkeeping is filed via e-Tax", () => {
    const rows = [
      tx({ id: "1", amount: 5_000_000, account: "売上高" }),
      tx({ id: "2", amount: -1_000_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows, { bookkeepingMethod: "double", filingMethod: "eTax" });

    expect(statement.incomeBeforeBlueDeduction).toBe(4_000_000);
    expect(statement.blueReturnDeduction).toBe(650_000);
    expect(statement.incomeAfterBlueDeduction).toBe(3_350_000);
  });

  it("caps the blue-return deduction at 100,000 for simple bookkeeping, even when income exceeds it", () => {
    const rows = [
      tx({ id: "1", amount: 5_000_000, account: "売上高" }),
      tx({ id: "2", amount: -1_000_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows, { bookkeepingMethod: "simple", filingMethod: "eTax" });

    expect(statement.incomeBeforeBlueDeduction).toBe(4_000_000);
    expect(statement.blueReturnDeduction).toBe(100_000);
    expect(statement.incomeAfterBlueDeduction).toBe(3_900_000);
  });

  it("reduces the blue-return deduction to match income when income is below 650,000", () => {
    const rows = [
      tx({ id: "1", amount: 500_000, account: "売上高" }),
      tx({ id: "2", amount: -100_000, account: "通信費", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.incomeBeforeBlueDeduction).toBe(400_000);
    expect(statement.blueReturnDeduction).toBe(400_000);
    expect(statement.incomeAfterBlueDeduction).toBe(0);
  });

  it("applies no deduction and leaves income negative when expenses exceed sales", () => {
    const rows = [
      tx({ id: "1", amount: 100_000, account: "売上高" }),
      tx({ id: "2", amount: -300_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.incomeBeforeBlueDeduction).toBe(-200_000);
    expect(statement.blueReturnDeduction).toBe(0);
    expect(statement.incomeAfterBlueDeduction).toBe(-200_000);
  });

  // Regression: 青色申告決算書の「収入金額」は事業の売上のみを指し、借入金の実行や
  // 出資（元入金）の払込みのような貸借対照表項目は含まない。
  it("excludes loan proceeds and capital contributions from the 収入 (sales) total", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, account: "売上高" }),
      tx({
        id: "2",
        amount: 4_000_000,
        account: "借入金",
        taxCategory: "対象外",
        excludeFromIncome: true,
      }),
      tx({ id: "3", amount: -100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];

    const statement = buildBlueReturnStatement(rows);

    expect(statement.salesTotal).toBe(1_000_000);
    expect(statement.incomeBeforeBlueDeduction).toBe(900_000);
  });

  it("returns zeroed totals for an empty input", () => {
    const statement = buildBlueReturnStatement([]);

    expect(statement.salesTotal).toBe(0);
    expect(statement.expenseTotal).toBe(0);
    expect(statement.incomeBeforeBlueDeduction).toBe(0);
    expect(statement.blueReturnDeduction).toBe(0);
    expect(statement.incomeAfterBlueDeduction).toBe(0);
    expect(statement.otherExpenseLines).toEqual([]);
    expect(statement.standardExpenseLines).toHaveLength(16);
  });
});
