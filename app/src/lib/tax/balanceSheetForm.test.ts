import { describe, expect, it } from "vitest";
import { buildBalanceSheetForm, sumCashLedgerMovement, sumFixedAssetsBookValue, sumLoansBalance } from "./balanceSheetForm";
import { AccountRow, JournalEntryRow } from "../db/supabaseClient";
import { Asset, calculateAssetDepreciation } from "./depreciation";
import { installmentsWithinPeriod, Loan, outstandingPrincipalAsOf } from "./loanAmortization";

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

  it("uses openingRetainedEarnings directly when provided instead of deriving it from openingCash", () => {
    const bs = buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, openingRetainedEarnings: 800_000 },
      0,
      0,
      0,
      0,
      0
    );

    expect(bs.openingRetainedEarnings).toBe(800_000);
    expect(bs.retainedEarningsEnding).toBe(800_000);
  });
});

describe("sumCashLedgerMovement", () => {
  const accounts: AccountRow[] = [
    { id: "acc-cash", tenant_id: "t1", code: null, name: "現金及び預金", account_type: "asset", tax_category: null, created_at: "" },
    { id: "acc-fixed", tenant_id: "t1", code: null, name: "什器備品", account_type: "asset", tax_category: null, created_at: "" },
    { id: "acc-revenue", tenant_id: "t1", code: null, name: "売上高", account_type: "revenue", tax_category: null, created_at: "" },
    { id: "acc-expense", tenant_id: "t1", code: null, name: "消耗品費", account_type: "expense", tax_category: null, created_at: "" },
  ];

  function je(overrides: Partial<JournalEntryRow>): JournalEntryRow {
    return {
      id: "je",
      tenant_id: "t1",
      entry_group_id: "je",
      date: "2026-06-01",
      debit_account_id: "acc-cash",
      credit_account_id: "acc-revenue",
      amount: 1000,
      description: null,
      tax_category: "課税売上10%",
      confidence: 1,
      source: "rule",
      personal_deduction_only: false,
      exclude_from_income: false,
      created_at: "",
      ...overrides,
    };
  }

  it("sums debits/credits to the cash account within (asOfDate, periodEnd]", () => {
    const entries = [
      je({ date: "2026-04-10", debit_account_id: "acc-cash", credit_account_id: "acc-revenue", amount: 500_000 }),
      je({ date: "2026-05-10", debit_account_id: "acc-expense", credit_account_id: "acc-cash", amount: 80_000 }),
      // 期首残高の基準日以前の仕訳は除外する
      je({ date: "2025-12-01", debit_account_id: "acc-cash", credit_account_id: "acc-revenue", amount: 999_999 }),
      // 対象期間終了日より後の仕訳は除外する
      je({ date: "2027-01-05", debit_account_id: "acc-cash", credit_account_id: "acc-revenue", amount: 999_999 }),
    ];

    const movement = sumCashLedgerMovement(entries, accounts, ["acc-fixed"], "2025-12-31", "2026-12-31");
    expect(movement.inflow).toBe(500_000);
    expect(movement.outflow).toBe(80_000);
  });

  it("excludes fixed-asset accounts from the cash pool even though they are account_type asset", () => {
    const entries = [
      // 固定資産購入（現金払い）: 現金は減るが、固定資産科目自体は現金プールに含めない
      je({ date: "2026-06-01", debit_account_id: "acc-fixed", credit_account_id: "acc-cash", amount: 600_000 }),
    ];

    const movement = sumCashLedgerMovement(entries, accounts, ["acc-fixed"], "2025-12-31", "2026-12-31");
    expect(movement.inflow).toBe(0);
    expect(movement.outflow).toBe(600_000);
  });

  it("nets transfers between two cash-like accounts to zero", () => {
    const accountsWithSecondCash: AccountRow[] = [
      ...accounts,
      { id: "acc-bank", tenant_id: "t1", code: null, name: "普通預金", account_type: "asset", tax_category: null, created_at: "" },
    ];
    const entries = [je({ date: "2026-06-01", debit_account_id: "acc-bank", credit_account_id: "acc-cash", amount: 300_000 })];

    const movement = sumCashLedgerMovement(entries, accountsWithSecondCash, ["acc-fixed"], "2025-12-31", "2026-12-31");
    expect(movement.inflow).toBe(300_000);
    expect(movement.outflow).toBe(300_000);
  });
});

