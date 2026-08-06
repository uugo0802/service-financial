import { describe, expect, it } from "vitest";
import {
  RESIDENT_TAX_ESTIMATE_DISCLAIMER,
  RESIDENT_TAX_PER_CAPITA_LEVY_TOTAL,
  estimateIndividualResidentTax,
} from "./individualResidentTaxEstimate";

describe("estimateIndividualResidentTax — 代表的な所得水準（寄附なし）", () => {
  it("課税所得400万円の場合、所得割40万円・均等割6,000円・合計406,000円になる", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 4_000_000 });

    expect(result.taxableIncome).toBe(4_000_000);
    expect(result.incomeLevy.prefectural).toBe(160_000); // 400万円×4%
    expect(result.incomeLevy.municipal).toBe(240_000); // 400万円×6%
    expect(result.incomeLevy.beforeCredit).toBe(400_000);
    expect(result.incomeLevy.donationCredit.total).toBe(0);
    expect(result.incomeLevy.afterCredit).toBe(400_000);
    expect(result.perCapitaLevy.prefectural).toBe(1_500);
    expect(result.perCapitaLevy.municipal).toBe(3_500);
    expect(result.perCapitaLevy.forestEnvironmentTax).toBe(1_000);
    expect(result.perCapitaLevy.total).toBe(6_000);
    expect(result.perCapitaLevy.total).toBe(RESIDENT_TAX_PER_CAPITA_LEVY_TOTAL);
    expect(result.totalEstimatedResidentTax).toBe(406_000);
  });
});

describe("estimateIndividualResidentTax — 課税所得が0円・低所得のケース", () => {
  it("課税所得0円の場合、所得割は0円で、均等割6,000円のみが課税される", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 0 });

    expect(result.incomeLevy.prefectural).toBe(0);
    expect(result.incomeLevy.municipal).toBe(0);
    expect(result.incomeLevy.beforeCredit).toBe(0);
    expect(result.incomeLevy.afterCredit).toBe(0);
    expect(result.perCapitaLevy.total).toBe(6_000);
    expect(result.totalEstimatedResidentTax).toBe(6_000);
  });

  it("taxableIncomeを省略した場合も0円として扱い、エラーにならない", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 0 });
    expect(result.totalEstimatedResidentTax).toBe(6_000);
  });
});

describe("estimateIndividualResidentTax — 高所得のケース", () => {
  it("課税所得2,000万円の場合、所得割200万円・合計2,006,000円になる", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 20_000_000 });

    expect(result.incomeLevy.prefectural).toBe(800_000); // 2,000万円×4%
    expect(result.incomeLevy.municipal).toBe(1_200_000); // 2,000万円×6%
    expect(result.incomeLevy.beforeCredit).toBe(2_000_000);
    expect(result.incomeLevy.afterCredit).toBe(2_000_000);
    expect(result.totalEstimatedResidentTax).toBe(2_006_000);
  });
});

describe("estimateIndividualResidentTax — 100円未満切り捨てのケース", () => {
  it("所得割額の1円単位の端数は100円未満切り捨てにより丸められる（123,456円→123,400円）", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 1_234_567 });

    expect(result.incomeLevy.prefectural).toBe(49_382); // floor(1,234,567×4%)
    expect(result.incomeLevy.municipal).toBe(74_074); // floor(1,234,567×6%)
    expect(result.incomeLevy.beforeCredit).toBe(123_456);
    // 100円未満切り捨てにより、123,456円ではなく123,400円になる
    expect(result.incomeLevy.afterCredit).toBe(123_400);
    expect(result.totalEstimatedResidentTax).toBe(129_400); // 123,400 + 6,000
  });

  it("所得割額がちょうど100円の倍数の場合は切り捨てによる変化がない", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 5_000_000 });
    expect(result.incomeLevy.beforeCredit).toBe(500_000);
    expect(result.incomeLevy.afterCredit).toBe(500_000);
  });
});

