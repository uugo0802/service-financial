import { describe, expect, it } from "vitest";
import { PricingPlan } from "../pricing/plans";
import {
  ChargeRecord,
  Subscription,
  buildCurrentSubscriptionView,
  buildReceiptHistory,
  buildReceiptPrintFields,
  computeNextBillingDate,
  detectMostRecentPlanChange,
  formatBillingDateLabel,
  formatNextBillingDateLabel,
  resolveCurrentPlanName,
  summarizeBillingHistory,
} from "./subscriptionBilling";

const PLANS: PricingPlan[] = [
  {
    id: "freelance",
    name: "フリーランスプラン",
    targetSegment: "フリーランス",
    monthlyPriceFrom: 980,
    features: ["機能A"],
  },
  {
    id: "micro-corp",
    name: "マイクロ法人プラン",
    targetSegment: "マイクロ法人",
    monthlyPriceFrom: 2980,
    features: ["機能B"],
  },
];

function baseSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    tenantId: "tenant-1",
    planId: "freelance",
    status: "active",
    currentPeriodStart: "2026-07-01",
    currentPeriodEnd: "2026-07-31",
    ...overrides,
  };
}

function charge(overrides: Partial<ChargeRecord> = {}): ChargeRecord {
  return {
    id: "chg-1",
    date: "2026-07-01",
    amount: 980,
    planId: "freelance",
    planName: "フリーランスプラン",
    receiptNumber: "R-2026-0001",
    ...overrides,
  };
}

describe("formatBillingDateLabel", () => {
  it("formats a valid ISO date", () => {
    expect(formatBillingDateLabel("2026-07-31")).toBe("2026年7月31日");
  });

  it("returns 未設定 for missing or invalid dates", () => {
    expect(formatBillingDateLabel(null)).toBe("未設定");
    expect(formatBillingDateLabel(undefined)).toBe("未設定");
    expect(formatBillingDateLabel("not-a-date")).toBe("未設定");
  });
});

describe("resolveCurrentPlanName", () => {
  it("resolves the plan name from the catalog", () => {
    expect(resolveCurrentPlanName(baseSubscription({ planId: "micro-corp" }), PLANS)).toBe("マイクロ法人プラン");
  });

  it("falls back to a placeholder label for an unknown planId", () => {
    expect(resolveCurrentPlanName(baseSubscription({ planId: "legacy-plan" }), PLANS)).toBe("不明なプラン（legacy-plan）");
  });
});

describe("computeNextBillingDate / formatNextBillingDateLabel", () => {
  it("uses currentPeriodEnd as the next billing date while active", () => {
    const subscription = baseSubscription({ status: "active" });
    expect(computeNextBillingDate(subscription)).toBe("2026-07-31");
    expect(formatNextBillingDateLabel(subscription)).toBe("2026年7月31日");
  });

  it("still reports the trial end date as the next billing date while trialing", () => {
    const subscription = baseSubscription({ status: "trialing", currentPeriodEnd: "2026-08-14" });
    expect(computeNextBillingDate(subscription)).toBe("2026-08-14");
  });

  it("returns null once the subscription is canceled", () => {
    const subscription = baseSubscription({ status: "canceled" });
    expect(computeNextBillingDate(subscription)).toBeNull();
    expect(formatNextBillingDateLabel(subscription)).toBe("解約済みのため次回請求はありません");
  });

  it("returns null when currentPeriodEnd is not a valid ISO date", () => {
    const subscription = baseSubscription({ currentPeriodEnd: "" });
    expect(computeNextBillingDate(subscription)).toBeNull();
    expect(formatNextBillingDateLabel(subscription)).toBe("未設定");
  });
});

describe("buildCurrentSubscriptionView", () => {
  it("assembles a display-ready summary of the current plan", () => {
    const view = buildCurrentSubscriptionView(baseSubscription(), PLANS);
    expect(view).toEqual({
      planId: "freelance",
      planName: "フリーランスプラン",
      status: "active",
      statusLabel: "契約中",
      currentPeriodStartLabel: "2026年7月1日",
      currentPeriodEndLabel: "2026年7月31日",
      nextBillingDate: "2026-07-31",
      nextBillingDateLabel: "2026年7月31日",
    });
  });
});

describe("buildReceiptHistory - no billing history yet", () => {
  it("returns an empty list when there are no charge records", () => {
    expect(buildReceiptHistory([])).toEqual([]);
  });

  it("summarizeBillingHistory reports hasHistory:false with zero totals", () => {
    const summary = summarizeBillingHistory([]);
    expect(summary).toEqual({
      hasHistory: false,
      chargeCount: 0,
      totalPaidAmount: 0,
      latestPlanId: null,
    });
  });
});

describe("buildReceiptHistory - ordering and labels", () => {
  it("sorts newest first and attaches display labels", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", receiptNumber: "R-2026-0001" }),
      charge({ id: "chg-2", date: "2026-07-01", receiptNumber: "R-2026-0002" }),
    ]);

    expect(history.map((h) => h.id)).toEqual(["chg-2", "chg-1"]);
    expect(history[0].dateLabel).toBe("2026年7月1日");
    expect(history.every((h) => h.isZeroAmount === false)).toBe(true);
  });

  it("breaks ties on the same date by receiptNumber descending", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-07-15", receiptNumber: "R-2026-0001" }),
      charge({ id: "chg-2", date: "2026-07-15", receiptNumber: "R-2026-0002" }),
    ]);
    expect(history.map((h) => h.id)).toEqual(["chg-2", "chg-1"]);
  });
});