describe("sumFixedAssetsBookValue / sumLoansBalance", () => {
  it("sums ending book value across multiple fixed assets as of the fiscal period end", () => {
    const assets: Asset[] = [
      { id: "a1", name: "什器備品A", acquisitionDate: "2025-06-01", acquisitionCost: 600_000, usefulLifeYears: 5, method: "straight-line" },
      { id: "a2", name: "什器備品B", acquisitionDate: "2027-01-01", acquisitionCost: 300_000, usefulLifeYears: 3, method: "straight-line" },
    ];
    const period = { start: "2026-01-01", end: "2026-12-31" };

    // a1: 600,000 / 5年 / 12ヶ月 = 月10,000円。取得(2025-06)から2026年末までの19ヶ月分償却 = 190,000円 → 帳簿価額410,000円
    // a2: 対象期間末(2026-12-31)より後に取得予定のため、この期間の資産としては含めない
    expect(sumFixedAssetsBookValue(assets, period)).toBe(410_000);
  });

  it("sums outstanding principal across multiple loans as of the given date", () => {
    const loans: Loan[] = [
      { id: "l1", name: "融資A", principalAmount: 1_200_000, interestRate: 0.06, startDate: "2025-01-15", termMonths: 24, repaymentType: "equal-principal" },
      { id: "l2", name: "融資B", principalAmount: 500_000, interestRate: 0, startDate: "2027-01-01", termMonths: 12 },
    ];

    // l1: 2026-12-31時点で23回返済済み（1,150,000円）→ 残高50,000円
    // l2: まだ借入前（2027-01-01開始）のため残高0円
    expect(sumLoansBalance(loans, "2026-12-31")).toBe(50_000);
  });
});

