import { describe, expect, it } from "vitest";
import {
  DEADLINE_GENERAL_INFO_NOTICE,
  DUE_SOON_THRESHOLD_DAYS,
  getCorporateFilingDeadline,
  getCorporateFiscalYearEndDate,
  getDeadlineReminder,
  getDeadlineReminders,
  getIncomeTaxFilingDeadline,
  getIndividualConsumptionTaxFilingDeadline,
  getIndividualDeadlineTasks,
  getMicroCorporationDeadlineTasks,
  getNextDeadlineReminder,
  DeadlineTask,
} from "./deadlineReminders";

// 税理士法対応の要件: 期限は「一般的な日付計算」であり、個別の延長相談には応じない旨を
// 必ず明示する。これを自動テストで担保し、将来の文言変更でこの前提が崩れないようにする。
describe("DEADLINE_GENERAL_INFO_NOTICE", () => {
  it("discloses that deadlines are general date calculations and individual extension requests are out of scope", () => {
    expect(DEADLINE_GENERAL_INFO_NOTICE).toMatch(/一般的な/);
    expect(DEADLINE_GENERAL_INFO_NOTICE).toMatch(/相談には対応できません/);
  });
});

describe("getIncomeTaxFilingDeadline (個人事業主: 所得税確定申告)", () => {
  it("falls on the following year's March 15 when no weekend adjustment is needed", () => {
    // 2023-03-15 is a Wednesday
    expect(getIncomeTaxFilingDeadline(2022)).toBe("2023-03-15");
  });

  it("rolls forward to the following Monday when March 15 falls on a Saturday", () => {
    // 2025-03-15 is a Saturday; the real-world 令和6年分 deadline was indeed moved to 2025-03-17
    expect(getIncomeTaxFilingDeadline(2024)).toBe("2025-03-17");
  });

  it("rejects an unreasonable tax year", () => {
    expect(() => getIncomeTaxFilingDeadline(1500)).toThrow();
  });
});

describe("getIndividualConsumptionTaxFilingDeadline (個人事業主: 消費税確定申告)", () => {
  it("falls on the following year's March 31 when no weekend adjustment is needed", () => {
    // 2025-03-31 is a Monday
    expect(getIndividualConsumptionTaxFilingDeadline(2024)).toBe("2025-03-31");
  });

  it("differs from the income tax deadline even in the same filing year", () => {
    const income = getIncomeTaxFilingDeadline(2024);
    const consumption = getIndividualConsumptionTaxFilingDeadline(2024);
    expect(income).toBe("2025-03-17");
    expect(consumption).toBe("2025-03-31");
  });
});

describe("getIndividualDeadlineTasks", () => {
  it("includes only the income tax task when the user is not invoice-registered", () => {
    const tasks = getIndividualDeadlineTasks({ taxYear: 2025, isInvoiceRegistered: false });
    expect(tasks.map((t) => t.category)).toEqual(["income-tax"]);
  });

  it("includes both income tax and consumption tax tasks when invoice-registered", () => {
    const tasks = getIndividualDeadlineTasks({ taxYear: 2025, isInvoiceRegistered: true });
    expect(tasks.map((t) => t.category)).toEqual(["income-tax", "consumption-tax"]);
    expect(tasks.every((t) => t.dueDate.length > 0)).toBe(true);
  });
});

describe("getCorporateFiscalYearEndDate (マイクロ法人: 決算日)", () => {
  it("returns the last day of the fiscal year end month", () => {
    expect(getCorporateFiscalYearEndDate(3, 2027)).toBe("2027-03-31");
    expect(getCorporateFiscalYearEndDate(4, 2027)).toBe("2027-04-30");
  });

  it("handles February in a leap year", () => {
    expect(getCorporateFiscalYearEndDate(2, 2028)).toBe("2028-02-29");
  });

  it("handles February in a non-leap year", () => {
    expect(getCorporateFiscalYearEndDate(2, 2027)).toBe("2027-02-28");
  });

  it("rejects an out-of-range month", () => {
    expect(() => getCorporateFiscalYearEndDate(0, 2027)).toThrow();
    expect(() => getCorporateFiscalYearEndDate(13, 2027)).toThrow();
  });
});

