import { describe, expect, it } from "vitest";
import { classifyUrgency, getUpcomingFilingDeadlines } from "./deadlines";

describe("getUpcomingFilingDeadlines / individual", () => {
  it("returns both individual deadlines sorted by days remaining, well before either due date", () => {
    const result = getUpcomingFilingDeadlines({ entityType: "individual", referenceDate: "2026-01-10" });

    expect(result.map((d) => d.id)).toEqual(["individual-income-tax", "individual-consumption-tax"]);
    expect(result[0].dueDate).toBe("2026-03-15");
    expect(result[0].daysRemaining).toBe(64);
    expect(result[1].dueDate).toBe("2026-03-31");
    expect(result[1].daysRemaining).toBe(80);
  });

  it("treats a deadline that is exactly today as 0 days remaining and does not roll it forward", () => {
    const result = getUpcomingFilingDeadlines({ entityType: "individual", referenceDate: "2026-03-15" });
    const incomeTax = result.find((d) => d.id === "individual-income-tax")!;

    expect(incomeTax.dueDate).toBe("2026-03-15");
    expect(incomeTax.daysRemaining).toBe(0);
    expect(incomeTax.urgency).toBe("urgent");
  });

  it("rolls a just-passed deadline forward to next year", () => {
    const result = getUpcomingFilingDeadlines({ entityType: "individual", referenceDate: "2026-03-16" });
    const incomeTax = result.find((d) => d.id === "individual-income-tax")!;

    expect(incomeTax.dueDate).toBe("2027-03-15");
    expect(incomeTax.daysRemaining).toBe(364);
  });

  it("accepts a Date object and reads its local calendar fields", () => {
    const result = getUpcomingFilingDeadlines({
      entityType: "individual",
      referenceDate: new Date(2026, 2, 1), // 2026-03-01 local time
    });

    expect(result[0].dueDate).toBe("2026-03-15");
    expect(result[0].daysRemaining).toBe(14);
  });
});

describe("getUpcomingFilingDeadlines / corporate", () => {
  it("defaults to a March fiscal year end when none is given (due date end of May)", () => {
    const result = getUpcomingFilingDeadlines({ entityType: "corporate", referenceDate: "2026-01-01" });

    expect(result.every((d) => d.dueDate === "2026-05-31")).toBe(true);
    expect(result.map((d) => d.id).sort()).toEqual(["corporate-local-tax", "corporate-national-tax"]);
  });

  it("computes the due date as the last day of the month two months after a non-wrapping fiscal year end", () => {
    const result = getUpcomingFilingDeadlines({
      entityType: "corporate",
      referenceDate: "2026-01-01",
      fiscalYearEndMonth: 6,
    });

    expect(result[0].dueDate).toBe("2026-08-31");
  });

  it("wraps the due month across the year boundary for a fiscal year end late in the year", () => {
    // 決算月11月 → 申告期限は1月末（月またぎのラップアラウンド）
    const result = getUpcomingFilingDeadlines({
      entityType: "corporate",
      referenceDate: "2026-10-01",
      fiscalYearEndMonth: 11,
    });

    expect(result[0].dueDate).toBe("2027-01-31");
  });

  it("resolves the last day of February correctly across a leap year", () => {
    // 決算月12月 → 申告期限は2月末。2028年はうるう年なので2/29になる。
    const leapResult = getUpcomingFilingDeadlines({
      entityType: "corporate",
      referenceDate: "2028-01-01",
      fiscalYearEndMonth: 12,
    });
    expect(leapResult[0].dueDate).toBe("2028-02-29");

    const nonLeapResult = getUpcomingFilingDeadlines({
      entityType: "corporate",
      referenceDate: "2026-01-01",
      fiscalYearEndMonth: 12,
    });
    expect(nonLeapResult[0].dueDate).toBe("2026-02-28");
  });

  it("rolls a just-passed corporate deadline forward to next year", () => {
    const result = getUpcomingFilingDeadlines({
      entityType: "corporate",
      referenceDate: "2026-06-01",
      fiscalYearEndMonth: 3,
    });

    expect(result[0].dueDate).toBe("2027-05-31");
  });

  it("rejects an out-of-range fiscal year end month", () => {
    expect(() =>
      getUpcomingFilingDeadlines({ entityType: "corporate", referenceDate: "2026-01-01", fiscalYearEndMonth: 0 }),
    ).toThrow();
    expect(() =>
      getUpcomingFilingDeadlines({ entityType: "corporate", referenceDate: "2026-01-01", fiscalYearEndMonth: 13 }),
    ).toThrow();
    expect(() =>
      getUpcomingFilingDeadlines({ entityType: "corporate", referenceDate: "2026-01-01", fiscalYearEndMonth: 1.5 }),
    ).toThrow();
  });
});

describe("classifyUrgency", () => {
  it("classifies days remaining into urgent/warning/normal buckets", () => {
    expect(classifyUrgency(0)).toBe("urgent");
    expect(classifyUrgency(14)).toBe("urgent");
    expect(classifyUrgency(15)).toBe("warning");
    expect(classifyUrgency(45)).toBe("warning");
    expect(classifyUrgency(46)).toBe("normal");
  });
});