describe("buildBalanceSheetForm (実データ: fixed_assets/loans/journal_entriesを含む1年分のシナリオ)", () => {
  it("balances assets against liabilities + net assets when opening balances, a fixed asset, a loan, and a year of journal entries are all self-consistent", () => {
    const asOfDate = "2025-12-31";
    const fiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

    const asset: Asset = {
      id: "asset-1",
      name: "什器備品",
      acquisitionDate: "2025-06-01",
      acquisitionCost: 600_000,
      usefulLifeYears: 5,
      method: "straight-line",
    };
    const loan: Loan = {
      id: "loan-1",
      name: "運転資金",
      principalAmount: 1_200_000,
      interestRate: 0.06,
      startDate: "2025-01-15",
      termMonths: 24,
      repaymentType: "equal-principal",
    };

    const accounts: AccountRow[] = [
      { id: "acc-cash", tenant_id: "t1", code: null, name: "現金及び預金", account_type: "asset", tax_category: null, created_at: "" },
      { id: "acc-fixed", tenant_id: "t1", code: null, name: "什器備品", account_type: "asset", tax_category: null, created_at: "" },
      { id: "acc-revenue", tenant_id: "t1", code: null, name: "売上高", account_type: "revenue", tax_category: null, created_at: "" },
      { id: "acc-expense", tenant_id: "t1", code: null, name: "消耗品費", account_type: "expense", tax_category: null, created_at: "" },
      { id: "acc-deprexp", tenant_id: "t1", code: null, name: "減価償却費", account_type: "expense", tax_category: null, created_at: "" },
      { id: "acc-loan", tenant_id: "t1", code: null, name: "長期借入金", account_type: "liability", tax_category: null, created_at: "" },
      { id: "acc-interest", tenant_id: "t1", code: null, name: "支払利息", account_type: "expense", tax_category: null, created_at: "" },
    ];

    function je(overrides: Partial<JournalEntryRow>): JournalEntryRow {
      return {
        id: `je-${Math.random()}`,
        tenant_id: "t1",
        entry_group_id: `je-${Math.random()}`,
        date: "2026-06-01",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-revenue",
        amount: 1000,
        description: null,
        tax_category: "課税売上10%",
        confidence: 1,
        source: "rule",
        personal_deduction_only: false,
        exclude_from_income: false,
        created_at: "",
        ...overrides,
      };
    }

    const REVENUE = 3_000_000;
    const EXPENSE = 1_850_000;

    const loanInstallmentsThisYear = installmentsWithinPeriod(loan, fiscalPeriod);
    const interestThisYear = loanInstallmentsThisYear.reduce((s, i) => s + i.interestPayment, 0);

    const entries: JournalEntryRow[] = [
      je({ date: "2026-06-01", debit_account_id: "acc-cash", credit_account_id: "acc-revenue", amount: REVENUE }),
      je({ date: "2026-06-02", debit_account_id: "acc-expense", credit_account_id: "acc-cash", amount: EXPENSE }),
      // 減価償却の生成仕訳（現金を伴わない。現金残高の計算からは自動的に除外される）
      je({
        date: "2026-12-31",
        debit_account_id: "acc-deprexp",
        credit_account_id: "acc-fixed",
        amount: calculateAssetDepreciation(asset, fiscalPeriod).currentYearDepreciation,
        source: "generated",
      }),
      // 借入金の返済仕訳（利息・元本、生成バッチが作る想定の形）
      ...loanInstallmentsThisYear.flatMap((installment) => [
        je({
          date: installment.paymentDate,
          debit_account_id: "acc-interest",
          credit_account_id: "acc-cash",
          amount: installment.interestPayment,
          source: "generated",
        }),
        je({
          date: installment.paymentDate,
          debit_account_id: "acc-loan",
          credit_account_id: "acc-cash",
          amount: installment.principalPayment,
          source: "generated",
        }),
      ]),
    ].filter((e) => e.amount > 0); // 利息0円の回はamount>0制約に反するため除外（テストのローンでは通常発生しない）

    const cash = sumCashLedgerMovement(entries, accounts, ["acc-fixed"], asOfDate, fiscalPeriod.end);

    // 期首時点の帳簿価額・借入金残高から、期首バランス（資産＝負債＋純資産）を満たすように
    // 資本金・期首繰越利益剰余金・期首現金残高を組み立てる（この一貫性が無いと、期中の増減を
    // どれだけ正確に積み上げても期末のバランスは取れない。これは実データでも成り立つべき前提）。
    const openingFixedAssetBookValue = calculateAssetDepreciation(asset, { start: "2025-01-01", end: asOfDate }).endingBookValue;
    const openingLoanBalance = outstandingPrincipalAsOf(loan, asOfDate);
    const openingCash = 2_000_000;
    const capitalStock = 1_000_000;
    const openingRetainedEarnings = openingCash + openingFixedAssetBookValue - openingLoanBalance - capitalStock;

    const currentYearDepreciation = calculateAssetDepreciation(asset, fiscalPeriod).currentYearDepreciation;
    const netIncome = REVENUE - EXPENSE - currentYearDepreciation - interestThisYear;

    const bs = buildBalanceSheetForm(
      {
        capitalStock,
        openingCash,
        openingRetainedEarnings,
        fixedAssets: [asset],
        loans: [loan],
        fiscalPeriod,
      },
      cash.inflow,
      cash.outflow,
      0, // unpaidCorporateTaxes
      0, // unpaidConsumptionTax
      netIncome
    );

    expect(bs.fixedAssetsBookValue).toBe(410_000);
    expect(bs.loansBalance).toBe(outstandingPrincipalAsOf(loan, fiscalPeriod.end));
    expect(bs.balanced).toBe(true);
  });
});

describe("buildBalanceSheetForm (backward compat share-count edge cases)", () => {
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
