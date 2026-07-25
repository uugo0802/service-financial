import { describe, expect, it } from "vitest";
import { buildBalanceSheetForm } from "./balanceSheetForm";

describe("buildBalanceSheetForm", () => {
  it("balances assets against liabilities + net assets for a normal profitable period", () => {
    // cashInflow - cashOutflow (1,000,000) must equal
    // unpaidCorporateTaxes + unpaidConsumptionTax + netIncome (250,000 + 750,000)
    // for the simplified balance sheet to tie out.
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, shareCount: 100 },
      5_000_000, // cashInflow
      4_000_000, // cashOutflow
      200_000, // unpaidCorporateTaxes
      50_000, // unpaidConsumptionTax
      750_000 // netIncome
    );

    expect(bs.endingCash).toBe(4_000_000);
    expect(bs.assetsTotal).toBe(4_000_000);
    expect(bs.liabilitiesTotal).toBe(250_000);
    expect(bs.retainedEarningsEnding).toBe(2_750_000);
    expect(bs.netAssetsTotal).toBe(3_750_000);
    expect(bs.balanced).toBe(true);
  });

  it("derives openingRetainedEarnings as openingCash minus capitalStock", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000 },
      0,
      0,
      0,
      0,
      0
    );

    expect(bs.openingRetainedEarnings).toBe(2_000_000);
    expect(bs.openingRetainedEarnings).toBe(bs.openingCash - bs.capitalStock);
  });

  it("computes per-share figures when shareCount is provided", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, shareCount: 100 },
      5_000_000,
      4_000_000,
      200_000,
      50_000,
      750_000
    );

    expect(bs.shareCount).toBe(100);
    expect(bs.netAssetPerShare).toBe(37_500);
    expect(bs.netIncomePerShare).toBe(7_500);
  });

  it("rounds per-share figures to two decimal places when division is uneven", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, shareCount: 7 },
      5_000_000,
      4_000_000,
      200_000,
      50_000,
      750_000
    );

    // netAssetsTotal = 3,750,000 / 7 = 535714.2857... -> rounded to 2 decimals
    expect(bs.netAssetPerShare).toBe(535_714.29);
    // netIncome = 750,000 / 7 = 107142.8571... -> rounded to 2 decimals
    expect(bs.netIncomePerShare).toBe(107_142.86);
  });

  it("leaves per-share figures and shareCount undefined when shareCount is not provided", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000 },
      5_000_000,
      4_000_000,
      200_000,
      50_000,
      750_000
    );

    expect(bs.shareCount).toBeUndefined();
    expect(bs.netAssetPerShare).toBeUndefined();
    expect(bs.netIncomePerShare).toBeUndefined();
  });

  it("treats a shareCount of 0 as not provided", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, shareCount: 0 },
      0,
      0,
      0,
      0,
      0
    );

    expect(bs.shareCount).toBeUndefined();
    expect(bs.netAssetPerShare).toBeUndefined();
    expect(bs.netIncomePerShare).toBeUndefined();
  });
});
