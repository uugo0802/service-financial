import { describe, expect, it } from "vitest";
import { buildForm5_2, Form5_2Inputs } from "./form5_2TaxPaymentStatus";
import { calculateProvisionalInterimTax } from "./corporateInterimTax";
import { buildCorporateTaxForm, buildFinancialStatements, buildIncomeAdjustmentForm } from "./corporateForms";
import { buildLocalCorporateTaxForm } from "./localCorporateTaxForm";
import { buildProfitLossStatement } from "./plStatement";
import { CorporateEstimate } from "./corporateEstimate";
import { CategorizedTransaction } from "../categorize/engine";

function baseInputs(overrides: Partial<Form5_2Inputs> = {}): Form5_2Inputs {
  return {
    interimTax: null,
    finalNationalTax: 500_000,
    finalPrefectureTax: 70_000,
    finalMunicipalityTax: 30_000,
    finalBusinessTax: 40_000,
    ...overrides,
  };
}

describe("buildForm5_2 - first-year case (no priorYearUnpaid, no interim tax)", () => {
  it("records only the confirmed-tax amounts, with closing unpaid equal to the current-period accrued amount, for every tax type", () => {
    const result = buildForm5_2(baseInputs());

    for (const row of [result.nationalTaxRow, result.prefectureTaxRow, result.municipalityTaxRow, result.businessTaxRow]) {
      expect(row.openingUnpaid).toBe(0);
      expect(row.interimAccrued).toBe(0);
      expect(row.interimPaidByDeduction).toBe(0);
      // 期末未納 = 期首未納(0) + 当期発生(中間0+確定) - 損金経理による納付(0) = 確定分と同額
      expect(row.closingUnpaid).toBe(row.finalAccrued);
    }

    expect(result.nationalTaxRow.finalAccrued).toBe(500_000);
    expect(result.nationalTaxRow.closingUnpaid).toBe(500_000);
    expect(result.prefectureTaxRow.closingUnpaid).toBe(70_000);
    expect(result.municipalityTaxRow.closingUnpaid).toBe(30_000);
    expect(result.businessTaxRow.closingUnpaid).toBe(40_000);
  });

  it("labels each tax type row per the four statutory categories", () => {
    const result = buildForm5_2(baseInputs());

    expect(result.nationalTaxRow.label).toBe("法人税及び地方法人税");
    expect(result.prefectureTaxRow.label).toBe("道府県民税");
    expect(result.municipalityTaxRow.label).toBe("市町村民税");
    expect(result.businessTaxRow.label).toBe("事業税及び特別法人事業税");
  });

  it("treats the tax provision as starting from zero, with the closing provision equal to the addition", () => {
    const result = buildForm5_2(baseInputs());

    expect(result.taxProvision.openingProvision).toBe(0);
    expect(result.taxProvision.withdrawal).toBe(0);
    expect(result.taxProvision.addition).toBe(500_000 + 70_000 + 30_000 + 40_000);
    expect(result.taxProvision.closingProvision).toBe(result.taxProvision.addition);
  });
});

describe("buildForm5_2 - second-year case with prior-year unpaid balances", () => {
  it("carries the prior-year unpaid amounts into openingUnpaid and rolls them into the opening tax provision", () => {
    const result = buildForm5_2(
      baseInputs({
        priorYearUnpaid: {
          nationalTax: 500_000,
          prefectureTax: 70_000,
          municipalityTax: 30_000,
          businessTax: 40_000,
        },
      })
    );

    expect(result.nationalTaxRow.openingUnpaid).toBe(500_000);
    expect(result.prefectureTaxRow.openingUnpaid).toBe(70_000);
    expect(result.municipalityTaxRow.openingUnpaid).toBe(30_000);
    expect(result.businessTaxRow.openingUnpaid).toBe(40_000);

    // 期首未納(前期確定分、中間納付なし) + 当期発生(確定分) = 期末未納
    expect(result.nationalTaxRow.closingUnpaid).toBe(500_000 + 500_000);

    expect(result.taxProvision.openingProvision).toBe(500_000 + 70_000 + 30_000 + 40_000);
    expect(result.taxProvision.closingProvision).toBe(
      result.taxProvision.openingProvision + result.taxProvision.addition
    );
  });
});

