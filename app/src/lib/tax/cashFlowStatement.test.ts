import { describe, expect, it } from "vitest";
import {
  buildCashFlowStatement,
  sumFixedAssetAcquisitionsWithinPeriod,
  sumLoanNetChangeForPeriod,
} from "./cashFlowStatement";
import { Asset } from "./depreciation";
import { Loan } from "./loanAmortization";

const PERIOD = { start: "2026-01-01", end: "2026-12-31" };

describe("buildCashFlowStatement / 営業活動によるキャッシュ・フロー", () => {
  it("adds back depreciation and the increase in unpaid corporate/consumption taxes to net income", () => {
    const asset: Asset = {
      id: "a1",
      name: "什器備品",
      acquisitionDate: "2025-06-01",
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      method: "straight-line",
    };
    // 600,000 / 5年 = 年120,000円の定額償却。2026年は期首から期末まで丸々1年在籍しているため
    // 当期償却額は120,000円。

    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 1_000_000,
      unpaidCorporateTaxes: 200_000,
      unpaidConsumptionTax: 50_000,
      fixedAssets: [asset],
      loans: [],
      openingCash: 3_000_000,
      balanceSheetEndingCash: 3_000_000 + (1_000_000 + 120_000 + 200_000 + 50_000),
    });

    expect(cf.operating.lines).toEqual([
      { label: "当期純利益", amount: 1_000_000 },
      { label: "減価償却費", amount: 120_000 },
      { label: "未払法人税等の増減額", amount: 200_000 },
      { label: "未払消費税等の増減額", amount: 50_000 },
    ]);
    expect(cf.operating.subtotal).toBe(1_370_000);
  });

  it("does not add depreciation for a fixed asset that has not been acquired yet, and produces a zero operating cash flow when net income and unpaid taxes are all zero", () => {
    const futureAsset: Asset = {
      id: "a2",
      name: "翌期取得予定資産",
      acquisitionDate: "2027-01-01",
      acquisitionCost: 300_000,
      usefulLifeYears: 3,
      method: "straight-line",
    };

    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 0,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      fixedAssets: [futureAsset],
      loans: [],
      openingCash: 1_000_000,
      balanceSheetEndingCash: 1_000_000,
    });

    expect(cf.operating.subtotal).toBe(0);
    expect(cf.operating.lines[1]).toEqual({ label: "減価償却費", amount: 0 });
  });
});

describe("buildCashFlowStatement / 投資活動によるキャッシュ・フロー", () => {
  it("only includes fixed assets whose acquisitionDate falls within the fiscal period, as a negative amount", () => {
    const acquiredThisYear: Asset = {
      id: "a1",
      name: "当期取得PC",
      acquisitionDate: "2026-06-01",
      acquisitionCost: 300_000,
      usefulLifeYears: 4,
      method: "straight-line",
    };
    const acquiredLastYear: Asset = {
      id: "a2",
      name: "前期取得什器",
      acquisitionDate: "2025-06-01",
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      method: "straight-line",
    };
    const acquiredNextYear: Asset = {
      id: "a3",
      name: "翌期取得予定資産",
      acquisitionDate: "2027-01-01",
      acquisitionCost: 500_000,
      usefulLifeYears: 5,
      method: "straight-line",
    };

    expect(
      sumFixedAssetAcquisitionsWithinPeriod([acquiredThisYear, acquiredLastYear, acquiredNextYear], PERIOD)
    ).toBe(300_000);

    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 0,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      fixedAssets: [acquiredThisYear, acquiredLastYear, acquiredNextYear],
      loans: [],
      openingCash: 0,
      balanceSheetEndingCash: 0,
    });

    expect(cf.investing.lines).toEqual([{ label: "固定資産の取得による支出", amount: -300_000 }]);
    expect(cf.investing.subtotal).toBe(-300_000);
  });

  it("reports a zero investing cash flow when no fixed assets are provided", () => {
    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 0,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      fixedAssets: [],
      loans: [],
      openingCash: 0,
      balanceSheetEndingCash: 0,
    });

    expect(cf.investing.subtotal).toBe(0);
  });
});

