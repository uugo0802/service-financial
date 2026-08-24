import { describe, expect, it } from "vitest";
import {
  IDECO_SOLE_PROPRIETOR_ANNUAL_CAP,
  PENSION_SAVINGS_SIMULATOR_DISCLAIMER,
  SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP,
  simulatePensionSavings,
} from "./pensionSavingsSimulator";

describe("simulatePensionSavings — 各ブラケット境界での所得税額・限界税率", () => {
  it.each([
    { upTo: 1_950_000, ratePercent: 5, tax: 97_500 },
    { upTo: 3_300_000, ratePercent: 10, tax: 232_500 },
    { upTo: 6_950_000, ratePercent: 20, tax: 962_500 },
    { upTo: 9_000_000, ratePercent: 23, tax: 1_434_000 },
    { upTo: 18_000_000, ratePercent: 33, tax: 4_404_000 },
    { upTo: 40_000_000, ratePercent: 40, tax: 13_204_000 },
  ])(
    "課税所得が境界値ちょうど$upToのとき、限界税率$ratePercent%・所得税額$tax円になる",
    ({ upTo, ratePercent, tax }) => {
      const result = simulatePensionSavings({
        taxableIncomeBeforeDeduction: upTo,
        smallBusinessMutualAidAnnualContribution: 0,
        idecoAnnualContribution: 0,
      });

      expect(result.marginalBracket.ratePercent).toBe(ratePercent);
      expect(result.incomeTaxBefore).toBe(tax);
      expect(result.incomeTaxAfter).toBe(tax);
      expect(result.incomeTaxReduction).toBe(0);
    }
  );

  it("最上位ブラケット（4,000万円超）は税率45%になる", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 40_000_001,
      smallBusinessMutualAidAnnualContribution: 0,
      idecoAnnualContribution: 0,
    });

    expect(result.marginalBracket.ratePercent).toBe(45);
    expect(result.incomeTaxBefore).toBe(13_204_000);
  });
});

describe("simulatePensionSavings — 拠出額が0円の場合", () => {
  it("所得税・住民税の減少額はいずれも0で、控除前後の課税所得・税額は変わらない", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 5_000_000,
      smallBusinessMutualAidAnnualContribution: 0,
      idecoAnnualContribution: 0,
    });

    expect(result.deductibleContribution.total).toBe(0);
    expect(result.taxableIncomeAfterDeduction).toBe(5_000_000);
    expect(result.incomeTaxAfter).toBe(result.incomeTaxBefore);
    expect(result.incomeTaxReduction).toBe(0);
    expect(result.residentTaxReduction).toBe(0);
    expect(result.totalTaxReduction).toBe(0);
    expect(result.effectiveDiscountRate).toBe(0);
    expect(result.capWarnings).toHaveLength(0);
  });
});

describe("simulatePensionSavings — ブラケット跨ぎのケース", () => {
  it("拠出により課税所得が20%→10%ブラケットへ跨いで下がる場合、正しく差分で減少額を計算する", () => {
    // 控除前 2,000,000円（10%ブラケット、速算控除97,500円）→ 所得税102,500円
    // 控除後 1,900,000円（5%ブラケット、速算控除0円）→ 所得税95,000円
    // 単純に「拠出額×拠出前の限界税率(10%)」で計算すると10,000円になってしまうが、
    // 実際のブラケット跨ぎを反映した正しい減少額は7,500円になるはず。
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 2_000_000,
      smallBusinessMutualAidAnnualContribution: 100_000,
      idecoAnnualContribution: 0,
    });

    expect(result.marginalBracket.ratePercent).toBe(10);
    expect(result.incomeTaxBefore).toBe(102_500);
    expect(result.taxableIncomeAfterDeduction).toBe(1_900_000);
    expect(result.incomeTaxAfter).toBe(95_000);
    expect(result.incomeTaxReduction).toBe(7_500);
    // 単純な「拠出額×拠出前の限界税率」との差分であることを明示的に確認する
    expect(result.incomeTaxReduction).not.toBe(100_000 * 0.1);

    expect(result.residentTaxReduction).toBe(10_000);
    expect(result.totalTaxReduction).toBe(17_500);
    expect(result.effectiveDiscountRate).toBeCloseTo(17_500 / 100_000, 10);
  });
});

