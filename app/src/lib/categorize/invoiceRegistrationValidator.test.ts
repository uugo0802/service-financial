import { describe, expect, it } from "vitest";
import {
  assessInputTaxCreditEligibility,
  validateInvoiceRegistrationNumber,
} from "./invoiceRegistrationValidator";

// Real, publicly documented check-digit examples from the National Tax Agency's own
// worked example PDF ("チェックデジットの計算"): https://www.houjin-bangou.nta.go.jp/documents/checkdigit.pdf
// Base number "120901007402" -> check digit "2" -> corporate number "2120901007402".
const VALID_NUMBER_NTA_EXAMPLE = "T2120901007402";

// Second, independently-sourced example used to cross-check the algorithm:
// base number "000012050002" -> check digit "7" -> corporate number "7000012050002".
const VALID_NUMBER_SECOND_EXAMPLE = "T7000012050002";

describe("validateInvoiceRegistrationNumber", () => {
  it("accepts the NTA's own worked check-digit example", () => {
    const result = validateInvoiceRegistrationNumber(VALID_NUMBER_NTA_EXAMPLE);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.normalized).toBe(VALID_NUMBER_NTA_EXAMPLE);
  });

  it("accepts a second, independently-sourced check-digit example", () => {
    const result = validateInvoiceRegistrationNumber(VALID_NUMBER_SECOND_EXAMPLE);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_NUMBER_SECOND_EXAMPLE);
  });

  it("tolerates surrounding whitespace on an otherwise valid number", () => {
    const result = validateInvoiceRegistrationNumber(`  ${VALID_NUMBER_NTA_EXAMPLE}  `);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_NUMBER_NTA_EXAMPLE);
  });

  it("rejects a valid-length number with a wrong checksum", () => {
    // Same base digits as the NTA example but with the check digit flipped from 2 to 3.
    const result = validateInvoiceRegistrationNumber("T3120901007402");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("checksum_mismatch");
    expect(result.normalized).toBeNull();
  });

  it("rejects a number that is too short", () => {
    const result = validateInvoiceRegistrationNumber("T123456789012");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_length");
  });

  it("rejects a number that is too long", () => {
    const result = validateInvoiceRegistrationNumber("T12345678901234");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_length");
  });

  it("rejects a number missing the T prefix", () => {
    const result = validateInvoiceRegistrationNumber("2120901007402");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_prefix");
  });

  it("rejects a lowercase t prefix as missing the required prefix", () => {
    const result = validateInvoiceRegistrationNumber("t2120901007402");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_prefix");
  });

  it("rejects non-numeric characters after the T prefix", () => {
    const result = validateInvoiceRegistrationNumber("T21209O1007402");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("non_numeric");
  });

  it("rejects an empty string", () => {
    const result = validateInvoiceRegistrationNumber("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty");
  });

  it("rejects a whitespace-only string as empty", () => {
    const result = validateInvoiceRegistrationNumber("   ");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty");
  });

  it("treats a null/undefined input at runtime the same as an empty string", () => {
    expect(validateInvoiceRegistrationNumber(null as unknown as string).reason).toBe("empty");
    expect(validateInvoiceRegistrationNumber(undefined as unknown as string).reason).toBe("empty");
  });

  it("rejects hyphenated digits (a common copy-paste format) as non-numeric", () => {
    const result = validateInvoiceRegistrationNumber("T2120-9010-07402");
    expect(result.valid).toBe(false);
    // The hyphens make the body neither 13 chars nor purely numeric depending on count;
    // either invalid_length or non_numeric is an acceptable rejection reason here.
    expect(["invalid_length", "non_numeric"]).toContain(result.reason);
  });

  it("rejects full-width (Zenkaku) digits as non-numeric", () => {
    const result = validateInvoiceRegistrationNumber("T２１２０９０１００７４０２");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("non_numeric");
  });

  it("rejects a full-width (Zenkaku) 'Ｔ' prefix as missing the required (half-width) prefix", () => {
    const result = validateInvoiceRegistrationNumber("Ｔ2120901007402");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_prefix");
  });

  it("accepts a check digit of 9, the maximum possible value from the NTA formula", () => {
    // base12 "000000000000" -> weightedSum 0 -> checkDigit = 9 - (0 % 9) = 9.
    const result = validateInvoiceRegistrationNumber("T9000000000000");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("T9000000000000");
  });
});

describe("assessInputTaxCreditEligibility", () => {
  it("always returns status 要確認, never an auto-approval, even for a valid number", () => {
    const advisory = assessInputTaxCreditEligibility("株式会社サンプル", VALID_NUMBER_NTA_EXAMPLE);
    expect(advisory.status).toBe("要確認");
    expect(advisory.registrationNumberValid).toBe(true);
  });

  it("flags a missing registration number as 要確認 with registrationNumberValid null", () => {
    const advisory = assessInputTaxCreditEligibility("株式会社サンプル", undefined);
    expect(advisory.status).toBe("要確認");
    expect(advisory.registrationNumberValid).toBeNull();
  });

  it("flags an invalid registration number as 要確認 with registrationNumberValid false", () => {
    const advisory = assessInputTaxCreditEligibility("株式会社サンプル", "T3120901007402");
    expect(advisory.status).toBe("要確認");
    expect(advisory.registrationNumberValid).toBe(false);
  });

  it("falls back to a generic counterparty label when the name is blank", () => {
    const advisory = assessInputTaxCreditEligibility("", null);
    expect(advisory.headline).toContain("この取引先");
  });

  it("treats a whitespace-only registration number the same as a missing one", () => {
    const advisory = assessInputTaxCreditEligibility("株式会社サンプル", "   ");
    expect(advisory.status).toBe("要確認");
    expect(advisory.registrationNumberValid).toBeNull();
  });

  it("trims a padded counterparty name before using it in the headline", () => {
    const advisory = assessInputTaxCreditEligibility("  株式会社サンプル  ", undefined);
    expect(advisory.headline).toContain("株式会社サンプル");
    expect(advisory.headline).not.toContain("  株式会社サンプル  ");
  });
});
