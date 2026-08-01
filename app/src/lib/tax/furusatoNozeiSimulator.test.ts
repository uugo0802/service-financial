import { describe, expect, it } from "vitest";
import {
  FURUSATO_NOZEI_SELF_PAY_AMOUNT,
  FURUSATO_NOZEI_SIMULATOR_DISCLAIMER,
  simulateFurusatoNozei,
} from "./furusatoNozeiSimulator";

describe("simulateFurusatoNozei — 代表的な所得水準（扶養なし）", () => {
  it("課税所得400万円・扶養なしの場合、20%ブラケット・寄附上限額118,412円になる", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 4_000_000 });

    expect(result.isApplicable).toBe(true);
    expect(result.marginalIncomeTaxBracket.ratePercent).toBe(20);
    expect(result.personalDeductionGapTotal).toBe(50_000); // 基礎控除差のみ
    expect(result.residentTaxTaxableIncomeApprox).toBe(4_050_000);
    expect(result.adjustmentDeductionApprox).toBe(0); // 200万円超のためgap(5万)-超過額でマイナス→0
    expect(result.residentTaxIncomeLevyApprox).toBe(405_000);
    expect(result.donationCeiling).toBe(118_412);
    expect(result.selfPayAmount).toBe(FURUSATO_NOZEI_SELF_PAY_AMOUNT);
  });

  it("課税所得800万円・扶養なしの場合、23%ブラケット・寄附上限額244,043円になる", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 8_000_000 });

    expect(result.marginalIncomeTaxBracket.ratePercent).toBe(23);
    expect(result.residentTaxIncomeLevyApprox).toBe(805_000);
    expect(result.donationCeiling).toBe(244_043);
  });

  it("課税所得2,000万円・扶養なしの場合、40%ブラケット・寄附上限額817,703円になる", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 20_000_000 });

    expect(result.marginalIncomeTaxBracket.ratePercent).toBe(40);
    expect(result.residentTaxIncomeLevyApprox).toBe(2_005_000);
    expect(result.donationCeiling).toBe(817_703);
  });
});

describe("simulateFurusatoNozei — 課税所得が0円・低所得のケース", () => {
  it("課税所得0円でも、寄附上限額の目安は自己負担額(2,000円)以上のわずかな金額になる", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 0 });

    expect(result.isApplicable).toBe(true);
    expect(result.marginalIncomeTaxBracket.ratePercent).toBe(5);
    // 課税所得0円でも基礎控除の人的控除差(5万円)は住民税の課税所得に上乗せされるため、
    // 住民税所得割額はわずかに正の値になる
    expect(result.residentTaxTaxableIncomeApprox).toBe(50_000);
    expect(result.residentTaxIncomeLevyApprox).toBe(2_500);
    expect(result.donationCeiling).toBe(2_588);
    expect(result.donationCeiling).toBeGreaterThanOrEqual(FURUSATO_NOZEI_SELF_PAY_AMOUNT);
  });

  it("課税所得150万円（住民税課税所得が200万円以下の調整控除ブラケット）でも正しく計算する", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 1_500_000 });

    expect(result.residentTaxTaxableIncomeApprox).toBe(1_550_000);
    expect(result.adjustmentDeductionApprox).toBe(2_500); // min(5万,155万)×5%
    expect(result.residentTaxIncomeLevyApprox).toBe(152_500);
    expect(result.donationCeiling).toBe(37_926);
  });
});

describe("simulateFurusatoNozei — 負の課税所得はエラー", () => {
  it("課税所得が負の数の場合はエラーを投げる", () => {
    expect(() => simulateFurusatoNozei({ entityType: "individual", taxableIncome: -1 })).toThrow();
  });

  it("数値でない課税所得（NaN/Infinity）の場合もエラーを投げる", () => {
    expect(() => simulateFurusatoNozei({ entityType: "individual", taxableIncome: NaN })).toThrow();
    expect(() => simulateFurusatoNozei({ entityType: "individual", taxableIncome: Infinity })).toThrow();
  });

  it("扶養親族の人数が負の数・非整数の場合もエラーを投げる", () => {
    expect(() =>
      simulateFurusatoNozei({
        entityType: "individual",
        taxableIncome: 4_000_000,
        dependents: { generalDependentCount: -1 },
      })
    ).toThrow();

    expect(() =>
      simulateFurusatoNozei({
        entityType: "individual",
        taxableIncome: 4_000_000,
        dependents: { specifiedDependentCount: 1.5 },
      })
    ).toThrow();
  });
});

