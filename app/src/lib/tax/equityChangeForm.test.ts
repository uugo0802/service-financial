import { describe, expect, it } from "vitest";
import { buildEquityChangeForm } from "./equityChangeForm";
import { buildBalanceSheetForm } from "./balanceSheetForm";

describe("buildEquityChangeForm", () => {
  it("keeps capital stock unchanged across the period (no capital transactions modeled)", () => {
    const eq = buildEquityChangeForm({ capitalStock: 1_000_000, openingCash: 3_000_000, netIncome: 750_000 });

    expect(eq.capitalStock.openingBalance).toBe(1_000_000);
    expect(eq.capitalStock.change).toBe(0);
    expect(eq.capitalStock.closingBalance).toBe(1_000_000);
  });

  it("derives opening retained earnings as openingCash minus capitalStock, then rolls forward by netIncome", () => {
    const eq = buildEquityChangeForm({ capitalStock: 1_000_000, openingCash: 3_000_000, netIncome: 750_000 });

    expect(eq.retainedEarnings.openingBalance).toBe(2_000_000); // 3,000,000 - 1,000,000
    expect(eq.retainedEarnings.change).toBe(750_000);
    expect(eq.retainedEarnings.closingBalance).toBe(2_750_000);
  });

  it("computes net assets total as capitalStock + retainedEarnings for both opening and closing", () => {
    const eq = buildEquityChangeForm({ capitalStock: 1_000_000, openingCash: 3_000_000, netIncome: 750_000 });

    expect(eq.netAssetsTotal.openingBalance).toBe(3_000_000); // == openingCash, since assets = cash only at opening
    expect(eq.netAssetsTotal.change).toBe(750_000);
    expect(eq.netAssetsTotal.closingBalance).toBe(3_750_000);
  });

  it("handles a net loss (negative netIncome) by reducing retained earnings and net assets", () => {
    const eq = buildEquityChangeForm({ capitalStock: 1_000_000, openingCash: 3_000_000, netIncome: -500_000 });

    expect(eq.retainedEarnings.closingBalance).toBe(1_500_000);
    expect(eq.netAssetsTotal.closingBalance).toBe(2_500_000);
  });

  it("produces a zeroed statement when there is no opening cash, capital, or income", () => {
    const eq = buildEquityChangeForm({ capitalStock: 0, openingCash: 0, netIncome: 0 });

    expect(eq.capitalStock.closingBalance).toBe(0);
    expect(eq.retainedEarnings.closingBalance).toBe(0);
    expect(eq.netAssetsTotal.closingBalance).toBe(0);
  });

  // Regression: this is the acceptance criterion tying the equity statement back to the
  // balance sheet — both are derived from the same (capitalStock, openingCash, netIncome)
  // inputs, so their ending net assets figures must always reconcile exactly.
  it("reconciles ending net assets total with buildBalanceSheetForm's netAssetsTotal", () => {
    const capitalStock = 1_000_000;
    const openingCash = 3_000_000;
    const cashInflow = 5_000_000;
    const cashOutflow = 4_000_000;
    const unpaidCorporateTaxes = 200_000;
    const unpaidConsumptionTax = 50_000;
    const netIncome = 750_000;

    const bs = buildBalanceSheetForm(
      { capitalStock, openingCash },
      cashInflow,
      cashOutflow,
      unpaidCorporateTaxes,
      unpaidConsumptionTax,
      netIncome
    );
    const eq = buildEquityChangeForm({ capitalStock, openingCash, netIncome });

    expect(eq.netAssetsTotal.closingBalance).toBe(bs.netAssetsTotal);
    expect(eq.retainedEarnings.closingBalance).toBe(bs.retainedEarningsEnding);
    expect(eq.capitalStock.closingBalance).toBe(bs.capitalStock);
  });

  it("uses openingRetainedEarnings directly when provided (company_opening_balances.retained_earnings), ignoring openingCash", () => {
    // 固定資産・借入金がある場合、openingCash - capitalStock という単純な逆算では
    // 実際の期首繰越利益剰余金と一致しない。company_opening_balances.retained_earnings を
    // 明示的に渡した場合はそちらを優先する。
    const eq = buildEquityChangeForm({
      capitalStock: 1_000_000,
      openingCash: 3_000_000, // 逆算すると2,000,000になってしまうはずの値だが、下記を優先する
      openingRetainedEarnings: 650_000,
      netIncome: 100_000,
    });

    expect(eq.retainedEarnings.openingBalance).toBe(650_000);
    expect(eq.retainedEarnings.closingBalance).toBe(750_000);
    expect(eq.netAssetsTotal.openingBalance).toBe(1_650_000);
  });

  it("reconciles with buildBalanceSheetForm's netAssetsTotal when both use an explicit openingRetainedEarnings", () => {
    const capitalStock = 1_000_000;
    const openingCash = 2_000_000;
    const openingRetainedEarnings = 650_000;
    const netIncome = 300_000;

    const bs = buildBalanceSheetForm({ capitalStock, openingCash, openingRetainedEarnings }, 0, 0, 0, 0, netIncome);
    const eq = buildEquityChangeForm({ capitalStock, openingCash, openingRetainedEarnings, netIncome });

    expect(eq.netAssetsTotal.closingBalance).toBe(bs.netAssetsTotal);
    expect(eq.retainedEarnings.closingBalance).toBe(bs.retainedEarningsEnding);
  });

  it("reconciles even when the balance sheet does not balance (e.g. inconsistent sample inputs)", () => {
    // Even if cashInflow/cashOutflow don't tie out with unpaid taxes + netIncome
    // (balanceSheetForm.balanced would be false), the equity statement's net assets
    // total still reconciles because both are derived purely from
    // capitalStock + openingCash + netIncome, independent of the cash flow figures.
    const capitalStock = 500_000;
    const openingCash = 1_000_000;
    const netIncome = 100_000;

    const bs = buildBalanceSheetForm({ capitalStock, openingCash }, 10_000, 999_999, 0, 0, netIncome);
    const eq = buildEquityChangeForm({ capitalStock, openingCash, netIncome });

    expect(eq.netAssetsTotal.closingBalance).toBe(bs.netAssetsTotal);
  });
});
