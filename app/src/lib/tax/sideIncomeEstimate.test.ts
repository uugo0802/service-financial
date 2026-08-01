import { describe, expect, it } from "vitest";
import {
  calcEmploymentIncomeDeduction,
  calcSalaryIncome,
  estimateCombinedSalaryAndBusinessIncomeTax,
} from "./sideIncomeEstimate";

describe("calcEmploymentIncomeDeduction (給与所得控除、令和2年分以降の速算表)", () => {
  it("boundary: exactly at the ¥1,625,000 bracket edge returns the flat ¥550,000 deduction", () => {
    // 国税庁の速算表: 収入金額1,625,000円以下は一律55万円
    expect(calcEmploymentIncomeDeduction(1_625_000)).toBe(550_000);
  });

  it("boundary: just above ¥1,625,000 switches to the next bracket's formula (収入×40%-10万円)", () => {
    // 1,625,001 * 0.4 - 100,000 = 550,000.4 -> 円未満切り捨てで550,000円
    expect(calcEmploymentIncomeDeduction(1_625_001)).toBe(550_000);
    // 1,700,000 * 0.4 - 100,000 = 580,000
    expect(calcEmploymentIncomeDeduction(1_700_000)).toBe(580_000);
  });

  it("is continuous across the ¥1,800,000 / ¥3,600,000 / ¥6,600,000 bracket boundaries", () => {
    expect(calcEmploymentIncomeDeduction(1_800_000)).toBe(620_000); // 1,800,000*0.4-100,000
    expect(calcEmploymentIncomeDeduction(3_600_000)).toBe(1_160_000); // 3,600,000*0.3+80,000
    expect(calcEmploymentIncomeDeduction(6_600_000)).toBe(1_760_000); // 6,600,000*0.2+440,000
  });

  it("caps the deduction at ¥1,950,000 once salary revenue exceeds ¥8,500,000", () => {
    expect(calcEmploymentIncomeDeduction(8_500_000)).toBe(1_950_000); // 8,500,000*0.1+1,100,000
    expect(calcEmploymentIncomeDeduction(10_000_000)).toBe(1_950_000);
    expect(calcEmploymentIncomeDeduction(50_000_000)).toBe(1_950_000);
  });

  it("returns 0 for non-positive revenue", () => {
    expect(calcEmploymentIncomeDeduction(0)).toBe(0);
    expect(calcEmploymentIncomeDeduction(-100)).toBe(0);
  });
});

describe("calcSalaryIncome", () => {
  it("computes salary income as revenue minus the employment income deduction", () => {
    const result = calcSalaryIncome(4_000_000);
    // 給与所得控除: 4,000,000 * 0.2 + 440,000 = 1,240,000
    expect(result.employmentIncomeDeduction).toBe(1_240_000);
    expect(result.salaryIncome).toBe(2_760_000);
  });

  it("never goes below 0 even for very small revenue", () => {
    const result = calcSalaryIncome(300_000);
    expect(result.salaryIncome).toBe(0);
  });
});

describe("estimateCombinedSalaryAndBusinessIncomeTax", () => {
  it("salary-only case (business profit = 0) matches a plain 給与所得のみ の所得税概算", () => {
    // 給与収入500万円、副業なし
    const result = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 5_000_000,
      businessProfit: 0,
    });

    // 給与所得控除: 5,000,000*0.2+440,000 = 1,440,000
    expect(result.employmentIncomeDeduction).toBe(1_440_000);
    // 給与所得: 5,000,000 - 1,440,000 = 3,560,000
    expect(result.salaryIncome).toBe(3_560_000);
    expect(result.businessProfit).toBe(0);
    expect(result.totalIncome).toBe(3_560_000);
    // 課税所得: 3,560,000 - 480,000(基礎控除) = 3,080,000（1,000円未満切り捨て済み）
    expect(result.taxableIncome).toBe(3_080_000);
    // 速算表: 3,080,000*10%-97,500 = 210,500
    expect(result.incomeTax).toEqual({ tax: 210_500, marginalRate: 10 });
    expect(result.reconstructionSurtax).toBe(Math.floor(210_500 * 0.021));
    expect(result.totalIncomeTax).toBe(result.incomeTax.tax + result.reconstructionSurtax);
  });

  it("business-only case (salary revenue = 0) matches an estimate with no salary income", () => {
    // 給与収入なし、事業所得（副業の利益）400万円のみ
    const result = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 0,
      businessProfit: 4_000_000,
    });

    expect(result.employmentIncomeDeduction).toBe(0);
    expect(result.salaryIncome).toBe(0);
    expect(result.businessProfit).toBe(4_000_000);
    expect(result.totalIncome).toBe(4_000_000);
    // 課税所得: 4,000,000 - 480,000 = 3,520,000
    expect(result.taxableIncome).toBe(3_520_000);
    // 速算表: 3,520,000*20%-427,500 = 276,500
    expect(result.incomeTax).toEqual({ tax: 276_500, marginalRate: 20 });
  });

  it("combines salary and business income (総合課税) into a single progressive-rate calculation", () => {
    // 給与収入600万円（本業） + 事業所得150万円（副業）のケース
    const result = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 6_000_000,
      businessProfit: 1_500_000,
    });

    // 給与所得控除: 6,000,000*0.2+440,000 = 1,640,000 -> 給与所得 4,360,000
    expect(result.employmentIncomeDeduction).toBe(1_640_000);
    expect(result.salaryIncome).toBe(4_360_000);
    // 合計所得金額: 4,360,000(給与) + 1,500,000(事業) = 5,860,000
    expect(result.totalIncome).toBe(5_860_000);
    // 課税所得: 5,860,000 - 480,000 = 5,380,000
    expect(result.taxableIncome).toBe(5_380_000);
    // 速算表: 5,380,000*20%-427,500 = 648,500
    expect(result.incomeTax).toEqual({ tax: 648_500, marginalRate: 20 });
    expect(result.reconstructionSurtax).toBe(Math.floor(648_500 * 0.021));
    expect(result.totalIncomeTax).toBe(648_500 + Math.floor(648_500 * 0.021));

    // 合算課税であることの確認: 事業所得の追加分だけ課税所得金額・税額が増えている
    // （給与のみのケースと比べて、単純な合計以上に税率区分が上がりうる）
    const salaryOnly = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 6_000_000,
      businessProfit: 0,
    });
    expect(result.totalIncomeTax).toBeGreaterThan(salaryOnly.totalIncomeTax);
  });

  it("carries forward a business loss (赤字) via loss offsetting against salary income", () => {
    const result = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 5_000_000,
      businessProfit: -500_000,
    });

    expect(result.salaryIncome).toBe(3_560_000); // 5,000,000 - 1,440,000
    expect(result.totalIncome).toBe(3_060_000); // 3,560,000 - 500,000
    expect(result.taxableIncome).toBe(2_580_000); // 3,060,000 - 480,000
  });

  it("floors taxable income at 0 when deductions exceed total income", () => {
    const result = estimateCombinedSalaryAndBusinessIncomeTax({
      salaryRevenue: 0,
      businessProfit: 100_000,
    });

    expect(result.taxableIncome).toBe(0);
    expect(result.incomeTax).toEqual({ tax: 0, marginalRate: 0 });
    expect(result.totalIncomeTax).toBe(0);
  });

  it("includes the standard disclaimer language recommending professional review", () => {
    const result = estimateCombinedSalaryAndBusinessIncomeTax({ salaryRevenue: 4_000_000, businessProfit: 1_000_000 });
    expect(result.assumptions.some((a) => a.includes("概算") && a.includes("税理士"))).toBe(true);
  });
});