describe("getCorporateFilingDeadline (マイクロ法人: 法人税等の申告期限)", () => {
  it("is two months after the fiscal year end, keeping end-of-month, when no weekend adjustment is needed", () => {
    // fiscal year end 2027-03-31 -> +2 months -> 2027-05-31, which is a Monday
    const fiscalYearEnd = getCorporateFiscalYearEndDate(3, 2027);
    expect(getCorporateFilingDeadline(fiscalYearEnd)).toBe("2027-05-31");
  });

  it("keeps end-of-month semantics across a leap-year February fiscal year end, and rolls forward off a Sunday", () => {
    // fiscal year end 2028-02-29 (leap year) -> +2 months -> 2028-04-30, which is a Sunday
    // -> rolls forward to 2028-05-01 (Monday). This also exercises the case where the
    // weekend roll pushes the deadline into the following month.
    const fiscalYearEnd = getCorporateFiscalYearEndDate(2, 2028);
    expect(fiscalYearEnd).toBe("2028-02-29");
    expect(getCorporateFilingDeadline(fiscalYearEnd)).toBe("2028-05-01");
  });

  it("keeps end-of-month semantics across a non-leap-year February fiscal year end", () => {
    // fiscal year end 2027-02-28 (non-leap) -> +2 months -> end of April, not day 28
    const fiscalYearEnd = getCorporateFiscalYearEndDate(2, 2027);
    expect(getCorporateFilingDeadline(fiscalYearEnd)).toBe("2027-04-30");
  });
});

describe("getMicroCorporationDeadlineTasks", () => {
  it("returns corporate tax and corporate consumption tax tasks sharing the same due date", () => {
    const tasks = getMicroCorporationDeadlineTasks({ fiscalYearEndMonth: 3, fiscalYearEndCalendarYear: 2027 });
    expect(tasks.map((t) => t.category)).toEqual(["corporate-tax", "corporate-consumption-tax"]);
    expect(tasks[0].dueDate).toBe("2027-05-31");
    expect(tasks[1].dueDate).toBe("2027-05-31");
  });
});

describe("getDeadlineReminder (status/daysRemaining)", () => {
  const task: DeadlineTask = {
    id: "t1",
    category: "income-tax",
    title: "テストタスク",
    description: "テスト用",
    basis: "テスト用",
    dueDate: "2027-03-15",
  };

  it("is 'upcoming' when the deadline is well in the future", () => {
    const reminder = getDeadlineReminder(task, "2027-01-01");
    expect(reminder.status).toBe("upcoming");
    expect(reminder.daysRemaining).toBe(73);
  });

  it("is 'due-soon' exactly at the threshold boundary", () => {
    // 2027-03-15 minus DUE_SOON_THRESHOLD_DAYS days
    const reminder = getDeadlineReminder(task, "2027-03-01");
    expect(reminder.daysRemaining).toBe(DUE_SOON_THRESHOLD_DAYS);
    expect(reminder.status).toBe("due-soon");
  });

  it("is 'upcoming' one day beyond the due-soon threshold", () => {
    const reminder = getDeadlineReminder(task, "2027-02-28");
    expect(reminder.daysRemaining).toBe(DUE_SOON_THRESHOLD_DAYS + 1);
    expect(reminder.status).toBe("upcoming");
  });

  it("is 'due-soon' with zero days remaining on the due date itself", () => {
    const reminder = getDeadlineReminder(task, "2027-03-15");
    expect(reminder.daysRemaining).toBe(0);
    expect(reminder.status).toBe("due-soon");
  });

  it("is 'overdue' with a negative daysRemaining after the due date has passed", () => {
    const reminder = getDeadlineReminder(task, "2027-03-20");
    expect(reminder.daysRemaining).toBe(-5);
    expect(reminder.status).toBe("overdue");
  });
});

describe("getDeadlineReminders / getNextDeadlineReminder", () => {
  it("sorts reminders by due date ascending and surfaces the earliest as 'next'", () => {
    const tasks = getIndividualDeadlineTasks({ taxYear: 2024, isInvoiceRegistered: true });
    // income tax: 2025-03-17 (rolled from Saturday), consumption tax: 2025-03-31
    const reminders = getDeadlineReminders(tasks, "2025-01-01");
    expect(reminders.map((r) => r.category)).toEqual(["income-tax", "consumption-tax"]);

    const next = getNextDeadlineReminder(tasks, "2025-01-01");
    expect(next?.category).toBe("income-tax");
    expect(next?.dueDate).toBe("2025-03-17");
  });

  it("still surfaces an overdue task as 'next' when it is the earliest by date", () => {
    const tasks = getIndividualDeadlineTasks({ taxYear: 2024, isInvoiceRegistered: true });
    // asOf is after the income tax deadline but before the consumption tax deadline
    const next = getNextDeadlineReminder(tasks, "2025-03-20");
    expect(next?.category).toBe("income-tax");
    expect(next?.status).toBe("overdue");
    expect(next?.daysRemaining).toBe(-3);
  });

  it("returns undefined for an empty task list", () => {
    expect(getNextDeadlineReminder([], "2025-01-01")).toBeUndefined();
  });
});