describe("buildForm5_2 - interim tax payment case (interimTax.required === true)", () => {
  it("zeroes out the interim portion of the closing unpaid balance for national tax, leaving only the confirmed portion unpaid", () => {
    const interimTax = calculateProvisionalInterimTax({
      corporateTax: 453_000,
      localCorporateTax: 46_600,
    });
    expect(interimTax.required).toBe(true);

    const result = buildForm5_2(baseInputs({ interimTax }));

    const expectedInterimAccrued = interimTax.corporateTaxPrepayment + interimTax.localCorporateTaxPrepayment;
    expect(result.nationalTaxRow.interimAccrued).toBe(expectedInterimAccrued);
    expect(result.nationalTaxRow.interimAccrued).toBeGreaterThan(0);
    // 中間分は全額納付済み扱い
    expect(result.nationalTaxRow.interimPaidByDeduction).toBe(expectedInterimAccrued);
    // 期末未納 = 期首未納(0) + 中間発生 + 確定発生 - 中間納付(=中間発生) = 確定発生のみ
    expect(result.nationalTaxRow.closingUnpaid).toBe(result.nationalTaxRow.finalAccrued);
    expect(result.nationalTaxRow.closingUnpaid).toBe(500_000);
  });

  it("does not apply an interim accrual to prefecture/municipality/business tax, which are out of scope and always zero", () => {
    const interimTax = calculateProvisionalInterimTax({
      corporateTax: 453_000,
      localCorporateTax: 46_600,
    });

    const result = buildForm5_2(baseInputs({ interimTax }));

    expect(result.prefectureTaxRow.interimAccrued).toBe(0);
    expect(result.municipalityTaxRow.interimAccrued).toBe(0);
    expect(result.businessTaxRow.interimAccrued).toBe(0);
  });

  it("does not accrue an interim amount when interimTax.required is false (prior-year corporate tax at/below the 200,000 yen threshold)", () => {
    const interimTax = calculateProvisionalInterimTax({
      corporateTax: 200_000,
      localCorporateTax: 20_000,
    });
    expect(interimTax.required).toBe(false);

    const result = buildForm5_2(baseInputs({ interimTax }));

    expect(result.nationalTaxRow.interimAccrued).toBe(0);
    expect(result.nationalTaxRow.interimPaidByDeduction).toBe(0);
    expect(result.nationalTaxRow.closingUnpaid).toBe(result.nationalTaxRow.finalAccrued);
  });

  it("treats a null interimTax (interim filing not applicable) the same as an unrequired one", () => {
    const result = buildForm5_2(baseInputs({ interimTax: null }));

    expect(result.nationalTaxRow.interimAccrued).toBe(0);
    expect(result.nationalTaxRow.interimPaidByDeduction).toBe(0);
  });
});

describe("buildForm5_2 - reconciliation with buildIncomeAdjustmentForm (別表四)", () => {
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

  function makeSampleRows(): CategorizedTransaction[] {
    return [
      tx({ id: "1", date: "2026-04-15", description: "売上入金", amount: 8_000_000, account: "売上高" }),
      tx({
        id: "2",
        date: "2026-05-10",
        description: "外注費支払",
        amount: -2_000_000,
        account: "外注費",
        taxCategory: "課税仕入10%",
      }),
      tx({
        id: "3",
        date: "2026-06-20",
        description: "地代家賃支払",
        amount: -600_000,
        account: "地代家賃",
        taxCategory: "課税仕入10%",
      }),
    ];
  }

  function makeEstimate(taxableIncome: number): CorporateEstimate {
    return {
      revenue: 8_000_000,
      expenses: 2_600_000,
      taxableIncome,
      corporateTax: 0,
      localCorporateTax: 0,
      perCapitaTaxReference: 70_000,
      totalNationalTax: 0,
      consumptionTax: { isLikelyExempt: true, salesTax: 0, purchaseTax: 0, payable: 0 },
      assumptions: [],
    };
  }

  it("matches fs.taxes (the '損金経理をした納税充当金' addition in 別表四) when the four tax-type final amounts are sourced the same way", () => {
    const rows = makeSampleRows();
    const pl = buildProfitLossStatement(rows);
    const estimate = makeEstimate(5_400_000);
    const taxForm = buildCorporateTaxForm(estimate);
    const localTaxForm = buildLocalCorporateTaxForm(estimate, taxForm);
    const fs = buildFinancialStatements(pl, taxForm, "テスト株式会社", localTaxForm.grandTotal);
    const incomeAdjustmentForm = buildIncomeAdjustmentForm(fs, taxForm);

    const result = buildForm5_2(
      baseInputs({
        finalNationalTax: taxForm.totalNationalTax,
        finalPrefectureTax: localTaxForm.inhabitantTaxTotal,
        finalMunicipalityTax: 0,
        finalBusinessTax: localTaxForm.businessTaxTotal,
      })
    );

    expect(result.taxProvision.addition).toBe(fs.taxes);
    expect(result.taxProvision.addition).toBe(incomeAdjustmentForm.additionLines[0].amount);
  });
});
