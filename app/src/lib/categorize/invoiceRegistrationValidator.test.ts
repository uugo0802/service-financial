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
});
