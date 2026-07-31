import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import {
  DEFAULT_CASH_ACCOUNT,
  buildTrialBalance,
  isPeriodActivityBalanced,
  isTrialBalanceBalanced,
} from "./trialBalance";

function tx(overrides: Partial<CategorizedTransaction> & Pick<CategorizedTransaction, "date" | "amount" | "account">): CategorizedTransaction {
  return {
    id: overrides.id ?? `${overrides.date}-${overrides.account}-${overrides.amount}`,
    description: overrides.description ?? "サンプル取引",
    taxCategory: overrides.taxCategory ?? "課税売上10%",
    confidence: overrides.confidence ?? 1,
    source: overrides.source ?? "rule",
    ...overrides,
  };
}

const SAMPLE_ENTRIES: CategorizedTransaction[] = [
  tx({ date: "2026-04-10", amount: 550_000, account: "売上高" }),
  tx({ date: "2026-04-15", amount: -32_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
  tx({ date: "2026-05-02", amount: -8_800, account: "接待交際費", taxCategory: "課税仕入10%" }),
  tx({ date: "2026-06-01", amount: 780_000, account: "売上高" }),
];

describe("buildTrialBalance", () => {
  it("posts every income transaction as a debit to cash and a credit to the transaction's account", () => {
    const tb = buildTrialBalance([tx({ date: "2026-04-10", amount: 550_000, account: "売上高" })]);

    const cashLine = tb.lines.find((l) => l.account === DEFAULT_CASH_ACCOUNT);
    const salesLine = tb.lines.find((l) => l.account === "売上高");

    expect(cashLine?.periodDebit).toBe(550_000);
    expect(cashLine?.periodCredit).toBe(0);
    expect(salesLine?.periodCredit).toBe(550_000);
    expect(salesLine?.periodDebit).toBe(0);
  });

  it("posts every expense transaction as a debit to the transaction's account and a credit to cash", () => {
    const tb = buildTrialBalance([tx({ date: "2026-04-15", amount: -32_000, account: "地代家賃" })]);

    const cashLine = tb.lines.find((l) => l.account === DEFAULT_CASH_ACCOUNT);
    const rentLine = tb.lines.find((l) => l.account === "地代家賃");

    expect(rentLine?.periodDebit).toBe(32_000);
    expect(rentLine?.periodCredit).toBe(0);
    expect(cashLine?.periodCredit).toBe(32_000);
    expect(cashLine?.periodDebit).toBe(0);
  });

  it("aggregates multiple transactions on the same account", () => {
    const tb = buildTrialBalance(SAMPLE_ENTRIES);

    const salesLine = tb.lines.find((l) => l.account === "売上高");
    expect(salesLine?.periodCredit).toBe(550_000 + 780_000);
    expect(salesLine?.periodDebit).toBe(0);
    expect(salesLine?.closingBalance).toBe(-(550_000 + 780_000)); // 貸方残高はマイナスで表現
  });

  it("carries opening balances forward into the closing balance", () => {
    const tb = buildTrialBalance(SAMPLE_ENTRIES, {
      openingBalances: {
        [DEFAULT_CASH_ACCOUNT]: { debit: 1_000_000 },
      },
    });

    const cashLine = tb.lines.find((l) => l.account === DEFAULT_CASH_ACCOUNT);
    expect(cashLine?.openingBalance).toBe(1_000_000);
    // 1,000,000 (opening) + 1,330,000 (period debit from income) - 40,800 (period credit from expenses)
    expect(cashLine?.closingBalance).toBe(1_000_000 + 1_330_000 - 40_800);
  });

  it("includes accounts that only appear in openingBalances, even with no period activity", () => {
    const tb = buildTrialBalance([], { openingBalances: { 借入金: { credit: 500_000 } } });

    const loanLine = tb.lines.find((l) => l.account === "借入金");
    expect(loanLine).toBeDefined();
    expect(loanLine?.openingBalance).toBe(-500_000);
    expect(loanLine?.periodDebit).toBe(0);
    expect(loanLine?.periodCredit).toBe(0);
    expect(loanLine?.closingBalance).toBe(-500_000);
  });

  it("filters transactions to the given period while opening balances remain unaffected", () => {
    const tb = buildTrialBalance(SAMPLE_ENTRIES, { periodStart: "2026-05-01", periodEnd: "2026-05-31" });

    expect(tb.periodStart).toBe("2026-05-01");
    expect(tb.periodEnd).toBe("2026-05-31");
    const rentLine = tb.lines.find((l) => l.account === "地代家賃");
    const entertainmentLine = tb.lines.find((l) => l.account === "接待交際費");
    expect(rentLine).toBeUndefined(); // 4月分は期間外
    expect(entertainmentLine?.periodDebit).toBe(8_800);
  });

  it("ignores zero-amount transactions entirely", () => {
    const tb = buildTrialBalance([tx({ date: "2026-04-10", amount: 0, account: "売上高" })]);
    expect(tb.lines).toHaveLength(0);
  });

  it("sorts lines by account name", () => {
    const tb = buildTrialBalance(SAMPLE_ENTRIES);
    const accountNames = tb.lines.map((l) => l.account);
    const sorted = [...accountNames].sort((a, b) => a.localeCompare(b, "ja"));
    expect(accountNames).toEqual(sorted);
  });

  it("supports a custom cash account name", () => {
    const tb = buildTrialBalance([tx({ date: "2026-04-10", amount: 100_000, account: "売上高" })], {
      cashAccount: "普通預金",
    });

    expect(tb.lines.find((l) => l.account === "普通預金")).toBeDefined();
    expect(tb.lines.find((l) => l.account === DEFAULT_CASH_ACCOUNT)).toBeUndefined();
  });

  describe("double-entry balance check (the fundamental trial balance invariant)", () => {
    it("always balances period debit totals against period credit totals, by construction", () => {
      const tb = buildTrialBalance(SAMPLE_ENTRIES);
      expect(tb.periodDebitTotal).toBe(tb.periodCreditTotal);
      expect(isPeriodActivityBalanced(tb)).toBe(true);
    });

    it("balances closing debit totals against closing credit totals when opening balances are internally consistent", () => {
      const tb = buildTrialBalance(SAMPLE_ENTRIES, {
        openingBalances: {
          [DEFAULT_CASH_ACCOUNT]: { debit: 3_000_000 },
          資本金: { credit: 1_000_000 },
          元入金: { credit: 2_000_000 },
        },
      });

      expect(tb.balanced).toBe(true);
      expect(isTrialBalanceBalanced(tb)).toBe(true);
      expect(tb.closingDebitTotal).toBe(tb.closingCreditTotal);
    });

    it("reports an unbalanced table when opening balances themselves do not net to zero", () => {
      const tb = buildTrialBalance([], {
        openingBalances: {
          [DEFAULT_CASH_ACCOUNT]: { debit: 3_000_000 },
          資本金: { credit: 1_000_000 }, // 貸方1,000,000だけでは借方3,000,000と釣り合わない
        },
      });

      expect(tb.balanced).toBe(false);
      expect(isTrialBalanceBalanced(tb)).toBe(false);
    });

    it("balances with no transactions and no opening balances (an empty trial balance is trivially balanced)", () => {
      const tb = buildTrialBalance([]);
      expect(tb.lines).toHaveLength(0);
      expect(tb.balanced).toBe(true);
      expect(tb.periodDebitTotal).toBe(0);
      expect(tb.periodCreditTotal).toBe(0);
    });
  });
});
