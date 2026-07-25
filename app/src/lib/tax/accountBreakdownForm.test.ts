import { describe, expect, it } from "vitest";
import { buildAccountBreakdownForms } from "./accountBreakdownForm";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildAccountBreakdownForms", () => {
  it("groups by account then by counterparty (description)", () => {
    const rows = [
      tx({ id: "1", account: "地代家賃", description: "〇〇不動産", amount: -150000 }),
      tx({ id: "2", account: "地代家賃", description: "〇〇不動産", amount: -150000 }),
      tx({ id: "3", account: "広告宣伝費", description: "Meta広告", amount: -30000 }),
    ];
    const result = buildAccountBreakdownForms(rows);

    const rent = result.find((r) => r.account === "地代家賃");
    expect(rent?.total).toBe(300000);
    expect(rent?.lines).toEqual([{ counterparty: "〇〇不動産", amount: 300000, transactionCount: 2 }]);

    const ads = result.find((r) => r.account === "広告宣伝費");
    expect(ads?.total).toBe(30000);
  });

  it("excludes accounts that are not in the target list", () => {
    const rows = [tx({ id: "1", account: "消耗品費", description: "Amazon", amount: -3000 })];
    const result = buildAccountBreakdownForms(rows);
    expect(result.find((r) => r.account === "消耗品費")).toBeUndefined();
  });

  it("returns an empty array when there are no matching transactions", () => {
    expect(buildAccountBreakdownForms([])).toEqual([]);
  });

  it("sorts breakdowns with the largest total account first", () => {
    const rows = [
      tx({ id: "1", account: "広告宣伝費", description: "A社", amount: -10000 }),
      tx({ id: "2", account: "地代家賃", description: "B社", amount: -200000 }),
    ];
    const result = buildAccountBreakdownForms(rows);
    expect(result[0].account).toBe("地代家賃");
  });
});
