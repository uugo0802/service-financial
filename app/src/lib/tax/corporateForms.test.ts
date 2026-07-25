import { describe, expect, it } from "vitest";
import { buildCorporateTaxForm, buildFinancialStatements } from "./corporateForms";
import { CorporateEstimate } from "./corporateEstimate";
import { ProfitLossStatement } from "./plStatement";

function estimate(overrides: Partial<CorporateEstimate>): CorporateEstimate {
  return {
    revenue: 0,
    expenses: 0,
    taxableIncome: 0,
    corporateTax: 0,
    localCorporateTax: 0,
    perCapitaTaxReference: 70000,
    totalNationalTax: 0,
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

function pl(overrides: Partial<ProfitLossStatement>): ProfitLossStatement {
  return {
    incomeLines: [],
    incomeTotal: 0,
    expenseLines: [],
    expenseTotal: 0,
    profit: 0,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    ...overrides,
  };
}

describe("buildCorporateTaxForm", () => {
  it("taxes all income at the 15% reduced rate when below the ¥8,000,000 threshold", () => {
    const form = buildCorporateTaxForm(estimate({ taxableIncome: 5_000_000 }));

    expect(form.line1_income).toBe(5_000_000);
    expect(form.line45_reducedBase).toBe(5_000_000);
    expect(form.line47_excessBase).toBe(0);
    expect(form.line48_reducedTax).toBe(750_000); // 5,000,000 * 0.15
    expect(form.line50_excessTax).toBe(0);
    expect(form.line2_corporateTax).toBe(750_000);
    expect(form.line9_corporateTaxTotal).toBe(750_000);
    expect(form.line13_netCorporateTax).toBe(750_000);
    expect(form.line15_finalCorporateTax).toBe(750_000);
    expect(form.line28_localTaxBase).toBe(750_000);
    expect(form.line31_localCorporateTax).toBe(77_250); // 750,000 * 0.103
    expect(form.line38_netLocalCorporateTax).toBe(77_250);
    expect(form.line40_finalLocalCorporateTax).toBe(77_250);
    expect(form.totalNationalTax).toBe(827_250); // 750,000 + 77,250
  });

  it("splits income straddling the threshold between the 15% and 23.2% rates", () => {
    const form = buildCorporateTaxForm(estimate({ taxableIncome: 10_000_000 }));

    expect(form.line45_reducedBase).toBe(8_000_000);
    expect(form.line47_excessBase).toBe(2_000_000);
    expect(form.line48_reducedTax).toBe(1_200_000); // 8,000,000 * 0.15
    expect(form.line50_excessTax).toBe(464_000); // 2,000,000 * 0.232
    expect(form.line2_corporateTax).toBe(1_664_000);
    expect(form.line28_localTaxBase).toBe(1_664_000);
    expect(form.line31_localCorporateTax).toBe(171_392); // 1,664,000 * 0.103
    expect(form.totalNationalTax).toBe(1_835_392); // 1,664,000 + 171,392
  });

  it("treats income exactly at ¥8,000,000 as entirely within the reduced-rate base", () => {
    const form = buildCorporateTaxForm(estimate({ taxableIncome: 8_000_000 }));

    expect(form.line45_reducedBase).toBe(8_000_000);
    expect(form.line47_excessBase).toBe(0);
    expect(form.line50_excessTax).toBe(0);
    expect(form.line2_corporateTax).toBe(1_200_000); // 8,000,000 * 0.15
  });

  it("returns all zeros for zero taxable income", () => {
    const form = buildCorporateTaxForm(estimate({ taxableIncome: 0 }));

    expect(form.line2_corporateTax).toBe(0);
    expect(form.line31_localCorporateTax).toBe(0);
    expect(form.totalNationalTax).toBe(0);
  });
});

describe("buildFinancialStatements", () => {
  it("computes netIncome as incomeBeforeTax minus taxes", () => {
    const statement = pl({
      incomeLines: [
        { account: "売上高", amount: 1_000_000 },
        { account: "受取利息", amount: 5_000 },
      ],
      incomeTotal: 1_005_000,
      expenseLines: [
        { account: "地代家賃", amount: 300_000 },
        { account: "雑損失", amount: 2_000 },
      ],
      expenseTotal: 302_000,
      profit: 703_000,
    });
    const taxForm = buildCorporateTaxForm(estimate({ taxableIncome: 5_000_000 }));

    const result = buildFinancialStatements(statement, taxForm, "テスト株式会社");

    expect(result.nonOperatingIncome).toBe(5_000); // 受取利息
    expect(result.nonOperatingExpense).toBe(2_000); // 雑損失
    expect(result.operatingIncome).toBe(700_000); // (1,005,000-5,000) - (302,000-2,000)
    expect(result.ordinaryIncome).toBe(703_000); // 700,000 + 5,000 - 2,000
    expect(result.incomeBeforeTax).toBe(703_000);
    expect(result.taxes).toBe(taxForm.totalNationalTax);
    expect(result.netIncome).toBe(result.incomeBeforeTax - result.taxes);
    expect(result.companyName).toBe("テスト株式会社");
    expect(result.periodStart).toBe(statement.periodStart);
    expect(result.periodEnd).toBe(statement.periodEnd);
  });

  it("adds localTaxTotal into taxes and reflects it in netIncome", () => {
    const statement = pl({
      incomeLines: [{ account: "売上高", amount: 500_000 }],
      incomeTotal: 500_000,
      expenseLines: [],
      expenseTotal: 0,
      profit: 500_000,
    });
    const taxForm = buildCorporateTaxForm(estimate({ taxableIncome: 500_000 }));
    const localTaxTotal = 70_000;

    const result = buildFinancialStatements(statement, taxForm, "テスト株式会社", localTaxTotal);

    expect(result.taxes).toBe(taxForm.totalNationalTax + localTaxTotal);
    expect(result.netIncome).toBe(result.incomeBeforeTax - result.taxes);
  });

  it("treats income and expense lines without matching account names as purely operating", () => {
    const statement = pl({
      incomeLines: [{ account: "売上高", amount: 200_000 }],
      incomeTotal: 200_000,
      expenseLines: [{ account: "通信費", amount: 10_000 }],
      expenseTotal: 10_000,
      profit: 190_000,
    });
    const taxForm = buildCorporateTaxForm(estimate({ taxableIncome: 190_000 }));

    const result = buildFinancialStatements(statement, taxForm, "テスト株式会社");

    expect(result.nonOperatingIncome).toBe(0);
    expect(result.nonOperatingExpense).toBe(0);
    expect(result.operatingIncome).toBe(190_000);
    expect(result.ordinaryIncome).toBe(190_000);
    expect(result.incomeBeforeTax).toBe(190_000);
  });
});
