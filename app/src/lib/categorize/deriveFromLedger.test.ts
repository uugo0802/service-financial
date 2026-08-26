import { describe, expect, it } from "vitest";
import { deriveCategorizedTransactions } from "./deriveFromLedger";
import { AccountRow, JournalEntryRow } from "../db/supabaseClient";
import { buildProfitLossStatement } from "../tax/plStatement";

function account(overrides: Partial<AccountRow> & Pick<AccountRow, "id" | "name" | "account_type">): AccountRow {
  return {
    tenant_id: "tenant-1",
    code: null,
    tax_category: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// 現行の SAMPLE_DATA（lib/tax/plStatement.test.ts が使う CategorizedTransaction ベースの
// フィクスチャ）と同じ経済取引を、journal_entries 形式で表現した勘定科目マスタ。
const ACCOUNTS: AccountRow[] = [
  account({ id: "acc-cash", name: "現金及び預金", account_type: "asset" }),
  account({ id: "acc-sales", name: "売上高", account_type: "revenue" }),
  account({ id: "acc-rent", name: "地代家賃", account_type: "expense" }),
  account({ id: "acc-telecom", name: "通信費", account_type: "expense" }),
  account({ id: "acc-loan", name: "借入金", account_type: "liability" }),
  account({ id: "acc-capital", name: "元入金", account_type: "equity" }),
  account({ id: "acc-depreciation", name: "減価償却費", account_type: "expense" }),
  account({ id: "acc-fixed-asset", name: "工具器具備品", account_type: "asset" }),
];

function entry(overrides: Partial<JournalEntryRow> & Pick<JournalEntryRow, "id" | "debit_account_id" | "credit_account_id" | "amount">): JournalEntryRow {
  return {
    tenant_id: "tenant-1",
    entry_group_id: overrides.id,
    date: "2026-01-01",
    description: null,
    tax_category: "対象外",
    confidence: 1,
    source: "rule",
    personal_deduction_only: false,
    exclude_from_income: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("deriveCategorizedTransactions", () => {
  // Golden test: 既存の lib/tax/plStatement.test.ts の
  // "separates income and expense and computes totals" が使うフィクスチャと同じ3取引を
  // journal_entries 形式で表現し、射影結果を既存の buildProfitLossStatement に渡しても
  // 同じ期待値（incomeTotal/expenseTotal/profit/periodStart/periodEnd）になることを保証する。
  it("projects a sales + expenses ledger to the same P/L totals as the existing CategorizedTransaction fixture", () => {
    const entries: JournalEntryRow[] = [
      entry({
        id: "je-1",
        date: "2026-01-05",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-sales",
        amount: 500000,
        description: "クライアントA社 業務委託料",
        tax_category: "課税売上10%",
      }),
      entry({
        id: "je-2",
        date: "2026-01-10",
        debit_account_id: "acc-rent",
        credit_account_id: "acc-cash",
        amount: 100000,
        description: "事務所家賃",
        tax_category: "課税仕入10%",
      }),
      entry({
        id: "je-3",
        date: "2026-01-20",
        debit_account_id: "acc-telecom",
        credit_account_id: "acc-cash",
        amount: 20000,
        description: "通信費 支払い",
        tax_category: "課税仕入10%",
      }),
    ];

    const derived = deriveCategorizedTransactions(entries, ACCOUNTS);

    expect(derived).toEqual([
      {
        id: "je-1",
        date: "2026-01-05",
        description: "クライアントA社 業務委託料",
        amount: 500000,
        account: "売上高",
        taxCategory: "課税売上10%",
        confidence: 1,
        source: "rule",
        personalDeductionOnly: false,
        excludeFromIncome: false,
      },
      {
        id: "je-2",
        date: "2026-01-10",
        description: "事務所家賃",
        amount: -100000,
        account: "地代家賃",
        taxCategory: "課税仕入10%",
        confidence: 1,
        source: "rule",
        personalDeductionOnly: false,
        excludeFromIncome: false,
      },
      {
        id: "je-3",
        date: "2026-01-20",
        description: "通信費 支払い",
        amount: -20000,
        account: "通信費",
        taxCategory: "課税仕入10%",
        confidence: 1,
        source: "rule",
        personalDeductionOnly: false,
        excludeFromIncome: false,
      },
    ]);

    // 既存の CategorizedTransaction ベースのテスト（plStatement.test.ts）が期待する値と一致すること
    const pl = buildProfitLossStatement(derived);
    expect(pl.incomeTotal).toBe(500000);
    expect(pl.expenseTotal).toBe(120000);
    expect(pl.profit).toBe(380000);
    expect(pl.periodStart).toBe("2026-01-05");
    expect(pl.periodEnd).toBe("2026-01-20");
  });

  // Golden test: 既存の plStatement.test.ts "groups multiple transactions under the same account"
  it("groups multiple journal entries against the same expense account, matching the existing grouping behavior", () => {
    const entries: JournalEntryRow[] = [
      entry({ id: "je-1", debit_account_id: "acc-telecom", credit_account_id: "acc-cash", amount: 10000 }),
      entry({ id: "je-2", debit_account_id: "acc-telecom", credit_account_id: "acc-cash", amount: 20000 }),
    ];

    const pl = buildProfitLossStatement(deriveCategorizedTransactions(entries, ACCOUNTS));
    expect(pl.expenseLines).toHaveLength(1);
    expect(pl.expenseLines[0]).toEqual({ account: "通信費", amount: 30000 });
  });

  // Golden test: 既存の plStatement.test.ts "excludes loan proceeds and capital contributions from income totals"
  // 旧モデルでは excludeFromIncome フラグで損益計算から除外していたが、新モデルでは
  // 資産・負債の両建て行（貸方が revenue でも借方が expense でもない）は、射影ルールの
  // どちらにも一致しないため、そもそも配列に現れない。結果としてP/Lへの影響は同じになる。
  it("excludes asset/liability two-sided entries (e.g. loan proceeds) from the projection entirely", () => {
    const entries: JournalEntryRow[] = [
      entry({
        id: "je-1",
        date: "2026-01-05",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-sales",
        amount: 500000,
        tax_category: "課税売上10%",
      }),
      entry({
        id: "je-2",
        date: "2026-01-10",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-loan",
        amount: 3000000,
        description: "銀行融資 借入実行",
        tax_category: "対象外",
        exclude_from_income: true,
      }),
    ];

    const derived = deriveCategorizedTransactions(entries, ACCOUNTS);

    expect(derived).toHaveLength(1);
    expect(derived.map((tx) => tx.account)).not.toContain("借入金");

    const pl = buildProfitLossStatement(derived);
    expect(pl.incomeTotal).toBe(500000);
  });

  // 出資（資本金）の払込みも同様に asset/equity の両建てのため射影対象外になる。
  it("excludes asset/equity two-sided entries (e.g. capital contributions) from the projection entirely", () => {
    const entries: JournalEntryRow[] = [
      entry({
        id: "je-1",
        debit_account_id: "acc-cash",
        credit_account_id: "acc-capital",
        amount: 1000000,
        description: "資本金払込み",
        tax_category: "対象外",
        exclude_from_income: true,
      }),
    ];

    expect(deriveCategorizedTransactions(entries, ACCOUNTS)).toEqual([]);
  });

  it("returns an empty array for an empty ledger, matching buildProfitLossStatement's zeroed-totals behavior", () => {
    const derived = deriveCategorizedTransactions([], ACCOUNTS);
    expect(derived).toEqual([]);

    const pl = buildProfitLossStatement(derived);
    expect(pl.incomeTotal).toBe(0);
    expect(pl.expenseTotal).toBe(0);
    expect(pl.profit).toBe(0);
  });

  it("passes through tax_category, confidence, source, and the personal/exclude flags as-is", () => {
    const entries: JournalEntryRow[] = [
      entry({
        id: "je-1",
        debit_account_id: "acc-rent",
        credit_account_id: "acc-cash",
        amount: 12000,
        tax_category: "要確認",
        confidence: 0,
        source: "uncategorized",
        personal_deduction_only: true,
      }),
    ];

    const [derived] = deriveCategorizedTransactions(entries, ACCOUNTS);
    expect(derived.taxCategory).toBe("要確認");
    expect(derived.confidence).toBe(0);
    expect(derived.source).toBe("uncategorized");
    expect(derived.personalDeductionOnly).toBe(true);
  });

  // 減価償却費のような自動生成仕訳（source: "generated"）も、借方が expense 科目である限り
  // 通常の費用取引と同じ規則でP/Lに射影される。
  it("projects a generated depreciation entry (debit: expense account) as a normal expense transaction", () => {
    const entries: JournalEntryRow[] = [
      entry({
        id: "je-dep-2026",
        date: "2026-12-31",
        debit_account_id: "acc-depreciation",
        credit_account_id: "acc-fixed-asset",
        amount: 150000,
        description: "減価償却費（工具器具備品）",
        tax_category: "不課税",
        source: "generated",
      }),
    ];

    const derived = deriveCategorizedTransactions(entries, ACCOUNTS);
    expect(derived).toEqual([
      {
        id: "je-dep-2026",
        date: "2026-12-31",
        description: "減価償却費（工具器具備品）",
        amount: -150000,
        account: "減価償却費",
        taxCategory: "不課税",
        confidence: 1,
        source: "generated",
        personalDeductionOnly: false,
        excludeFromIncome: false,
      },
    ]);
  });

  it("falls back to an empty description when journal_entries.description is null", () => {
    const entries: JournalEntryRow[] = [
      entry({ id: "je-1", debit_account_id: "acc-rent", credit_account_id: "acc-cash", amount: 5000 }),
    ];
    const [derived] = deriveCategorizedTransactions(entries, ACCOUNTS);
    expect(derived.description).toBe("");
  });

  it("silently skips a row whose debit/credit account id is missing from the accounts list (data integrity issue)", () => {
    const entries: JournalEntryRow[] = [
      entry({ id: "je-1", debit_account_id: "does-not-exist", credit_account_id: "acc-sales", amount: 1000 }),
      entry({ id: "je-2", debit_account_id: "acc-rent", credit_account_id: "does-not-exist", amount: 2000 }),
    ];

    const derived = deriveCategorizedTransactions(entries, ACCOUNTS);
    // je-1: credit側(acc-sales)はrevenueなので収益取引としては生成される。借方は不明科目のため費用側は生成されない。
    // je-2: debit側(acc-rent)はexpenseなので費用取引としては生成される。貸方は不明科目のため収益側は生成されない。
    expect(derived).toHaveLength(2);
    expect(derived[0]).toMatchObject({ id: "je-1", account: "売上高", amount: 1000 });
    expect(derived[1]).toMatchObject({ id: "je-2", account: "地代家賃", amount: -2000 });
  });
});
