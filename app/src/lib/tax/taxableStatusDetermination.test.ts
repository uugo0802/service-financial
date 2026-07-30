import { describe, expect, it } from "vitest";
import {
  BASE_PERIOD_TAXABLE_SALES_THRESHOLD,
  NEW_COMPANY_CAPITAL_THRESHOLD,
  SPECIFIED_PERIOD_SALARY_THRESHOLD,
  SPECIFIED_PERIOD_SALES_THRESHOLD,
  TAXABLE_STATUS_DISCLAIMER,
  determineTaxableStatus,
} from "./taxableStatusDetermination";

const BASE_EXEMPT_INDIVIDUAL = {
  entityType: "individual" as const,
  isInvoiceRegisteredBusiness: false,
  hasBasePeriod: true,
  baseYearTaxableSales: 5_000_000,
  specifiedPeriodTaxableSales: 5_000_000,
  specifiedPeriodSalaryPaid: 5_000_000,
};

describe("determineTaxableStatus — 全ての基準を下回る場合は免税事業者", () => {
  it("returns exempt when every rule is under its threshold", () => {
    const result = determineTaxableStatus(BASE_EXEMPT_INDIVIDUAL);

    expect(result.status).toBe("exempt");
    expect(result.statusLabel).toBe("免税事業者");
    expect(result.decidingRuleId).toBeNull();
    expect(result.requiresExpertReview).toBe(false);
    expect(result.outOfScopeReasons).toEqual([]);
    expect(result.disclaimer).toBe(TAXABLE_STATUS_DISCLAIMER);
    expect(result.steps).toHaveLength(4);
    expect(result.steps.every((s) => !s.triggered)).toBe(true);
  });
});

describe("determineTaxableStatus — (a) 基準期間課税売上高", () => {
  it("stays exempt exactly at the ¥10,000,000 threshold (must exceed, not just reach)", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      baseYearTaxableSales: BASE_PERIOD_TAXABLE_SALES_THRESHOLD,
    });

    expect(result.status).toBe("exempt");
    const step = result.steps.find((s) => s.ruleId === "basePeriod")!;
    expect(step.applicable).toBe(true);
    expect(step.triggered).toBe(false);
  });

  it("becomes taxable just above the ¥10,000,000 base-period threshold", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      baseYearTaxableSales: BASE_PERIOD_TAXABLE_SALES_THRESHOLD + 1,
    });

    expect(result.status).toBe("taxable");
    expect(result.statusLabel).toBe("課税事業者");
    expect(result.decidingRuleId).toBe("basePeriod");
    const step = result.steps.find((s) => s.ruleId === "basePeriod")!;
    expect(step.triggered).toBe(true);
    expect(step.detail).toMatch(/課税事業者/);
  });

  it("marks the base-period rule as not applicable when hasBasePeriod is false", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      capitalStockAtPeriodStart: 1_000_000,
      hasSpecifiedPeriod: false,
    });

    const step = result.steps.find((s) => s.ruleId === "basePeriod")!;
    expect(step.applicable).toBe(false);
    expect(step.triggered).toBe(false);
  });

  it("throws when hasBasePeriod is true but baseYearTaxableSales is not provided", () => {
    expect(() =>
      determineTaxableStatus({
        entityType: "individual",
        isInvoiceRegisteredBusiness: false,
        hasBasePeriod: true,
        specifiedPeriodTaxableSales: 0,
        specifiedPeriodSalaryPaid: 0,
      })
    ).toThrow(/基準期間の課税売上高/);
  });
});

