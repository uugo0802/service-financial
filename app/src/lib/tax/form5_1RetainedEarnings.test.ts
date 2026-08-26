import { describe, expect, it } from "vitest";
import { buildForm5_1, Form5_1Inputs } from "./form5_1RetainedEarnings";
import { buildEquityChangeForm } from "./equityChangeForm";
import { buildForm5_2, Form5_2Inputs } from "./form5_2TaxPaymentStatus";

function baseForm5_2Inputs(overrides: Partial<Form5_2Inputs> = {}): Form5_2Inputs {
  return {
    interimTax: null,
    finalNationalTax: 500_000,
    finalPrefectureTax: 70_000,
    finalMunicipalityTax: 30_000,
    finalBusinessTax: 40_000,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<Form5_1Inputs> = {}): Form5_1Inputs {
  const capitalStock = 1_000_000;
  const equityChange = buildEquityChangeForm({ capitalStock, openingCash: 3_000_000, netIncome: 750_000 });
  const form5_2 = buildForm5_2(baseForm5_2Inputs());

  return {
    equityChange,
    form5_2,
    capitalStock,
    ...overrides,
  };
}

describe("buildForm5_1 - first-year case (no prior-year unpaid balances)", () => {
  it("takes row25 繰越損益金 straight from equityChangeForm's retainedEarnings", () => {
    const inputs = baseInputs();
    const result = buildForm5_1(inputs);

    expect(result.retainedEarningsCarriedForward.openingBalance).toBe(inputs.equityChange.retainedEarnings.openingBalance);
    expect(result.retainedEarningsCarriedForward.change).toBe(inputs.equityChange.retainedEarnings.change);
    expect(result.retainedEarningsCarriedForward.closingBalance).toBe(inputs.equityChange.retainedEarnings.closingBalance);
  });

  it("takes row26 納税充当金 straight from form5_2's taxProvision", () => {
    const inputs = baseInputs();
    const result = buildForm5_1(inputs);

    expect(result.taxProvision.openingBalance).toBe(inputs.form5_2.taxProvision.openingProvision);
    expect(result.taxProvision.closingBalance).toBe(inputs.form5_2.taxProvision.closingProvision);
    expect(result.taxProvision.change).toBe(
      inputs.form5_2.taxProvision.closingProvision - inputs.form5_2.taxProvision.openingProvision
    );
  });

  it("records the three unpaid-tax rows as negative values mirroring form5_2's closingUnpaid (sign-flipped)", () => {
    const inputs = baseInputs();
    const result = buildForm5_1(inputs);

    expect(result.unpaidNationalTax.closingBalance).toBe(-inputs.form5_2.nationalTaxRow.closingUnpaid);
    expect(result.unpaidPrefectureTax.closingBalance).toBe(-inputs.form5_2.prefectureTaxRow.closingUnpaid);
    expect(result.unpaidMunicipalityTax.closingBalance).toBe(-inputs.form5_2.municipalityTaxRow.closingUnpaid);

    expect(result.unpaidNationalTax.closingBalance).toBeLessThanOrEqual(0);
    expect(result.unpaidPrefectureTax.closingBalance).toBeLessThanOrEqual(0);
    expect(result.unpaidMunicipalityTax.closingBalance).toBeLessThanOrEqual(0);

    // 初年度は期首未納0円なので、期首未納税額の行も0円（-0との符号違いを吸収するためtoBeCloseToで比較）
    expect(result.unpaidNationalTax.openingBalance).toBeCloseTo(0);
    expect(result.unpaidPrefectureTax.openingBalance).toBeCloseTo(0);
    expect(result.unpaidMunicipalityTax.openingBalance).toBeCloseTo(0);
  });

  it("computes row31 差引合計額 as 繰越損益金 + 納税充当金 + (未納3種のマイナス値の合計)", () => {
    const inputs = baseInputs();
    const result = buildForm5_1(inputs);

    const expectedClosing =
      result.retainedEarningsCarriedForward.closingBalance +
      result.taxProvision.closingBalance +
      result.unpaidNationalTax.closingBalance +
      result.unpaidPrefectureTax.closingBalance +
      result.unpaidMunicipalityTax.closingBalance;

    expect(result.retainedEarningsTotal.closingBalance).toBe(expectedClosing);

    const expectedOpening =
      result.retainedEarningsCarriedForward.openingBalance +
      result.taxProvision.openingBalance +
      result.unpaidNationalTax.openingBalance +
      result.unpaidPrefectureTax.openingBalance +
      result.unpaidMunicipalityTax.openingBalance;

    expect(result.retainedEarningsTotal.openingBalance).toBe(expectedOpening);
  });

  it("reproduces the real-form structure with concrete dummy amounts (差引合計額の整合性)", () => {
    // 期首: 繰越損益金2,000,000円・納税充当金0円・未納税額0円 → 差引合計額2,000,000円
    // 当期: 純利益750,000円、確定税額の合計 500,000+70,000+30,000+40,000=640,000円 が
    //       まるごと未納のまま期末を迎え、納税充当金も同額積み立てられる（初年度想定）。
    const inputs = baseInputs();
    const result = buildForm5_1(inputs);

    expect(result.retainedEarningsCarriedForward.openingBalance).toBe(2_000_000);
    expect(result.retainedEarningsCarriedForward.closingBalance).toBe(2_750_000);
    expect(result.taxProvision.closingBalance).toBe(640_000);
    expect(result.unpaidNationalTax.closingBalance).toBe(-500_000);
    expect(result.unpaidPrefectureTax.closingBalance).toBe(-70_000);
    expect(result.unpaidMunicipalityTax.closingBalance).toBe(-30_000);
    // 別表五（二）の事業税は別表五（一）の未納税額3種（法人税等・道府県民税・市町村民税）には含まれない
    // （事業税は損金算入されるため利益積立金額の直接の控除項目ではなく、対象外）。
    expect(result.retainedEarningsTotal.closingBalance).toBe(2_750_000 + 640_000 - 500_000 - 70_000 - 30_000);
    expect(result.retainedEarningsTotal.closingBalance).toBe(2_790_000);
  });
});

describe("buildForm5_1 - second-year case with prior-year unpaid balances", () => {
  it("carries prior-year unpaid amounts into openingBalance for the three unpaid-tax rows (negative)", () => {
    const form5_2 = buildForm5_2(
      baseForm5_2Inputs({
        priorYearUnpaid: {
          nationalTax: 500_000,
          prefectureTax: 70_000,
          municipalityTax: 30_000,
          businessTax: 40_000,
        },
      })
    );
    const inputs = baseInputs({ form5_2 });
    const result = buildForm5_1(inputs);

    expect(result.unpaidNationalTax.openingBalance).toBe(-500_000);
    expect(result.unpaidPrefectureTax.openingBalance).toBe(-70_000);
    expect(result.unpaidMunicipalityTax.openingBalance).toBe(-30_000);
    expect(result.taxProvision.openingBalance).toBe(500_000 + 70_000 + 30_000 + 40_000);
  });
});

describe("buildForm5_1 - Ⅱ 資本金等の額の計算", () => {
  it("keeps capitalStock unchanged across the period (opening === closing === inputs.capitalStock, no change)", () => {
    const inputs = baseInputs({ capitalStock: 3_000_000 });
    const result = buildForm5_1(inputs);

    expect(result.capitalStock.openingBalance).toBe(3_000_000);
    expect(result.capitalStock.change).toBe(0);
    expect(result.capitalStock.closingBalance).toBe(3_000_000);
  });

  it("always makes capitalTotal equal to capitalStock (opening, change, and closing)", () => {
    for (const capitalStock of [0, 1, 1_000_000, 50_000_000]) {
      const inputs = baseInputs({ capitalStock });
      const result = buildForm5_1(inputs);

      expect(result.capitalTotal.openingBalance).toBe(result.capitalStock.openingBalance);
      expect(result.capitalTotal.change).toBe(result.capitalStock.change);
      expect(result.capitalTotal.closingBalance).toBe(result.capitalStock.closingBalance);
      expect(result.capitalTotal.closingBalance).toBe(capitalStock);
    }
  });
});

describe("buildForm5_1 - reconciliation with buildForm5_2 (別表五（二）との整合性)", () => {
  it("keeps taxProvision and the three unpaid-tax rows tied to the same form5_2 result the tax-provision tab uses", () => {
    const form5_2 = buildForm5_2(
      baseForm5_2Inputs({
        finalNationalTax: 453_000,
        finalPrefectureTax: 45_300,
        finalMunicipalityTax: 22_650,
        finalBusinessTax: 15_855,
      })
    );
    const inputs = baseInputs({ form5_2 });
    const result = buildForm5_1(inputs);

    // 別表五（二）の期末納税充当金＝別表五（一）row26
    expect(result.taxProvision.closingBalance).toBe(form5_2.taxProvision.closingProvision);
    // 別表五（二）の各税目の期末現在未納税額（符号反転）＝別表五（一）row27/29/30
    expect(-result.unpaidNationalTax.closingBalance).toBe(form5_2.nationalTaxRow.closingUnpaid);
    expect(-result.unpaidPrefectureTax.closingBalance).toBe(form5_2.prefectureTaxRow.closingUnpaid);
    expect(-result.unpaidMunicipalityTax.closingBalance).toBe(form5_2.municipalityTaxRow.closingUnpaid);
  });

  it("keeps the tax-provision addition (which form5_2's own tests tie to 別表四's 損金経理をした納税充当金) flowing through unchanged into row26's change", () => {
    const form5_2 = buildForm5_2(baseForm5_2Inputs());
    const inputs = baseInputs({ form5_2 });
    const result = buildForm5_1(inputs);

    // withdrawal is always 0, so taxProvision.change === addition
    expect(result.taxProvision.change).toBe(form5_2.taxProvision.addition);
  });
});

describe("buildForm5_1 - handles a net loss (negative netIncome) without breaking the totals", () => {
  it("still reconciles row31 差引合計額 when 繰越損益金 decreases", () => {
    const capitalStock = 1_000_000;
    const equityChange = buildEquityChangeForm({ capitalStock, openingCash: 500_000, netIncome: -300_000 });
    const form5_2 = buildForm5_2(baseForm5_2Inputs({ finalNationalTax: 0, finalPrefectureTax: 70_000, finalMunicipalityTax: 30_000, finalBusinessTax: 0 }));
    const result = buildForm5_1({ equityChange, form5_2, capitalStock });

    expect(result.retainedEarningsCarriedForward.closingBalance).toBe(equityChange.retainedEarnings.closingBalance);
    const expectedClosing =
      result.retainedEarningsCarriedForward.closingBalance +
      result.taxProvision.closingBalance +
      result.unpaidNationalTax.closingBalance +
      result.unpaidPrefectureTax.closingBalance +
      result.unpaidMunicipalityTax.closingBalance;
    expect(result.retainedEarningsTotal.closingBalance).toBe(expectedClosing);
  });
});
