import { describe, expect, it } from "vitest";
import { explainCorporateEstimateCalculation, explainIndividualEstimateCalculation } from "./taxEstimateExplainer";
import { estimateForIndividual } from "../tax/estimate";
import { estimateForMicroCorp } from "../tax/corporateEstimate";
import { CategorizedTransaction } from "../categorize/engine";

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

describe("explainIndividualEstimateCalculation", () => {
  it("builds a full income → deductions → taxable income → bracket tax → final amount trail for a simple profitable freelancer", () => {
    const rows = [
      tx({ id: "1", amount: 8_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows, { bookkeepingMethod: "double", filingMethod: "eTax" });
    const steps = explainIndividualEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収入金額",
      "必要経費",
      "事業所得",
      "青色申告特別控除",
      "基礎控除",
      "課税所得金額",
      "税率区分ごとの所得税額",
      "復興特別所得税",
      "所得税及び復興特別所得税の合計額",
    ]);

    // 収入・経費・事業所得が正しい金額で現れる
    expect(steps[0].amount).toBe(estimate.totalIncome);
    expect(steps[0].detail).toContain("8,000,000円");
    expect(steps[1].amount).toBe(estimate.totalExpense);
    expect(steps[2].amount).toBe(estimate.businessProfit);
    expect(steps[2].detail).toContain(estimate.totalIncome.toLocaleString("ja-JP"));

    // 社会保険料控除がゼロの場合はステップ自体が現れない（このフィクスチャには社保料の行がない）
    expect(estimate.socialInsuranceDeduction).toBe(0);
    expect(steps.map((s) => s.label)).not.toContain("社会保険料控除");

    // 課税所得金額・所得税額・合計額は estimate の値と一致する（再計算しない）
    const taxableStep = steps.find((s) => s.label === "課税所得金額")!;
    expect(taxableStep.amount).toBe(estimate.taxableIncome);

    const bracketStep = steps.find((s) => s.label === "税率区分ごとの所得税額")!;
    expect(bracketStep.amount).toBe(estimate.incomeTax.tax);
    expect(bracketStep.detail).toContain(`${estimate.incomeTax.marginalRate}%`);

    const surtaxStep = steps.find((s) => s.label === "復興特別所得税")!;
    expect(surtaxStep.amount).toBe(estimate.reconstructionSurtax);

    const finalStep = steps[steps.length - 1];
    expect(finalStep.isFinal).toBe(true);
    expect(finalStep.amount).toBe(estimate.totalIncomeTax);
    expect(finalStep.detail).toContain("最終的な税額");
  });

  it("includes a social insurance deduction step, in order, when multiple deduction types apply", () => {
    const rows = [
      tx({ id: "1", amount: 8_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
      tx({
        id: "3",
        amount: -500_000,
        account: "社会保険料(個人)",
        taxCategory: "対象外",
        personalDeductionOnly: true,
      }),
      tx({
        id: "4",
        amount: -100_000,
        account: "生命保険料(個人)",
        taxCategory: "対象外",
        personalDeductionOnly: true,
      }),
    ];
    const estimate = estimateForIndividual(rows, { bookkeepingMethod: "double", filingMethod: "eTax" });
    const steps = explainIndividualEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収入金額",
      "必要経費",
      "事業所得",
      "青色申告特別控除",
      "社会保険料控除",
      "基礎控除",
      "課税所得金額",
      "税率区分ごとの所得税額",
      "復興特別所得税",
      "所得税及び復興特別所得税の合計額",
    ]);

    const socialStep = steps.find((s) => s.label === "社会保険料控除")!;
    expect(socialStep.amount).toBe(500_000);
    expect(socialStep.detail).toContain("500,000円");

    const blueStep = steps.find((s) => s.label === "青色申告特別控除")!;
    expect(blueStep.amount).toBe(estimate.blueReturnDeduction);
  });

  it("reports a zero bracket-tax step and zero final amount for a zero/near-zero taxable income case", () => {
    const rows = [
      tx({ id: "1", amount: 500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -450_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows, { bookkeepingMethod: "simple" });

    expect(estimate.taxableIncome).toBe(0);

    const steps = explainIndividualEstimateCalculation(estimate);

    const taxableStep = steps.find((s) => s.label === "課税所得金額")!;
    expect(taxableStep.amount).toBe(0);

    const bracketStep = steps.find((s) => s.label === "税率区分ごとの所得税額")!;
    expect(bracketStep.amount).toBe(0);
    expect(bracketStep.detail).toBe("課税所得金額が0円のため、所得税額も0円です。");

    const finalStep = steps[steps.length - 1];
    expect(finalStep.amount).toBe(0);
    expect(finalStep.isFinal).toBe(true);
  });

  it("never claims a different final amount than estimate.totalIncomeTax", () => {
    const rows = [
      tx({ id: "1", amount: 12_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows);
    const steps = explainIndividualEstimateCalculation(estimate);
    expect(steps[steps.length - 1].amount).toBe(estimate.totalIncomeTax);
  });

  // Regression: when a loss-carryforward deduction is applied, the trail must surface it as its
  // own step (in the correct position, right after the blue-return deduction and before the
  // social-insurance/basic deductions, matching the subtraction order in tax/estimate.ts). Without
  // this step, the preceding steps' amounts no longer sum to estimate.taxableIncome, silently
  // breaking the explainer's core promise that it narrates exactly how the final number was reached.
  it("includes a 純損失の繰越控除 step, in the correct position, when a loss-carryforward deduction is applied", () => {
    const rows = [
      tx({ id: "1", amount: 8_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(
      rows,
      { bookkeepingMethod: "double", filingMethod: "eTax" },
      { currentFiscalYear: 2026, priorLosses: [{ fiscalYear: 2025, remainingLoss: 1_000_000 }] }
    );
    expect(estimate.lossCarryforward?.totalDeduction).toBe(1_000_000);

    const steps = explainIndividualEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収入金額",
      "必要経費",
      "事業所得",
      "青色申告特別控除",
      "純損失の繰越控除",
      "基礎控除",
      "課税所得金額",
      "税率区分ごとの所得税額",
      "復興特別所得税",
      "所得税及び復興特別所得税の合計額",
    ]);

    const lossStep = steps.find((s) => s.label === "純損失の繰越控除")!;
    expect(lossStep.amount).toBe(1_000_000);
    expect(lossStep.detail).toContain("1,000,000円");

    // The trail's math must reconcile with the actual taxableIncome: businessProfit - blueReturn -
    // lossCarryforward - basicDeduction (千円未満切り捨て), i.e. no deduction silently unaccounted for.
    const taxableStep = steps.find((s) => s.label === "課税所得金額")!;
    expect(taxableStep.amount).toBe(estimate.taxableIncome);
  });

  it("omits the 純損失の繰越控除 step when lossCarryforward is present but fully expired (zero deduction)", () => {
    const rows = [
      tx({ id: "1", amount: 8_000_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -2_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForIndividual(rows, undefined, {
      currentFiscalYear: 2026,
      priorLosses: [{ fiscalYear: 2021, remainingLoss: 500_000 }], // age = 5, past the 3-year window
    });
    expect(estimate.lossCarryforward?.totalDeduction).toBe(0);

    const steps = explainIndividualEstimateCalculation(estimate);
    expect(steps.map((s) => s.label)).not.toContain("純損失の繰越控除");
  });
});

describe("explainCorporateEstimateCalculation", () => {
  it("builds a full revenue → expenses → taxable income → bracket tax → final amount trail for a simple profitable year", () => {
    const rows = [
      tx({ id: "1", amount: 5_500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 2_200_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "3", amount: -1_100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    const steps = explainCorporateEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収益（益金）",
      "費用（損金）",
      "所得金額",
      "軽減税率の対象部分（年800万円以下）",
      "法人税額",
      "地方法人税",
      "法人税・地方法人税の合計額",
    ]);

    expect(steps[0].amount).toBe(estimate.revenue);
    expect(steps[1].amount).toBe(estimate.expenses);
    expect(steps[2].amount).toBe(estimate.taxableIncome);

    const finalStep = steps[steps.length - 1];
    expect(finalStep.amount).toBe(estimate.totalNationalTax);
    expect(finalStep.isFinal).toBe(true);
  });

  it("splits taxable income into reduced-rate and standard-rate steps once it exceeds 8,000,000", () => {
    const rows = [
      tx({ id: "1", amount: 9_500_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    expect(estimate.taxableIncome).toBe(8_500_000);

    const steps = explainCorporateEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収益（益金）",
      "費用（損金）",
      "所得金額",
      "軽減税率の対象部分（年800万円以下）",
      "基本税率の対象部分（年800万円超）",
      "法人税額",
      "地方法人税",
      "法人税・地方法人税の合計額",
    ]);

    const reducedStep = steps.find((s) => s.label === "軽減税率の対象部分（年800万円以下）")!;
    expect(reducedStep.amount).toBe(8_000_000);
    const standardStep = steps.find((s) => s.label === "基本税率の対象部分（年800万円超）")!;
    expect(standardStep.amount).toBe(500_000);

    const corporateTaxStep = steps.find((s) => s.label === "法人税額")!;
    expect(corporateTaxStep.amount).toBe(estimate.corporateTax);
  });

  it("does not add a standard-rate step when taxable income sits exactly at the 8,000,000 threshold", () => {
    const rows = [tx({ id: "1", amount: 8_000_000, taxCategory: "課税売上10%" })];
    const estimate = estimateForMicroCorp(rows);
    const steps = explainCorporateEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).not.toContain("基本税率の対象部分（年800万円超）");
  });

  it("reports a zero bracket-tax step and zero final amount for a loss-making (zero taxable income) case", () => {
    const rows = [
      tx({ id: "1", amount: 1_000_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -1_500_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    expect(estimate.taxableIncome).toBe(0);

    const steps = explainCorporateEstimateCalculation(estimate);

    const bracketStep = steps.find((s) => s.label === "税率区分ごとの法人税額")!;
    expect(bracketStep.amount).toBe(0);
    expect(bracketStep.detail).toBe("所得金額が0円のため、法人税額も0円です。");

    const finalStep = steps[steps.length - 1];
    expect(finalStep.amount).toBe(0);
    expect(finalStep.isFinal).toBe(true);
  });

  it("never claims a different final amount than estimate.totalNationalTax", () => {
    const rows = [
      tx({ id: "1", amount: 20_000_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: -3_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows);
    const steps = explainCorporateEstimateCalculation(estimate);
    expect(steps[steps.length - 1].amount).toBe(estimate.totalNationalTax);
  });

  // Regression: same issue as the individual explainer above (see that describe block's comment) —
  // without a dedicated step, "収益－費用" no longer explains estimate.taxableIncome once a
  // carryforward deduction has been applied, and the final tax figure would appear to come out of
  // nowhere relative to the narrated steps.
  it("includes 所得金額（繰越控除前） and 繰越欠損金の控除 steps, in order, when a loss-carryforward deduction is applied", () => {
    const rows = [
      tx({ id: "1", amount: 5_500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 2_200_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "3", amount: -1_100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows, {
      currentFiscalYear: 2026,
      priorLosses: [{ fiscalYear: 2025, remainingLoss: 2_000_000 }],
    });
    expect(estimate.lossCarryforward?.totalDeduction).toBe(2_000_000);

    const steps = explainCorporateEstimateCalculation(estimate);

    expect(steps.map((s) => s.label)).toEqual([
      "収益（益金）",
      "費用（損金）",
      "所得金額（繰越控除前）",
      "繰越欠損金の控除",
      "所得金額",
      "軽減税率の対象部分（年800万円以下）",
      "法人税額",
      "地方法人税",
      "法人税・地方法人税の合計額",
    ]);

    const beforeStep = steps.find((s) => s.label === "所得金額（繰越控除前）")!;
    expect(beforeStep.amount).toBe(estimate.lossCarryforward?.incomeBeforeCarryforward);

    const deductionStep = steps.find((s) => s.label === "繰越欠損金の控除")!;
    expect(deductionStep.amount).toBe(2_000_000);

    const afterStep = steps.find((s) => s.label === "所得金額")!;
    expect(afterStep.amount).toBe(estimate.taxableIncome);
  });

  it("omits the loss-carryforward steps when lossCarryforward is present but fully expired (zero deduction)", () => {
    const rows = [
      tx({ id: "1", amount: 5_500_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 2_200_000, account: "売上高", taxCategory: "課税売上10%" }),
      tx({ id: "3", amount: -1_100_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
    ];
    const estimate = estimateForMicroCorp(rows, {
      currentFiscalYear: 2026,
      priorLosses: [{ fiscalYear: 2015, remainingLoss: 1_000_000 }], // age = 11, past the 10-year window
    });
    expect(estimate.lossCarryforward?.totalDeduction).toBe(0);

    const steps = explainCorporateEstimateCalculation(estimate);
    expect(steps.map((s) => s.label)).not.toContain("所得金額（繰越控除前）");
    expect(steps.map((s) => s.label)).not.toContain("繰越欠損金の控除");
  });
});
