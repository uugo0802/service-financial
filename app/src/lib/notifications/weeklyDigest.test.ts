import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { ReconciliationResult } from "../reconcile/bankReconciliation";
import {
  DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS,
  WEEKLY_DIGEST_PERIOD_DAYS,
  WeeklyDigestInput,
  buildWeeklyDigest,
} from "./weeklyDigest";

function ruleConfirmedTx(overrides: Partial<CategorizedTransaction> = {}): CategorizedTransaction {
  return {
    id: "tx-rule",
    date: "2026-07-01",
    description: "サンプル取引",
    amount: -1000,
    account: "旅費交通費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

function lowConfidenceTx(overrides: Partial<CategorizedTransaction> = {}): CategorizedTransaction {
  return {
    id: "tx-low",
    date: "2026-07-01",
    description: "要確認の取引",
    amount: -2000,
    account: "要確認",
    taxCategory: "要確認",
    confidence: 0.4,
    source: "uncategorized",
    ...overrides,
  };
}

function reconciliation(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    transactionCount: 10,
    netTransactionAmount: 780_000,
    openingBalance: 1_000_000,
    expectedClosingBalance: 1_780_000,
    actualClosingBalance: 1_780_000,
    discrepancy: 0,
    toleranceYen: 1,
    isReconciled: true,
    hint: null,
    ...overrides,
  };
}

describe("buildWeeklyDigest - empty state", () => {
  it("reports nothing needs attention when there is no review queue, no near-term deadline, and no unreconciled data", () => {
    // 2026-01-10 は所得税(3/15)まで64日、消費税(3/31)まで80日あり、既定の30日窓には入らない
    const input: WeeklyDigestInput = {
      asOf: "2026-01-10",
      categorizedTransactions: [ruleConfirmedTx(), ruleConfirmedTx({ id: "tx-rule-2" })],
      filing: { entityType: "individual" },
    };

    const digest = buildWeeklyDigest(input);

    expect(digest.pendingReviewCount).toBe(0);
    expect(digest.upcomingDeadlines).toEqual([]);
    expect(digest.unreconciledCount).toBe(0);
    expect(digest.headline).toBe("今週は特に対応が必要な項目はありません。");
  });

  it("treats an omitted categorizedTransactions/reconciliations as empty rather than throwing", () => {
    const digest = buildWeeklyDigest({
      asOf: "2026-01-10",
      filing: { entityType: "individual" },
    });

    expect(digest.pendingReviewCount).toBe(0);
    expect(digest.unreconciledCount).toBe(0);
  });
});

describe("buildWeeklyDigest - mixed state", () => {
  it("combines pending review count, near-term deadlines, and unreconciled counts, and reflects them all in the headline", () => {
    const input: WeeklyDigestInput = {
      asOf: "2026-02-20", // 所得税申告(2026-03-15)まで23日 -> 30日窓内
      categorizedTransactions: [
        ruleConfirmedTx(),
        lowConfidenceTx({ id: "tx-low-1" }),
        lowConfidenceTx({ id: "tx-low-2" }),
      ],
      filing: { entityType: "individual" },
      reconciliations: [reconciliation({ isReconciled: true }), reconciliation({ isReconciled: false, transactionCount: 5 })],
    };

    const digest = buildWeeklyDigest(input);

    expect(digest.pendingReviewCount).toBe(2);
    expect(digest.upcomingDeadlines.map((d) => d.id)).toEqual(["individual-income-tax"]);
    expect(digest.upcomingDeadlines[0].daysRemaining).toBe(23);
    expect(digest.unreconciledCount).toBe(5);

    expect(digest.headline).toContain("レビュー待ちが2件");
    expect(digest.headline).toContain("所得税確定申告（下書き）");
    expect(digest.headline).toContain("未突合の取引が5件");
  });

  it("sums unreconciled counts across multiple unreconciled reconciliation results", () => {
    const digest = buildWeeklyDigest({
      asOf: "2026-01-10",
      filing: { entityType: "corporate", fiscalYearEndMonth: 3 },
      reconciliations: [
        reconciliation({ isReconciled: false, transactionCount: 3 }),
        reconciliation({ isReconciled: false, transactionCount: 7 }),
        reconciliation({ isReconciled: true, transactionCount: 100 }),
      ],
    });

    expect(digest.unreconciledCount).toBe(10);
  });

  it("orders upcomingDeadlines by days remaining, matching getUpcomingFilingDeadlines' own sort", () => {
    const digest = buildWeeklyDigest({
      asOf: "2026-05-25", // fiscalYearEndMonth=3 -> 法人税等の期限は2026-05-31、6日後
      filing: { entityType: "corporate", fiscalYearEndMonth: 3 },
    });

    expect(digest.upcomingDeadlines.map((d) => d.id)).toEqual(["corporate-local-tax", "corporate-national-tax"]);
    expect(digest.upcomingDeadlines.every((d) => d.daysRemaining === 6)).toBe(true);
  });
});

describe("buildWeeklyDigest - period boundaries", () => {
  it("sets periodStart to asOf and periodEnd exactly WEEKLY_DIGEST_PERIOD_DAYS-1 days later", () => {
    const digest = buildWeeklyDigest({ asOf: "2026-07-30", filing: { entityType: "individual" } });

    expect(digest.periodStart).toBe("2026-07-30");
    expect(WEEKLY_DIGEST_PERIOD_DAYS).toBe(7);
    expect(digest.periodEnd).toBe("2026-08-05");
  });

  it("rolls periodEnd across a month/year boundary correctly", () => {
    const digest = buildWeeklyDigest({ asOf: "2026-12-28", filing: { entityType: "individual" } });
    expect(digest.periodEnd).toBe("2027-01-03");
  });
});

describe("buildWeeklyDigest - deadline window boundary (exactly at the 30-day edge)", () => {
  it("includes a deadline that is exactly DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS(=30) days away", () => {
    expect(DEFAULT_UPCOMING_DEADLINE_WINDOW_DAYS).toBe(30);

    // 2026-02-13 -> 所得税確定申告(2026-03-15)まで、ちょうど30日
    const digest = buildWeeklyDigest({ asOf: "2026-02-13", filing: { entityType: "individual" } });

    const incomeTax = digest.upcomingDeadlines.find((d) => d.id === "individual-income-tax");
    expect(incomeTax).toBeDefined();
    expect(incomeTax?.daysRemaining).toBe(30);
  });

  it("excludes a deadline that is 31 days away, one day beyond the window", () => {
    // 2026-02-12 -> 所得税確定申告(2026-03-15)まで31日
    const digest = buildWeeklyDigest({ asOf: "2026-02-12", filing: { entityType: "individual" } });

    expect(digest.upcomingDeadlines.find((d) => d.id === "individual-income-tax")).toBeUndefined();
  });

  it("respects a custom upcomingDeadlineWindowDays override", () => {
    // 2026-02-12 -> 31日後。窓を31日に広げれば含まれる
    const digest = buildWeeklyDigest({
      asOf: "2026-02-12",
      filing: { entityType: "individual" },
      upcomingDeadlineWindowDays: 31,
    });

    const incomeTax = digest.upcomingDeadlines.find((d) => d.id === "individual-income-tax");
    expect(incomeTax?.daysRemaining).toBe(31);
  });
});

describe("buildWeeklyDigest - invalid input", () => {
  it("throws when asOf is not a valid YYYY-MM-DD string", () => {
    expect(() => buildWeeklyDigest({ asOf: "not-a-date", filing: { entityType: "individual" } })).toThrow(
      /invalid ISO date/
    );
  });
});
