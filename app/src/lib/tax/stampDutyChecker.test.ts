import { describe, expect, it } from "vitest";
import {
  CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD,
  RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD,
  STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT,
  STAMP_DUTY_CHECKER_DISCLAIMER,
  checkContractStampDuty,
  checkReceiptStampDuty,
} from "./stampDutyChecker";

describe("checkReceiptStampDuty", () => {
  it("is exempt just below the ¥50,000 threshold", () => {
    const result = checkReceiptStampDuty({ amount: 49_999, format: "paper" });
    expect(result.isTaxableDocument).toBe(false);
    expect(result.stampDutyAmount).toBe(0);
    expect(result.reason).toContain("免税点");
    expect(result.disclaimer).toBe(STAMP_DUTY_CHECKER_DISCLAIMER);
  });

  it("charges ¥200 exactly at the ¥50,000 threshold", () => {
    const result = checkReceiptStampDuty({ amount: 50_000, format: "paper" });
    expect(result.isTaxableDocument).toBe(true);
    expect(result.stampDutyAmount).toBe(200);
  });

  it("treats the threshold constant as ¥50,000", () => {
    expect(RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD).toBe(50_000);
  });

  it("charges ¥200 at the top of the first bracket (¥1,000,000)", () => {
    const result = checkReceiptStampDuty({ amount: 1_000_000, format: "paper" });
    expect(result.stampDutyAmount).toBe(200);
  });

  it("charges ¥400 just above the first bracket (¥1,000,001)", () => {
    const result = checkReceiptStampDuty({ amount: 1_000_001, format: "paper" });
    expect(result.stampDutyAmount).toBe(400);
  });

  it("charges ¥400 at the top of the second bracket (¥2,000,000)", () => {
    expect(checkReceiptStampDuty({ amount: 2_000_000, format: "paper" }).stampDutyAmount).toBe(400);
  });

  it("charges ¥600 just above ¥2,000,000", () => {
    expect(checkReceiptStampDuty({ amount: 2_000_001, format: "paper" }).stampDutyAmount).toBe(600);
  });

  it("charges ¥600 at ¥3,000,000 and ¥1,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 3_000_000, format: "paper" }).stampDutyAmount).toBe(600);
    expect(checkReceiptStampDuty({ amount: 3_000_001, format: "paper" }).stampDutyAmount).toBe(1_000);
  });

  it("charges ¥1,000 at ¥5,000,000 and ¥2,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 5_000_000, format: "paper" }).stampDutyAmount).toBe(1_000);
    expect(checkReceiptStampDuty({ amount: 5_000_001, format: "paper" }).stampDutyAmount).toBe(2_000);
  });

  it("charges ¥2,000 at ¥10,000,000 and ¥4,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 10_000_000, format: "paper" }).stampDutyAmount).toBe(2_000);
    expect(checkReceiptStampDuty({ amount: 10_000_001, format: "paper" }).stampDutyAmount).toBe(4_000);
  });

  it("charges ¥4,000 at ¥20,000,000 and ¥6,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 20_000_000, format: "paper" }).stampDutyAmount).toBe(4_000);
    expect(checkReceiptStampDuty({ amount: 20_000_001, format: "paper" }).stampDutyAmount).toBe(6_000);
  });

  it("charges ¥6,000 at ¥30,000,000 and ¥10,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 30_000_000, format: "paper" }).stampDutyAmount).toBe(6_000);
    expect(checkReceiptStampDuty({ amount: 30_000_001, format: "paper" }).stampDutyAmount).toBe(10_000);
  });

  it("charges ¥10,000 at ¥50,000,000 and ¥20,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 50_000_000, format: "paper" }).stampDutyAmount).toBe(10_000);
    expect(checkReceiptStampDuty({ amount: 50_000_001, format: "paper" }).stampDutyAmount).toBe(20_000);
  });

  it("charges ¥20,000 at ¥100,000,000 and ¥40,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 100_000_000, format: "paper" }).stampDutyAmount).toBe(20_000);
    expect(checkReceiptStampDuty({ amount: 100_000_001, format: "paper" }).stampDutyAmount).toBe(40_000);
  });

  it("charges ¥40,000 at ¥200,000,000 and ¥60,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 200_000_000, format: "paper" }).stampDutyAmount).toBe(40_000);
    expect(checkReceiptStampDuty({ amount: 200_000_001, format: "paper" }).stampDutyAmount).toBe(60_000);
  });

  it("charges ¥60,000 at ¥300,000,000 and ¥100,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 300_000_000, format: "paper" }).stampDutyAmount).toBe(60_000);
    expect(checkReceiptStampDuty({ amount: 300_000_001, format: "paper" }).stampDutyAmount).toBe(100_000);
  });

  it("charges ¥100,000 at ¥500,000,000 and ¥150,000 just above it", () => {
    expect(checkReceiptStampDuty({ amount: 500_000_000, format: "paper" }).stampDutyAmount).toBe(100_000);
    expect(checkReceiptStampDuty({ amount: 500_000_001, format: "paper" }).stampDutyAmount).toBe(150_000);
  });

  it("charges ¥150,000 at ¥1,000,000,000 and ¥200,000 just above it (top bracket)", () => {
    expect(checkReceiptStampDuty({ amount: 1_000_000_000, format: "paper" }).stampDutyAmount).toBe(150_000);
    expect(checkReceiptStampDuty({ amount: 1_000_000_001, format: "paper" }).stampDutyAmount).toBe(200_000);
  });

  it("charges the top-bracket amount for an extremely large receipt", () => {
    expect(checkReceiptStampDuty({ amount: 10_000_000_000, format: "paper" }).stampDutyAmount).toBe(200_000);
  });

  it("is always ¥0 when issued electronically, regardless of amount", () => {
    const small = checkReceiptStampDuty({ amount: 10_000, format: "electronic" });
    const large = checkReceiptStampDuty({ amount: 50_000_000, format: "electronic" });

    expect(small.isTaxableDocument).toBe(false);
    expect(small.stampDutyAmount).toBe(0);
    expect(large.isTaxableDocument).toBe(false);
    expect(large.stampDutyAmount).toBe(0);
    expect(large.reason).toContain("電子");
  });

  it("charges a flat ¥200 for an unstated amount on paper", () => {
    const result = checkReceiptStampDuty({ amount: 0, format: "paper", amountStated: false });
    expect(result.isTaxableDocument).toBe(true);
    expect(result.stampDutyAmount).toBe(STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT);
  });

  it("is ¥0 for an unstated amount when issued electronically (electronic exemption wins)", () => {
    const result = checkReceiptStampDuty({ amount: 0, format: "electronic", amountStated: false });
    expect(result.isTaxableDocument).toBe(false);
    expect(result.stampDutyAmount).toBe(0);
  });

  it("treats a ¥0 receipt (amount stated) as exempt, not an error", () => {
    const result = checkReceiptStampDuty({ amount: 0, format: "paper" });
    expect(result.isTaxableDocument).toBe(false);
    expect(result.stampDutyAmount).toBe(0);
  });

  it("throws for a negative amount", () => {
    expect(() => checkReceiptStampDuty({ amount: -1, format: "paper" })).toThrow();
  });

  it("throws for a non-finite amount", () => {
    expect(() => checkReceiptStampDuty({ amount: Number.NaN, format: "paper" })).toThrow();
    expect(() => checkReceiptStampDuty({ amount: Infinity, format: "paper" })).toThrow();
  });
});