describe("determineTaxableStatus — (b) 特定期間の課税売上高・給与等支払額（両方超で課税事業者）", () => {
  it("stays exempt when both specified-period figures are under their thresholds", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      specifiedPeriodTaxableSales: SPECIFIED_PERIOD_SALES_THRESHOLD,
      specifiedPeriodSalaryPaid: SPECIFIED_PERIOD_SALARY_THRESHOLD,
    });

    expect(result.status).toBe("exempt");
    const step = result.steps.find((s) => s.ruleId === "specifiedPeriod")!;
    expect(step.triggered).toBe(false);
  });

  it("stays exempt when sales exceed ¥10,000,000 but salary paid does not (taxpayer may pick the more favorable test)", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      specifiedPeriodTaxableSales: SPECIFIED_PERIOD_SALES_THRESHOLD + 1,
      specifiedPeriodSalaryPaid: SPECIFIED_PERIOD_SALARY_THRESHOLD,
    });

    expect(result.status).toBe("exempt");
    const step = result.steps.find((s) => s.ruleId === "specifiedPeriod")!;
    expect(step.triggered).toBe(false);
    expect(step.detail).toMatch(/給与等支払額による判定を選択でき/);
  });

  it("stays exempt when salary paid exceeds ¥10,000,000 but sales does not", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      specifiedPeriodTaxableSales: SPECIFIED_PERIOD_SALES_THRESHOLD,
      specifiedPeriodSalaryPaid: SPECIFIED_PERIOD_SALARY_THRESHOLD + 1,
    });

    expect(result.status).toBe("exempt");
  });

  it("becomes taxable when both specified-period sales and salary paid exceed ¥10,000,000", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      specifiedPeriodTaxableSales: SPECIFIED_PERIOD_SALES_THRESHOLD + 1,
      specifiedPeriodSalaryPaid: SPECIFIED_PERIOD_SALARY_THRESHOLD + 1,
    });

    expect(result.status).toBe("taxable");
    expect(result.decidingRuleId).toBe("specifiedPeriod");
    const step = result.steps.find((s) => s.ruleId === "specifiedPeriod")!;
    expect(step.triggered).toBe(true);
    expect(step.detail).toMatch(/いずれも1,000万円を超えている/);
  });

  it("marks the specified-period rule as not applicable when hasSpecifiedPeriod is false", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
      capitalStockAtPeriodStart: 1_000_000,
    });

    const step = result.steps.find((s) => s.ruleId === "specifiedPeriod")!;
    expect(step.applicable).toBe(false);
    expect(step.triggered).toBe(false);
  });
});

describe("determineTaxableStatus — (c) インボイス発行事業者登録（登録していれば課税事業者）", () => {
  it("becomes taxable when registered as an invoice-issuing business, even if all sales figures are under threshold", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      isInvoiceRegisteredBusiness: true,
    });

    expect(result.status).toBe("taxable");
    expect(result.statusLabel).toBe("課税事業者");
    expect(result.decidingRuleId).toBe("invoiceRegistration");
    const step = result.steps.find((s) => s.ruleId === "invoiceRegistration")!;
    expect(step.triggered).toBe(true);
    expect(step.detail).toMatch(/登録を選択している限り課税事業者/);
  });

  it("does not trigger the invoice-registration rule when not registered", () => {
    const result = determineTaxableStatus(BASE_EXEMPT_INDIVIDUAL);
    const step = result.steps.find((s) => s.ruleId === "invoiceRegistration")!;
    expect(step.applicable).toBe(true);
    expect(step.triggered).toBe(false);
  });
});

describe("determineTaxableStatus — 新設法人（基準期間なし）の資本金特例", () => {
  it("stays exempt when a new corporation's capital is under ¥10,000,000", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
      capitalStockAtPeriodStart: NEW_COMPANY_CAPITAL_THRESHOLD - 1,
    });

    expect(result.status).toBe("exempt");
    const step = result.steps.find((s) => s.ruleId === "newCompanyCapital")!;
    expect(step.applicable).toBe(true);
    expect(step.triggered).toBe(false);
  });

  it("becomes taxable exactly at the ¥10,000,000 capital threshold ('1,000万円以上', not '超える')", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
      capitalStockAtPeriodStart: NEW_COMPANY_CAPITAL_THRESHOLD,
    });

    expect(result.status).toBe("taxable");
    expect(result.decidingRuleId).toBe("newCompanyCapital");
    const step = result.steps.find((s) => s.ruleId === "newCompanyCapital")!;
    expect(step.triggered).toBe(true);
    expect(step.detail).toMatch(/新設法人の特例により課税事業者/);
  });

  it("becomes taxable above the capital threshold for a brand-new corporation with no base period and no specified period", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
      capitalStockAtPeriodStart: 15_000_000,
    });

    expect(result.status).toBe("taxable");
    expect(result.decidingRuleId).toBe("newCompanyCapital");
  });

  it("does not apply the new-company capital rule to individuals even without a base period", () => {
    const result = determineTaxableStatus({
      entityType: "individual",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
    });

    const step = result.steps.find((s) => s.ruleId === "newCompanyCapital")!;
    expect(step.applicable).toBe(false);
    expect(result.status).toBe("exempt");
  });

  it("does not apply the new-company capital rule when the corporation has a base period (rule is for 1st/2nd fiscal year only)", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      entityType: "corporation",
      capitalStockAtPeriodStart: 50_000_000,
    });

    const step = result.steps.find((s) => s.ruleId === "newCompanyCapital")!;
    expect(step.applicable).toBe(false);
    expect(step.triggered).toBe(false);
    expect(result.status).toBe("exempt");
  });

  it("throws when a new corporation's capital is required but not provided", () => {
    expect(() =>
      determineTaxableStatus({
        entityType: "corporation",
        isInvoiceRegisteredBusiness: false,
        hasBasePeriod: false,
        hasSpecifiedPeriod: false,
      })
    ).toThrow(/資本金の額/);
  });
});