describe("buildCashFlowStatement / 財務活動によるキャッシュ・フロー", () => {
  it("computes the net change in loan principal (closing balance minus opening balance) across all loans", () => {
    const loan: Loan = {
      id: "l1",
      name: "運転資金",
      principalAmount: 1_200_000,
      interestRate: 0.06,
      startDate: "2025-01-15",
      termMonths: 24,
      repaymentType: "equal-principal",
    };

    // l1: 元金均等・24回・月50,000円返済。2026-01-01時点(期首前日=2025-12-31)で11回返済済み
    // → 残高 1,200,000 - 550,000 = 650,000円。2026-12-31時点(期末)で23回返済済み
    // → 残高 1,200,000 - 1,150,000 = 50,000円。当期増減 = 50,000 - 650,000 = -600,000円
    const netChange = sumLoanNetChangeForPeriod([loan], PERIOD);
    expect(netChange).toBe(-600_000);

    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 0,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      fixedAssets: [],
      loans: [loan],
      openingCash: 0,
      balanceSheetEndingCash: 0,
    });

    expect(cf.financing.lines).toEqual([{ label: "借入金の増減額", amount: -600_000 }]);
    expect(cf.financing.subtotal).toBe(-600_000);
  });

  it("reports a zero financing cash flow when no loans are provided", () => {
    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 0,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      fixedAssets: [],
      loans: [],
      openingCash: 0,
      balanceSheetEndingCash: 0,
    });

    expect(cf.financing.subtotal).toBe(0);
  });

  it("reflects a new loan taken out during the period as a positive financing cash flow", () => {
    const newLoan: Loan = {
      id: "l2",
      name: "設備資金",
      principalAmount: 1_000_000,
      interestRate: 0.02,
      startDate: "2026-04-01",
      termMonths: 36,
      repaymentType: "equal-principal",
    };

    const netChange = sumLoanNetChangeForPeriod([newLoan], PERIOD);
    // 期首（2025-12-31時点）はまだ借入前なので残高0円。期首日の翌日(2026-04-01)に実行され、
    // 期末までに9回返済（毎回27,777円、最終回未満のため端数繰り上げ）される。
    expect(netChange).toBeGreaterThan(0);
    expect(netChange).toBeLessThanOrEqual(1_000_000);
  });
});

describe("buildCashFlowStatement / 期末現金残高との整合性チェック", () => {
  it("marks the statement as balanced when the three sections plus opening cash reconcile to the balance sheet's ending cash", () => {
    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 500_000,
      unpaidCorporateTaxes: 100_000,
      unpaidConsumptionTax: 30_000,
      fixedAssets: [],
      loans: [],
      openingCash: 2_000_000,
      balanceSheetEndingCash: 2_000_000 + 500_000 + 100_000 + 30_000,
    });

    expect(cf.balanced).toBe(true);
    expect(cf.reconciliationDifference).toBe(0);
    expect(cf.notes).toEqual([]);
  });

  it("flags a mismatch with a warning note when the balance sheet's ending cash does not tie out", () => {
    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 500_000,
      unpaidCorporateTaxes: 100_000,
      unpaidConsumptionTax: 30_000,
      fixedAssets: [],
      loans: [],
      openingCash: 2_000_000,
      // 貸借対照表側の期末現金を意図的に80,000円ずらす
      balanceSheetEndingCash: 2_000_000 + 500_000 + 100_000 + 30_000 + 80_000,
    });

    expect(cf.balanced).toBe(false);
    expect(cf.reconciliationDifference).toBe(80_000);
    expect(cf.notes).toHaveLength(1);
    expect(cf.notes[0]).toContain("一致していません");
    expect(cf.notes[0]).toContain("80,000円");
  });

  it("computes calculatedEndingCash as openingCash plus the sum of all three sections", () => {
    const asset: Asset = {
      id: "a1",
      name: "什器備品",
      acquisitionDate: "2026-03-01",
      acquisitionCost: 200_000,
      usefulLifeYears: 4,
      method: "straight-line",
    };

    const cf = buildCashFlowStatement({
      fiscalPeriod: PERIOD,
      netIncome: 1_000_000,
      unpaidCorporateTaxes: 150_000,
      unpaidConsumptionTax: 40_000,
      fixedAssets: [asset],
      loans: [],
      openingCash: 3_000_000,
      balanceSheetEndingCash: 0, // このテストでは整合性チェックの結果自体は検証しない
    });

    expect(cf.calculatedEndingCash).toBe(cf.openingCash + cf.netChangeInCash);
    expect(cf.netChangeInCash).toBe(cf.operating.subtotal + cf.investing.subtotal + cf.financing.subtotal);
  });
});