describe("simulatePensionSavings — 法定上限を超える拠出額のケース", () => {
  it("小規模企業共済の拠出額が上限を超える場合、控除対象額を上限でキャップし警告を出す", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 8_000_000,
      smallBusinessMutualAidAnnualContribution: 1_000_000, // 上限840,000円を超える入力
      idecoAnnualContribution: 0,
    });

    expect(result.requestedContribution.smallBusinessMutualAid).toBe(1_000_000);
    expect(result.deductibleContribution.smallBusinessMutualAid).toBe(SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP);
    expect(result.deductibleContribution.total).toBe(840_000);
    expect(result.capWarnings.length).toBeGreaterThan(0);
    expect(result.capWarnings[0]).toContain("小規模企業共済");

    expect(result.taxableIncomeAfterDeduction).toBe(8_000_000 - 840_000);
    expect(result.incomeTaxBefore).toBe(1_204_000);
    expect(result.incomeTaxAfter).toBe(1_010_800);
    expect(result.incomeTaxReduction).toBe(193_200);
    expect(result.residentTaxReduction).toBe(84_000);
    expect(result.totalTaxReduction).toBe(277_200);
    // 実質割引率は「実際に支払う拠出額(requestedContribution.total)」に対する割合
    expect(result.effectiveDiscountRate).toBeCloseTo(277_200 / 1_000_000, 10);
  });

  it("iDeCoの拠出額が上限を超える場合も同様に控除対象額をキャップし警告を出す", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 5_000_000,
      smallBusinessMutualAidAnnualContribution: 0,
      idecoAnnualContribution: 1_000_000, // 上限816,000円を超える入力
    });

    expect(result.deductibleContribution.ideco).toBe(IDECO_SOLE_PROPRIETOR_ANNUAL_CAP);
    expect(result.deductibleContribution.total).toBe(816_000);
    expect(result.capWarnings.some((w) => w.includes("iDeCo"))).toBe(true);
  });

  it("両方の拠出額が上限内であれば警告は出ない", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 5_000_000,
      smallBusinessMutualAidAnnualContribution: 400_000,
      idecoAnnualContribution: 200_000,
    });

    expect(result.capWarnings).toHaveLength(0);
    expect(result.deductibleContribution.smallBusinessMutualAid).toBe(400_000);
    expect(result.deductibleContribution.ideco).toBe(200_000);
    expect(result.deductibleContribution.total).toBe(600_000);
  });
});

describe("simulatePensionSavings — 入力バリデーション", () => {
  it("課税所得や掛金額が負の数の場合はエラーを投げる", () => {
    expect(() =>
      simulatePensionSavings({
        taxableIncomeBeforeDeduction: -1,
        smallBusinessMutualAidAnnualContribution: 0,
        idecoAnnualContribution: 0,
      })
    ).toThrow();

    expect(() =>
      simulatePensionSavings({
        taxableIncomeBeforeDeduction: 5_000_000,
        smallBusinessMutualAidAnnualContribution: -1,
        idecoAnnualContribution: 0,
      })
    ).toThrow();
  });

  it("数値でない入力（NaN/Infinity）の場合もエラーを投げる", () => {
    expect(() =>
      simulatePensionSavings({
        taxableIncomeBeforeDeduction: NaN,
        smallBusinessMutualAidAnnualContribution: 0,
        idecoAnnualContribution: 0,
      })
    ).toThrow();
  });
});

describe("simulatePensionSavings — 参考値・免責文言", () => {
  it("法定上限の参考値と免責文言を結果に含める", () => {
    const result = simulatePensionSavings({
      taxableIncomeBeforeDeduction: 5_000_000,
      smallBusinessMutualAidAnnualContribution: 0,
      idecoAnnualContribution: 0,
    });

    expect(result.caps.smallBusinessMutualAid).toBe(SMALL_BUSINESS_MUTUAL_AID_ANNUAL_CAP);
    expect(result.caps.ideco).toBe(IDECO_SOLE_PROPRIETOR_ANNUAL_CAP);
    expect(result.disclaimer).toBe(PENSION_SAVINGS_SIMULATOR_DISCLAIMER);
    expect(result.disclaimer).toContain("個別具体的な税務相談");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });
});