describe("determineTaxableStatus — 複数ルール該当時の decidingRuleId（先に評価されたルールを優先）", () => {
  it("reports basePeriod as the deciding rule when both base-period and invoice-registration trigger", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      baseYearTaxableSales: BASE_PERIOD_TAXABLE_SALES_THRESHOLD + 1,
      isInvoiceRegisteredBusiness: true,
    });

    expect(result.status).toBe("taxable");
    expect(result.decidingRuleId).toBe("basePeriod");
    const invoiceStep = result.steps.find((s) => s.ruleId === "invoiceRegistration")!;
    expect(invoiceStep.triggered).toBe(true); // still reported as triggered, just not the "deciding" one
  });
});

describe("determineTaxableStatus — 対象外事情（合併・分割、特定新規設立法人）のフラグ", () => {
  it("flags hasMergerOrDemerger as requiring expert review without changing the computed status", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      hasMergerOrDemerger: true,
    });

    expect(result.status).toBe("exempt");
    expect(result.requiresExpertReview).toBe(true);
    expect(result.outOfScopeReasons).toHaveLength(1);
    expect(result.outOfScopeReasons[0]).toMatch(/合併・分割/);
    expect(result.outOfScopeReasons[0]).toMatch(/要専門家確認/);
  });

  it("flags isSpecifiedNewlyEstablishedCorporation as requiring expert review", () => {
    const result = determineTaxableStatus({
      entityType: "corporation",
      isInvoiceRegisteredBusiness: false,
      hasBasePeriod: false,
      hasSpecifiedPeriod: false,
      capitalStockAtPeriodStart: 1_000_000,
      isSpecifiedNewlyEstablishedCorporation: true,
    });

    expect(result.requiresExpertReview).toBe(true);
    expect(result.outOfScopeReasons.some((r) => r.includes("特定新規設立法人"))).toBe(true);
  });

  it("reports both out-of-scope reasons when both flags are set", () => {
    const result = determineTaxableStatus({
      ...BASE_EXEMPT_INDIVIDUAL,
      entityType: "corporation",
      hasMergerOrDemerger: true,
      isSpecifiedNewlyEstablishedCorporation: true,
    });

    expect(result.outOfScopeReasons).toHaveLength(2);
  });

  it("does not require expert review when neither out-of-scope flag is set", () => {
    const result = determineTaxableStatus(BASE_EXEMPT_INDIVIDUAL);
    expect(result.requiresExpertReview).toBe(false);
  });
});

describe("determineTaxableStatus — 入力検証", () => {
  it("throws for a negative base-period taxable sales value", () => {
    expect(() =>
      determineTaxableStatus({
        ...BASE_EXEMPT_INDIVIDUAL,
        baseYearTaxableSales: -1,
      })
    ).toThrow(/0以上/);
  });

  it("throws for a NaN specified-period salary value", () => {
    expect(() =>
      determineTaxableStatus({
        ...BASE_EXEMPT_INDIVIDUAL,
        specifiedPeriodSalaryPaid: NaN,
      })
    ).toThrow(/数値で入力/);
  });

  it("throws when specifiedPeriodTaxableSales is missing while hasSpecifiedPeriod defaults to true", () => {
    expect(() =>
      determineTaxableStatus({
        entityType: "individual",
        isInvoiceRegisteredBusiness: false,
        hasBasePeriod: true,
        baseYearTaxableSales: 0,
        specifiedPeriodSalaryPaid: 0,
      })
    ).toThrow(/特定期間の課税売上高/);
  });
});