describe("simulateFurusatoNozei — 扶養親族・配偶者控除の人数バリエーション", () => {
  it("配偶者控除+一般扶養親族1人の場合、人的控除差が加算され上限額が上がる", () => {
    const base = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 4_000_000 });
    const withDependents = simulateFurusatoNozei({
      entityType: "individual",
      taxableIncome: 4_000_000,
      dependents: { hasSpouseDeduction: true, generalDependentCount: 1 },
    });

    expect(withDependents.personalDeductionGapTotal).toBe(150_000); // 基礎5万+配偶者5万+一般扶養5万
    expect(withDependents.residentTaxTaxableIncomeApprox).toBe(4_150_000);
    expect(withDependents.residentTaxIncomeLevyApprox).toBe(415_000);
    expect(withDependents.donationCeiling).toBe(121_287);
    expect(withDependents.donationCeiling).toBeGreaterThan(base.donationCeiling);
  });

  it("特定扶養親族1人（19〜22歳、控除差18万円）はさらに大きく上限額を押し上げる", () => {
    const result = simulateFurusatoNozei({
      entityType: "individual",
      taxableIncome: 4_000_000,
      dependents: { specifiedDependentCount: 1 },
    });

    expect(result.personalDeductionGapTotal).toBe(230_000); // 基礎5万+特定扶養18万
    expect(result.residentTaxTaxableIncomeApprox).toBe(4_230_000);
    expect(result.residentTaxIncomeLevyApprox).toBe(423_000);
    expect(result.donationCeiling).toBe(123_586);
  });

  it("扶養親族の人数を増やすほど、寄附上限額は単調に増加する", () => {
    const zero = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 5_000_000 });
    const one = simulateFurusatoNozei({
      entityType: "individual",
      taxableIncome: 5_000_000,
      dependents: { generalDependentCount: 1 },
    });
    const three = simulateFurusatoNozei({
      entityType: "individual",
      taxableIncome: 5_000_000,
      dependents: { generalDependentCount: 3 },
    });

    expect(one.donationCeiling).toBeGreaterThan(zero.donationCeiling);
    expect(three.donationCeiling).toBeGreaterThan(one.donationCeiling);
  });

  it("扶養親族等の入力を省略した場合は0人・配偶者控除なしとして扱う（基礎控除差のみ）", () => {
    const omitted = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 4_000_000 });
    const explicitZero = simulateFurusatoNozei({
      entityType: "individual",
      taxableIncome: 4_000_000,
      dependents: {
        hasSpouseDeduction: false,
        generalDependentCount: 0,
        specifiedDependentCount: 0,
        elderlyDependentCount: 0,
      },
    });

    expect(omitted.personalDeductionGapTotal).toBe(50_000);
    expect(omitted).toEqual(explicitZero);
  });
});

describe("simulateFurusatoNozei — 法人（entityType='corporation'）の場合", () => {
  it("個人版の特例控除制度は適用されないため、isApplicable=falseとなり金額は試算しない", () => {
    const result = simulateFurusatoNozei({ entityType: "corporation", taxableIncome: 4_000_000 });

    expect(result.isApplicable).toBe(false);
    expect(result.notApplicableReason).toBeDefined();
    expect(result.notApplicableReason).toContain("法人");
    expect(result.donationCeiling).toBe(0);
    expect(result.residentTaxIncomeLevyApprox).toBe(0);
  });

  it("taxableIncomeが未指定でも法人の場合はエラーにならない（試算をスキップするため）", () => {
    expect(() => simulateFurusatoNozei({ entityType: "corporation" })).not.toThrow();
  });
});

describe("simulateFurusatoNozei — 参考値・免責文言", () => {
  it("免責文言と前提条件の一覧を結果に含める", () => {
    const result = simulateFurusatoNozei({ entityType: "individual", taxableIncome: 5_000_000 });

    expect(result.disclaimer).toBe(FURUSATO_NOZEI_SIMULATOR_DISCLAIMER);
    expect(result.disclaimer).toContain("個別具体的な税務相談");
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("ワンストップ特例"))).toBe(true);
  });
});