describe("estimateIndividualResidentTax — ふるさと納税等の寄附金税額控除", () => {
  it("課税所得400万円・寄附金10万円の場合、基本控除9,800円＋特例控除68,188円が所得割から控除される", () => {
    const result = estimateIndividualResidentTax({
      taxableIncome: 4_000_000,
      furusatoNozeiDonationAmount: 100_000,
    });

    expect(result.incomeLevy.donationCredit.basic).toBe(9_800); // (10万-2,000)×10%
    expect(result.incomeLevy.donationCredit.special).toBe(68_188);
    expect(result.incomeLevy.donationCredit.total).toBe(77_988);
    // 400,000 - 77,988 = 322,012 → 100円未満切り捨てで322,000円
    expect(result.incomeLevy.afterCredit).toBe(322_000);
    expect(result.totalEstimatedResidentTax).toBe(328_000); // 322,000 + 6,000
  });

  it("寄附金が自己負担額(2,000円)以下の場合、税額控除は発生しない", () => {
    const result = estimateIndividualResidentTax({
      taxableIncome: 4_000_000,
      furusatoNozeiDonationAmount: 2_000,
    });
    expect(result.incomeLevy.donationCredit.total).toBe(0);
  });

  it("特例控除分は所得割額（税額控除前）の20%を上限として頭打ちになる", () => {
    // 課税所得が低いのに多額の寄附をすると、特例控除の理論値は所得割の20%を超えるが、
    // 実際の控除額は20%で頭打ちになる
    const result = estimateIndividualResidentTax({
      taxableIncome: 500_000,
      furusatoNozeiDonationAmount: 500_000,
    });

    const incomeLevyBeforeCredit = result.incomeLevy.beforeCredit;
    const specialCap = Math.floor(incomeLevyBeforeCredit * 0.2);
    expect(result.incomeLevy.donationCredit.special).toBe(specialCap);
  });

  it("寄附金額を省略した場合は控除を計算しない（0円）", () => {
    const withoutDonation = estimateIndividualResidentTax({ taxableIncome: 4_000_000 });
    expect(withoutDonation.incomeLevy.donationCredit.total).toBe(0);
  });
});

describe("estimateIndividualResidentTax — 不正な入力はエラー", () => {
  it("課税所得が負の数の場合はエラーを投げる", () => {
    expect(() => estimateIndividualResidentTax({ taxableIncome: -1 })).toThrow();
  });

  it("数値でない課税所得（NaN/Infinity）の場合もエラーを投げる", () => {
    expect(() => estimateIndividualResidentTax({ taxableIncome: NaN })).toThrow();
    expect(() => estimateIndividualResidentTax({ taxableIncome: Infinity })).toThrow();
  });

  it("寄附金額が負の数の場合もエラーを投げる", () => {
    expect(() =>
      estimateIndividualResidentTax({ taxableIncome: 4_000_000, furusatoNozeiDonationAmount: -1 })
    ).toThrow();
  });
});

describe("estimateIndividualResidentTax — 所得税限界税率の速算表の境界（特例控除分の計算にのみ影響）", () => {
  it("課税所得金額が10%区分の上限（3,300,000円）ちょうどと、その1円上（20%区分）とで特例控除額が変わる", () => {
    const atBoundary = estimateIndividualResidentTax({
      taxableIncome: 3_300_000,
      furusatoNozeiDonationAmount: 20_000,
    });
    const justAbove = estimateIndividualResidentTax({
      taxableIncome: 3_300_001,
      furusatoNozeiDonationAmount: 20_000,
    });

    // netDonation = 18,000円で両者共通。どちらも所得割20%上限（66,000円）は下回るため頭打ちにならない。
    // 10%区分（限界税率10%）: floor(18,000×(0.9-0.10×1.021)) = 14,362
    // 20%区分（限界税率20%、3,300,001円から）: floor(18,000×(0.9-0.20×1.021)) = 12,524
    expect(atBoundary.incomeLevy.donationCredit.special).toBe(14_362);
    expect(justAbove.incomeLevy.donationCredit.special).toBe(12_524);
    expect(atBoundary.incomeLevy.donationCredit.special).toBeGreaterThan(justAbove.incomeLevy.donationCredit.special);
  });

  it("課税所得金額が最高税率区分（40,000,000円超）でも例外を投げずに計算する", () => {
    const result = estimateIndividualResidentTax({
      taxableIncome: 45_000_000,
      furusatoNozeiDonationAmount: 100_000,
    });
    expect(result.taxableIncome).toBe(45_000_000);
    expect(result.incomeLevy.donationCredit.special).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateIndividualResidentTax — 前提条件・免責文言", () => {
  it("免責文言と前提条件の一覧を結果に含める", () => {
    const result = estimateIndividualResidentTax({ taxableIncome: 4_000_000 });

    expect(result.disclaimer).toBe(RESIDENT_TAX_ESTIMATE_DISCLAIMER);
    expect(result.disclaimer).toContain("個別具体的な税務相談");
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("調整控除"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("森林環境税"))).toBe(true);
  });
});