describe("checkContractStampDuty", () => {
  it("is exempt just below the ¥10,000 threshold", () => {
    const result = checkContractStampDuty({ amount: 9_999, format: "paper" });
    expect(result.isTaxableDocument).toBe(false);
    expect(result.stampDutyAmount).toBe(0);
    expect(result.reason).toContain("免税点");
  });

  it("charges ¥200 exactly at the ¥10,000 threshold", () => {
    const result = checkContractStampDuty({ amount: 10_000, format: "paper" });
    expect(result.isTaxableDocument).toBe(true);
    expect(result.stampDutyAmount).toBe(200);
    expect(result.disclaimer).toBe(STAMP_DUTY_CHECKER_DISCLAIMER);
  });

  it("treats the threshold constant as ¥10,000", () => {
    expect(CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD).toBe(10_000);
  });

  it("charges ¥200 at the top of the first bracket (¥1,000,000)", () => {
    expect(checkContractStampDuty({ amount: 1_000_000, format: "paper" }).stampDutyAmount).toBe(200);
  });

  it("charges ¥400 just above ¥1,000,000 and at ¥2,000,000", () => {
    expect(checkContractStampDuty({ amount: 1_000_001, format: "paper" }).stampDutyAmount).toBe(400);
    expect(checkContractStampDuty({ amount: 2_000_000, format: "paper" }).stampDutyAmount).toBe(400);
  });

  it("charges ¥1,000 just above ¥2,000,000 and at ¥3,000,000", () => {
    expect(checkContractStampDuty({ amount: 2_000_001, format: "paper" }).stampDutyAmount).toBe(1_000);
    expect(checkContractStampDuty({ amount: 3_000_000, format: "paper" }).stampDutyAmount).toBe(1_000);
  });

  it("charges ¥2,000 just above ¥3,000,000 and at ¥5,000,000", () => {
    expect(checkContractStampDuty({ amount: 3_000_001, format: "paper" }).stampDutyAmount).toBe(2_000);
    expect(checkContractStampDuty({ amount: 5_000_000, format: "paper" }).stampDutyAmount).toBe(2_000);
  });

  it("charges ¥10,000 just above ¥5,000,000 and at ¥10,000,000", () => {
    expect(checkContractStampDuty({ amount: 5_000_001, format: "paper" }).stampDutyAmount).toBe(10_000);
    expect(checkContractStampDuty({ amount: 10_000_000, format: "paper" }).stampDutyAmount).toBe(10_000);
  });

  it("charges ¥20,000 just above ¥10,000,000 and at ¥50,000,000", () => {
    expect(checkContractStampDuty({ amount: 10_000_001, format: "paper" }).stampDutyAmount).toBe(20_000);
    expect(checkContractStampDuty({ amount: 50_000_000, format: "paper" }).stampDutyAmount).toBe(20_000);
  });

  it("charges ¥60,000 just above ¥50,000,000 and at ¥100,000,000", () => {
    expect(checkContractStampDuty({ amount: 50_000_001, format: "paper" }).stampDutyAmount).toBe(60_000);
    expect(checkContractStampDuty({ amount: 100_000_000, format: "paper" }).stampDutyAmount).toBe(60_000);
  });

  it("charges ¥100,000 just above ¥100,000,000 and at ¥500,000,000", () => {
    expect(checkContractStampDuty({ amount: 100_000_001, format: "paper" }).stampDutyAmount).toBe(100_000);
    expect(checkContractStampDuty({ amount: 500_000_000, format: "paper" }).stampDutyAmount).toBe(100_000);
  });

  it("charges ¥200,000 just above ¥500,000,000 and at ¥1,000,000,000", () => {
    expect(checkContractStampDuty({ amount: 500_000_001, format: "paper" }).stampDutyAmount).toBe(200_000);
    expect(checkContractStampDuty({ amount: 1_000_000_000, format: "paper" }).stampDutyAmount).toBe(200_000);
  });

  it("charges ¥400,000 just above ¥1,000,000,000 and at ¥5,000,000,000", () => {
    expect(checkContractStampDuty({ amount: 1_000_000_001, format: "paper" }).stampDutyAmount).toBe(400_000);
    expect(checkContractStampDuty({ amount: 5_000_000_000, format: "paper" }).stampDutyAmount).toBe(400_000);
  });

  it("charges ¥600,000 (top bracket) just above ¥5,000,000,000", () => {
    expect(checkContractStampDuty({ amount: 5_000_000_001, format: "paper" }).stampDutyAmount).toBe(600_000);
  });

  it("charges the top-bracket amount for an extremely large contract", () => {
    expect(checkContractStampDuty({ amount: 50_000_000_000, format: "paper" }).stampDutyAmount).toBe(600_000);
  });

  it("is always ¥0 when the contract is executed electronically, regardless of amount", () => {
    const small = checkContractStampDuty({ amount: 10_000, format: "electronic" });
    const large = checkContractStampDuty({ amount: 6_000_000_000, format: "electronic" });

    expect(small.isTaxableDocument).toBe(false);
    expect(small.stampDutyAmount).toBe(0);
    expect(large.isTaxableDocument).toBe(false);
    expect(large.stampDutyAmount).toBe(0);
    expect(large.reason).toContain("電子契約");
  });

  it("charges a flat ¥200 for an unstated contract amount on paper", () => {
    const result = checkContractStampDuty({ amount: 0, format: "paper", amountStated: false });
    expect(result.isTaxableDocument).toBe(true);
    expect(result.stampDutyAmount).toBe(STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT);
  });

  it("is ¥0 for an unstated contract amount when executed electronically", () => {
    const result = checkContractStampDuty({ amount: 0, format: "electronic", amountStated: false });
    expect(result.stampDutyAmount).toBe(0);
  });

  it("treats a ¥0 contract (amount stated) as exempt, not an error", () => {
    const result = checkContractStampDuty({ amount: 0, format: "paper" });
    expect(result.isTaxableDocument).toBe(false);
    expect(result.stampDutyAmount).toBe(0);
  });

  it("throws for a negative amount", () => {
    expect(() => checkContractStampDuty({ amount: -1, format: "paper" })).toThrow();
  });

  it("throws for a non-finite amount", () => {
    expect(() => checkContractStampDuty({ amount: Number.NaN, format: "paper" })).toThrow();
  });
});