describe("plan upgrade/downgrade mid-period", () => {
  it("keeps each historical charge's own planName even after the tenant changes plans", () => {
    const charges: ChargeRecord[] = [
      charge({ id: "chg-1", date: "2026-06-01", planId: "freelance", planName: "フリーランスプラン", receiptNumber: "R-2026-0001", amount: 980 }),
      // 期中（6/15）にマイクロ法人プランへアップグレードし、日割り分が別途請求されたケース
      charge({ id: "chg-2", date: "2026-06-15", planId: "micro-corp", planName: "マイクロ法人プラン", receiptNumber: "R-2026-0002", amount: 1600 }),
      charge({ id: "chg-3", date: "2026-07-01", planId: "micro-corp", planName: "マイクロ法人プラン", receiptNumber: "R-2026-0003", amount: 2980 }),
    ];

    const history = buildReceiptHistory(charges);
    expect(history.map((h) => `${h.date}:${h.planId}:${h.amount}`)).toEqual([
      "2026-07-01:micro-corp:2980",
      "2026-06-15:micro-corp:1600",
      "2026-06-01:freelance:980",
    ]);

    const summary = summarizeBillingHistory(charges);
    expect(summary).toEqual({
      hasHistory: true,
      chargeCount: 3,
      totalPaidAmount: 980 + 1600 + 2980,
      latestPlanId: "micro-corp",
    });
  });

  it("detects the most recent plan change between the two latest charges", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", planId: "freelance", planName: "フリーランスプラン", receiptNumber: "R-2026-0001" }),
      charge({ id: "chg-2", date: "2026-06-15", planId: "micro-corp", planName: "マイクロ法人プラン", receiptNumber: "R-2026-0002" }),
    ]);

    expect(detectMostRecentPlanChange(history)).toEqual({
      fromPlanId: "freelance",
      toPlanId: "micro-corp",
      effectiveDate: "2026-06-15",
    });
  });

  it("reports downgrades the same way as upgrades", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", planId: "micro-corp", receiptNumber: "R-2026-0001" }),
      charge({ id: "chg-2", date: "2026-07-01", planId: "freelance", receiptNumber: "R-2026-0002" }),
    ]);

    expect(detectMostRecentPlanChange(history)).toEqual({
      fromPlanId: "micro-corp",
      toPlanId: "freelance",
      effectiveDate: "2026-07-01",
    });
  });

  it("returns null when the plan did not change between the two latest charges", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", planId: "freelance", receiptNumber: "R-2026-0001" }),
      charge({ id: "chg-2", date: "2026-07-01", planId: "freelance", receiptNumber: "R-2026-0002" }),
    ]);
    expect(detectMostRecentPlanChange(history)).toBeNull();
  });

  it("returns null when there is fewer than two charges", () => {
    expect(detectMostRecentPlanChange([])).toBeNull();
    expect(detectMostRecentPlanChange(buildReceiptHistory([charge()]))).toBeNull();
  });
});

describe("zero-amount trial periods", () => {
  it("marks a 0-yen charge as isZeroAmount and still includes it in the count", () => {
    const history = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", amount: 0, planName: "フリーランスプラン（無料トライアル）", receiptNumber: "R-2026-0000" }),
    ]);

    expect(history[0].isZeroAmount).toBe(true);
    expect(history[0].amount).toBe(0);
  });

  it("excludes 0-yen charges from the paid total but still counts them", () => {
    const charges: ChargeRecord[] = [
      charge({ id: "chg-1", date: "2026-06-01", amount: 0, receiptNumber: "R-2026-0000", planName: "無料トライアル" }),
      charge({ id: "chg-2", date: "2026-07-01", amount: 980, receiptNumber: "R-2026-0001" }),
    ];
    const summary = summarizeBillingHistory(charges);
    expect(summary.chargeCount).toBe(2);
    expect(summary.totalPaidAmount).toBe(980);
    expect(summary.hasHistory).toBe(true);
  });

  it("includes a 無料トライアル note in the print fields for a 0-yen receipt", () => {
    const [entry] = buildReceiptHistory([
      charge({ id: "chg-1", date: "2026-06-01", amount: 0, receiptNumber: "R-2026-0000", planName: "フリーランスプラン" }),
    ]);
    const fields = buildReceiptPrintFields(entry, "サンプル合同会社");
    const amountField = fields.find((f) => f.key === "amount");
    expect(amountField?.value).toContain("無料トライアル");
    expect(fields.find((f) => f.key === "tenantName")?.value).toBe("サンプル合同会社");
  });
});

describe("buildReceiptPrintFields", () => {
  it("falls back to a placeholder tenant name when none is provided", () => {
    const [entry] = buildReceiptHistory([charge()]);
    const fields = buildReceiptPrintFields(entry);
    expect(fields.find((f) => f.key === "tenantName")?.value).toBe("（未入力）");
    expect(fields.find((f) => f.key === "receiptNumber")?.value).toBe("R-2026-0001");
  });
});
