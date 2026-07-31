import { describe, expect, it } from "vitest";
import { isExcludeFromIncomeAccount, isPersonalDeductionOnlyAccount } from "./dictionary";

describe("isPersonalDeductionOnlyAccount", () => {
  it("returns true for accounts unambiguously flagged personalDeductionOnly across all their rules", () => {
    expect(isPersonalDeductionOnlyAccount("社会保険料(個人)")).toBe(true);
    expect(isPersonalDeductionOnlyAccount("生命保険料(個人)")).toBe(true);
  });

  it("returns false for an ordinary business-expense account", () => {
    expect(isPersonalDeductionOnlyAccount("地代家賃")).toBe(false);
  });

  // "租税公課" is used both by the personalDeductionOnly 所得税/住民税 rule and by the
  // ordinary (non-personal) 印紙/租税公課/消費税 rule, so the account name alone cannot
  // disambiguate which one an AI classification meant. Must stay false (unresolved).
  it("returns false for an account name shared between a personalDeductionOnly and a non-personal rule (租税公課)", () => {
    expect(isPersonalDeductionOnlyAccount("租税公課")).toBe(false);
  });

  it("returns false for an unknown account name", () => {
    expect(isPersonalDeductionOnlyAccount("存在しない科目")).toBe(false);
  });
});

describe("isExcludeFromIncomeAccount", () => {
  it("returns true for balance-sheet accounts (loan proceeds / capital contributions)", () => {
    expect(isExcludeFromIncomeAccount("借入金")).toBe(true);
    expect(isExcludeFromIncomeAccount("元入金")).toBe(true);
  });

  it("returns false for an ordinary income account", () => {
    expect(isExcludeFromIncomeAccount("売上高")).toBe(false);
  });

  it("returns false for an unknown account name", () => {
    expect(isExcludeFromIncomeAccount("存在しない科目")).toBe(false);
  });
});
