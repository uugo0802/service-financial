import { describe, expect, it } from "vitest";
import {
  ReimbursableExpenseInput,
  buildReimbursementJournalEntrySuggestion,
  computeReimbursementsSummary,
  isFullyReimbursed,
  markReimbursementOutstanding,
  markReimbursementSettled,
  outstandingReimbursementAmountOf,
  recordReimbursableExpense,
  reimbursedAmountOf,
  REIMBURSEMENT_LIABILITY_ACCOUNT,
  REIMBURSEMENT_LIABILITY_TAX_CATEGORY,
} from "./reimbursement";
import { buildTrialBalance, isTrialBalanceBalanced } from "../tax/trialBalance";
import { CategorizedTransaction } from "../categorize/engine";

const AS_OF = "2026-07-30"; // 今日の日付（テスト用の固定基準日）

function expense(overrides: Partial<ReimbursableExpenseInput> = {}): ReimbursableExpenseInput {
  return {
    id: "REIMB-0001",
    payerName: "代表 修吾",
    description: "取引先訪問の電車代",
    paidDate: "2026-01-01",
    amount: 10_000,
    account: "旅費交通費",
    taxCategory: "課税仕入10%",
    ...overrides,
  };
}

/** 基準日から指定した日数だけ過去のISO日付文字列を返す（UTC基準）。 */
function daysBeforeAsOf(days: number): string {
  const ms = Date.parse(`${AS_OF}T00:00:00Z`) - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe("reimbursedAmountOf", () => {
  it("treats an expense with no reimbursedAt as not yet reimbursed", () => {
    expect(reimbursedAmountOf(expense({ amount: 50_000 }))).toBe(0);
  });

  it("treats an expense with reimbursedAt but no reimbursedAmount as fully reimbursed", () => {
    expect(reimbursedAmountOf(expense({ amount: 50_000, reimbursedAt: "2026-02-01" }))).toBe(50_000);
  });

  it("uses the explicit reimbursedAmount for a partially reimbursed expense", () => {
    expect(
      reimbursedAmountOf(expense({ amount: 50_000, reimbursedAt: "2026-02-01", reimbursedAmount: 30_000 }))
    ).toBe(30_000);
  });

  it("never returns a negative amount even if reimbursedAmount is negative", () => {
    expect(reimbursedAmountOf(expense({ amount: 50_000, reimbursedAt: "2026-02-01", reimbursedAmount: -100 }))).toBe(
      0
    );
  });
});

describe("outstandingReimbursementAmountOf", () => {
  it("treats an expense with no reimbursedAt as fully outstanding", () => {
    expect(outstandingReimbursementAmountOf(expense({ amount: 50_000 }))).toBe(50_000);
  });

  it("treats a fully reimbursed expense as zero outstanding", () => {
    expect(outstandingReimbursementAmountOf(expense({ amount: 50_000, reimbursedAt: "2026-02-01" }))).toBe(0);
  });

  it("computes the remaining balance for a partially reimbursed expense", () => {
    expect(
      outstandingReimbursementAmountOf(
        expense({ amount: 50_000, reimbursedAt: "2026-02-01", reimbursedAmount: 30_000 })
      )
    ).toBe(20_000);
  });

  it("never returns a negative amount when reimbursedAmount exceeds amount (over-reimbursement)", () => {
    expect(
      outstandingReimbursementAmountOf(
        expense({ amount: 50_000, reimbursedAt: "2026-02-01", reimbursedAmount: 999_999 })
      )
    ).toBe(0);
  });

  it("treats a negative amount (with no reimbursement recorded) as zero outstanding rather than negative", () => {
    expect(outstandingReimbursementAmountOf(expense({ amount: -1_000 }))).toBe(0);
  });

  it("treats a zero amount as zero outstanding", () => {
    expect(outstandingReimbursementAmountOf(expense({ amount: 0 }))).toBe(0);
  });
});

describe("isFullyReimbursed", () => {
  it("is false while nothing has been reimbursed", () => {
    expect(isFullyReimbursed(expense({ amount: 10_000 }))).toBe(false);
  });

  it("is false for a partial reimbursement", () => {
    expect(isFullyReimbursed(expense({ amount: 10_000, reimbursedAt: "2026-02-01", reimbursedAmount: 5_000 }))).toBe(
      false
    );
  });

  it("is true once the full amount has been reimbursed", () => {
    expect(isFullyReimbursed(expense({ amount: 10_000, reimbursedAt: "2026-02-01" }))).toBe(true);
  });

  it("is false for a zero-amount expense even though outstanding is technically zero", () => {
    expect(isFullyReimbursed(expense({ amount: 0 }))).toBe(false);
  });
});

describe("recordReimbursableExpense", () => {
  it("trims text fields, defaults reimbursement state to unreimbursed, and normalizes a missing due date to null", () => {
    const recorded = recordReimbursableExpense({
      id: "R-1",
      payerName: "  代表 修吾  ",
      description: "  文房具  ",
      paidDate: "2026-03-01",
      amount: 3_000,
      account: "消耗品費",
      taxCategory: "課税仕入10%",
    });

    expect(recorded).toMatchObject({
      id: "R-1",
      payerName: "代表 修吾",
      description: "文房具",
      paidDate: "2026-03-01",
      reimbursementDueDate: null,
      amount: 3_000,
      account: "消耗品費",
      reimbursedAt: null,
      reimbursedAmount: null,
    });
  });

  it("clamps a negative amount to zero", () => {
    const recorded = recordReimbursableExpense({
      payerName: "代表 修吾",
      description: "誤入力",
      paidDate: "2026-03-01",
      amount: -5_000,
      account: "消耗品費",
      taxCategory: "課税仕入10%",
    });
    expect(recorded.amount).toBe(0);
  });

  it("auto-generates an id when none is provided", () => {
    const a = recordReimbursableExpense({
      payerName: "代表 修吾",
      description: "電車代",
      paidDate: "2026-03-01",
      amount: 1_000,
      account: "旅費交通費",
      taxCategory: "課税仕入10%",
    });
    const b = recordReimbursableExpense({
      payerName: "代表 修吾",
      description: "電車代",
      paidDate: "2026-03-01",
      amount: 1_000,
      account: "旅費交通費",
      taxCategory: "課税仕入10%",
    });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});

describe("markReimbursementSettled / markReimbursementOutstanding", () => {
  it("marks a full reimbursement (no reimbursedAmount given) and does not mutate the original record", () => {
    const original = expense({ amount: 10_000 });
    const settled = markReimbursementSettled(original, "2026-02-01");

    expect(settled.reimbursedAt).toBe("2026-02-01");
    expect(settled.reimbursedAmount).toBeNull();
    expect(outstandingReimbursementAmountOf(settled)).toBe(0);
    expect(original.reimbursedAt).toBeUndefined();
  });

  it("marks a partial reimbursement when reimbursedAmount is given", () => {
    const settled = markReimbursementSettled(expense({ amount: 10_000 }), "2026-02-01", 4_000);
    expect(settled.reimbursedAmount).toBe(4_000);
    expect(outstandingReimbursementAmountOf(settled)).toBe(6_000);
  });

  it("reverts a settled expense back to outstanding", () => {
    const settled = markReimbursementSettled(expense({ amount: 10_000 }), "2026-02-01");
    const reverted = markReimbursementOutstanding(settled);
    expect(reverted.reimbursedAt).toBeNull();
    expect(reverted.reimbursedAmount).toBeNull();
    expect(outstandingReimbursementAmountOf(reverted)).toBe(10_000);
  });
});

describe("computeReimbursementsSummary - no expenses", () => {
  it("returns zeroed totals and empty buckets/lists for an empty expense list", () => {
    const summary = computeReimbursementsSummary([], AS_OF);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueReimbursements).toEqual([]);
    expect(summary.agingBuckets).toHaveLength(4);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReimbursementsSummary - all reimbursed", () => {
  it("excludes fully reimbursed expenses from outstanding totals, buckets, and the overdue list", () => {
    const expenses = [
      expense({ id: "E-1", reimbursementDueDate: "2026-01-15", reimbursedAt: "2026-01-10" }),
      expense({ id: "E-2", reimbursementDueDate: "2026-02-01", reimbursedAt: "2026-02-01", reimbursedAmount: 10_000 }),
    ];
    const summary = computeReimbursementsSummary(expenses, AS_OF);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueReimbursements).toEqual([]);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReimbursementsSummary - not yet due", () => {
  it("counts an unreimbursed expense with a future due date in totals but not in aging buckets or the overdue list", () => {
    const expenses = [expense({ reimbursementDueDate: daysBeforeAsOf(-5), amount: 4_000 })];
    const summary = computeReimbursementsSummary(expenses, AS_OF);
    expect(summary.totalOutstanding).toBe(4_000);
    expect(summary.totalOutstandingCount).toBe(1);
    expect(summary.overdueReimbursements).toEqual([]);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReimbursementsSummary - falls back to paidDate when reimbursementDueDate is absent", () => {
  it("uses paidDate as the aging reference date when reimbursementDueDate is not provided", () => {
    const expenses = [expense({ paidDate: daysBeforeAsOf(45), reimbursementDueDate: null, amount: 1_000 })];
    const summary = computeReimbursementsSummary(expenses, AS_OF);
    const bucket = summary.agingBuckets.find((b) => b.key === "31-60")!;
    expect(bucket.count).toBe(1);
    expect(bucket.amount).toBe(1_000);
    expect(summary.overdueReimbursements[0].daysOverdue).toBe(45);
    expect(summary.overdueReimbursements[0].reimbursementDueDate).toBeNull();
  });
});

describe("computeReimbursementsSummary - one overdue expense in each bucket", () => {
  it("buckets overdue expenses into 0-30 / 31-60 / 61-90 / 91+ by days overdue", () => {
    const expenses = [
      expense({ id: "E-15D", reimbursementDueDate: daysBeforeAsOf(15), amount: 1_000 }),
      expense({ id: "E-45D", reimbursementDueDate: daysBeforeAsOf(45), amount: 2_000 }),
      expense({ id: "E-75D", reimbursementDueDate: daysBeforeAsOf(75), amount: 3_000 }),
      expense({ id: "E-120D", reimbursementDueDate: daysBeforeAsOf(120), amount: 4_000 }),
    ];
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstanding).toBe(10_000);
    expect(summary.totalOutstandingCount).toBe(4);

    const byKey = Object.fromEntries(summary.agingBuckets.map((b) => [b.key, b]));
    expect(byKey["0-30"]).toMatchObject({ count: 1, amount: 1_000 });
    expect(byKey["31-60"]).toMatchObject({ count: 1, amount: 2_000 });
    expect(byKey["61-90"]).toMatchObject({ count: 1, amount: 3_000 });
    expect(byKey["91+"]).toMatchObject({ count: 1, amount: 4_000 });

    // 経過日数の降順で並んでいること
    expect(summary.overdueReimbursements.map((e) => e.id)).toEqual(["E-120D", "E-75D", "E-45D", "E-15D"]);
  });
});

describe("computeReimbursementsSummary - exact boundary days", () => {
  it.each([
    [30, "0-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "61-90"],
    [90, "61-90"],
    [91, "91+"],
  ] as const)("assigns exactly %i days overdue to the %s bucket", (days, expectedKey) => {
    const summary = computeReimbursementsSummary(
      [expense({ reimbursementDueDate: daysBeforeAsOf(days), amount: 500 })],
      AS_OF
    );
    const nonEmptyBuckets = summary.agingBuckets.filter((b) => b.count > 0);
    expect(nonEmptyBuckets).toHaveLength(1);
    expect(nonEmptyBuckets[0].key).toBe(expectedKey);
    expect(summary.overdueReimbursements[0].daysOverdue).toBe(days);
  });

  it("treats exactly 0 days overdue (due date is today) as not yet overdue", () => {
    const summary = computeReimbursementsSummary(
      [expense({ reimbursementDueDate: daysBeforeAsOf(0), amount: 500 })],
      AS_OF
    );
    expect(summary.overdueReimbursements).toEqual([]);
    summary.agingBuckets.forEach((bucket) => expect(bucket.count).toBe(0));
    expect(summary.totalOutstanding).toBe(500);
  });
});

describe("computeReimbursementsSummary - malformed dates", () => {
  it("includes an unreimbursed expense with an invalid paidDate in totals but excludes it from aging buckets and the overdue list", () => {
    const expenses = [expense({ paidDate: "not-a-date", reimbursementDueDate: null, amount: 1_500 })];
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstanding).toBe(1_500);
    expect(summary.totalOutstandingCount).toBe(1);
    expect(summary.overdueReimbursements).toEqual([]);
    summary.agingBuckets.forEach((bucket) => expect(bucket.count).toBe(0));
  });

  it("includes an unreimbursed expense with an invalid reimbursementDueDate in totals but excludes it from aging buckets and the overdue list", () => {
    const expenses = [expense({ reimbursementDueDate: "2026/07/01", amount: 2_500 })]; // wrong separator
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstanding).toBe(2_500);
    expect(summary.totalOutstandingCount).toBe(1);
    expect(summary.overdueReimbursements).toEqual([]);
  });

  it("excludes all expenses from aging when asOfDate itself is malformed but still counts totals", () => {
    const expenses = [expense({ reimbursementDueDate: daysBeforeAsOf(40), amount: 1_000 })];
    const summary = computeReimbursementsSummary(expenses, "not-a-date");

    expect(summary.totalOutstanding).toBe(1_000);
    expect(summary.overdueReimbursements).toEqual([]);
  });
});

describe("computeReimbursementsSummary - mixed reimbursed, partially reimbursed, and outstanding expenses", () => {
  it("only reflects the remaining unreimbursed balance for partially reimbursed overdue expenses", () => {
    const expenses = [
      expense({ id: "REIMBURSED", reimbursementDueDate: daysBeforeAsOf(40), reimbursedAt: "2026-01-01" }),
      expense({
        id: "PARTIAL",
        reimbursementDueDate: daysBeforeAsOf(40),
        amount: 10_000,
        reimbursedAt: "2026-01-01",
        reimbursedAmount: 6_000,
      }),
      expense({ id: "OUTSTANDING", reimbursementDueDate: daysBeforeAsOf(40), amount: 2_000 }),
    ];
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstandingCount).toBe(2);
    expect(summary.totalOutstanding).toBe(6_000);

    const bucket = summary.agingBuckets.find((b) => b.key === "31-60")!;
    expect(bucket.count).toBe(2);
    expect(bucket.amount).toBe(6_000);

    expect(summary.overdueReimbursements.map((e) => e.id).sort()).toEqual(["OUTSTANDING", "PARTIAL"]);
  });
});

describe("computeReimbursementsSummary - reimbursed after spanning multiple fiscal years", () => {
  it("computes a large days-overdue figure correctly for an expense outstanding across several fiscal years", () => {
    // 3年以上前（2023年）に立て替えたまま、今日（2026-07-30）時点でも未精算という想定。
    const expenses = [expense({ id: "OLD", paidDate: "2023-04-01", reimbursementDueDate: null, amount: 7_000 })];
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstanding).toBe(7_000);
    expect(summary.overdueReimbursements).toHaveLength(1);
    expect(summary.overdueReimbursements[0].daysOverdue).toBeGreaterThan(365 * 3);
    const bucket = summary.agingBuckets.find((b) => b.key === "91+")!;
    expect(bucket.count).toBe(1);
    expect(bucket.amount).toBe(7_000);
  });

  it("shows zero outstanding once an expense from a prior fiscal year is fully reimbursed this fiscal year", () => {
    const expenses = [
      expense({
        id: "OLD-SETTLED",
        paidDate: "2024-05-10",
        reimbursementDueDate: "2024-06-10",
        amount: 12_000,
        reimbursedAt: "2026-07-15", // 翌々事業年度になってからようやく精算
      }),
    ];
    const summary = computeReimbursementsSummary(expenses, AS_OF);

    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueReimbursements).toEqual([]);
    summary.agingBuckets.forEach((bucket) => {
      expect(bucket.count).toBe(0);
      expect(bucket.amount).toBe(0);
    });
  });
});

describe("computeReimbursementsSummary - zero outstanding", () => {
  it("treats a zero-amount expense as having nothing outstanding", () => {
    const summary = computeReimbursementsSummary(
      [expense({ amount: 0, reimbursementDueDate: daysBeforeAsOf(40) })],
      AS_OF
    );
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.overdueReimbursements).toEqual([]);
  });

  it("treats an over-reimbursed expense (reimbursedAmount > amount) as zero outstanding, not negative", () => {
    const summary = computeReimbursementsSummary(
      [
        expense({
          amount: 5_000,
          reimbursementDueDate: daysBeforeAsOf(40),
          reimbursedAt: "2026-01-01",
          reimbursedAmount: 9_999,
        }),
      ],
      AS_OF
    );
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
  });
});

describe("buildReimbursementJournalEntrySuggestion", () => {
  it("returns null when there is nothing to record (zero amount)", () => {
    expect(buildReimbursementJournalEntrySuggestion(expense({ amount: 0 }))).toBeNull();
  });

  it("builds an expense/liability pair that nets to zero (no cash movement) and no settlement entry while unreimbursed", () => {
    const suggestion = buildReimbursementJournalEntrySuggestion(expense({ amount: 8_000 }))!;

    expect(suggestion.expenseEntry.amount).toBe(-8_000);
    expect(suggestion.expenseEntry.account).toBe("旅費交通費");
    expect(suggestion.expenseEntry.date).toBe("2026-01-01");

    expect(suggestion.liabilityEntry.amount).toBe(8_000);
    expect(suggestion.liabilityEntry.account).toBe(REIMBURSEMENT_LIABILITY_ACCOUNT);
    expect(suggestion.liabilityEntry.taxCategory).toBe(REIMBURSEMENT_LIABILITY_TAX_CATEGORY);
    expect(suggestion.liabilityEntry.date).toBe("2026-01-01");

    // 現金及び預金は動いていないため、2行の合計は必ず0円になる
    expect(suggestion.expenseEntry.amount + suggestion.liabilityEntry.amount).toBe(0);

    expect(suggestion.settlementEntry).toBeNull();
  });

  it("builds a settlement entry (negative 未払金) dated at reimbursedAt once fully reimbursed", () => {
    const suggestion = buildReimbursementJournalEntrySuggestion(
      expense({ amount: 8_000, reimbursedAt: "2026-02-15" })
    )!;

    expect(suggestion.settlementEntry).not.toBeNull();
    expect(suggestion.settlementEntry!.amount).toBe(-8_000);
    expect(suggestion.settlementEntry!.account).toBe(REIMBURSEMENT_LIABILITY_ACCOUNT);
    expect(suggestion.settlementEntry!.date).toBe("2026-02-15");
  });

  it("builds a settlement entry for only the partially reimbursed amount", () => {
    const suggestion = buildReimbursementJournalEntrySuggestion(
      expense({ amount: 8_000, reimbursedAt: "2026-02-15", reimbursedAmount: 3_000 })
    )!;

    expect(suggestion.settlementEntry!.amount).toBe(-3_000);
  });

  it("produces journal entries that keep the trial balance in balance, both before and after settlement", () => {
    const unsettled = buildReimbursementJournalEntrySuggestion(expense({ id: "TB-1", amount: 8_000 }))!;
    const entriesBeforeSettlement: CategorizedTransaction[] = [unsettled.expenseEntry, unsettled.liabilityEntry];

    const tbBefore = buildTrialBalance(entriesBeforeSettlement);
    expect(isTrialBalanceBalanced(tbBefore)).toBe(true);
    const liabilityLineBefore = tbBefore.lines.find((l) => l.account === REIMBURSEMENT_LIABILITY_ACCOUNT)!;
    // 未払金は貸方残高（未精算の負債）なので closingBalance はマイナスで表される
    expect(liabilityLineBefore.closingBalance).toBe(-8_000);

    const settled = buildReimbursementJournalEntrySuggestion(
      expense({ id: "TB-1", amount: 8_000, reimbursedAt: "2026-03-01" })
    )!;
    const entriesAfterSettlement: CategorizedTransaction[] = [
      settled.expenseEntry,
      settled.liabilityEntry,
      settled.settlementEntry!,
    ];

    const tbAfter = buildTrialBalance(entriesAfterSettlement);
    expect(isTrialBalanceBalanced(tbAfter)).toBe(true);
    const liabilityLineAfter = tbAfter.lines.find((l) => l.account === REIMBURSEMENT_LIABILITY_ACCOUNT)!;
    // 精算が完了すると未払金の残高は0になる
    expect(liabilityLineAfter.closingBalance).toBe(0);
  });
});
