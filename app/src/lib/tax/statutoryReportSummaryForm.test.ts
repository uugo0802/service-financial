import { describe, expect, it } from "vitest";
import {
  STATUTORY_REPORT_FORM_LABEL,
  STATUTORY_REPORT_SECTION_TITLES,
  SALARY_ROW_LABEL,
  StatutoryReportPaymentReportInput,
  StatutoryReportWithholdingSlipInput,
  buildStatutoryReportSummaryForm,
} from "./statutoryReportSummaryForm";
import { buildPaymentReportLines, PaymentReportSourceRow } from "./paymentReportForm";
import { buildWithholdingSlip } from "../payroll/withholdingSlip";
import { calculateYearEndAdjustment } from "../payroll/yearEndAdjustment";

const SUBMITTER = { name: "今ごえん合同会社" };

function paymentRow(overrides: Partial<StatutoryReportPaymentReportInput>): StatutoryReportPaymentReportInput {
  return {
    payeeName: "山田太郎",
    category: "デザイン料",
    grossAmount: 0,
    withholdingTax: 0,
    ...overrides,
  };
}

function salaryRow(overrides: Partial<StatutoryReportWithholdingSlipInput>): StatutoryReportWithholdingSlipInput {
  return {
    employee: { name: "鈴木花子" },
    paymentAmount: 0,
    withholdingTaxAmount: 0,
    ...overrides,
  };
}

describe("buildStatutoryReportSummaryForm", () => {
  it("returns zeroed sections and totals for empty input", () => {
    const form = buildStatutoryReportSummaryForm([], [], { fiscalYear: 2026, submitter: SUBMITTER });

    expect(form.formLabel).toBe(STATUTORY_REPORT_FORM_LABEL);
    expect(form.fiscalYear).toBe(2026);
    expect(form.fiscalYearLabel).toBe("2026年分");
    expect(form.submitter).toEqual(SUBMITTER);
    expect(form.sections).toHaveLength(4);

    for (const section of form.sections) {
      expect(section.rows).toEqual([]);
      expect(section.subtotal.personCount).toBe(0);
      expect(section.subtotal.paymentAmount).toBe(0);
      expect(section.subtotal.withholdingTaxAmount).toBe(0);
    }

    expect(form.overallTotals).toEqual({
      totalDocumentCount: 0,
      totalPaymentAmount: 0,
      totalWithholdingTaxAmount: 0,
    });
    expect(form.assumptions.length).toBeGreaterThan(0);
  });

  it("always reports retirement and real-estate-rent sections as unsupported/empty", () => {
    const form = buildStatutoryReportSummaryForm([], [], { fiscalYear: 2026, submitter: SUBMITTER });

    const retirement = form.sections.find((s) => s.id === "retirement")!;
    const realEstateRent = form.sections.find((s) => s.id === "realEstateRent")!;

    expect(retirement.title).toBe(STATUTORY_REPORT_SECTION_TITLES.retirement);
    expect(retirement.supported).toBe(false);
    expect(retirement.rows).toEqual([]);
    expect(realEstateRent.title).toBe(STATUTORY_REPORT_SECTION_TITLES.realEstateRent);
    expect(realEstateRent.supported).toBe(false);
    expect(realEstateRent.rows).toEqual([]);
  });

  it("aggregates a single payment-report category into one row", () => {
    const records = [
      paymentRow({ payeeName: "A", category: "デザイン料", grossAmount: 120000, withholdingTax: 12252 }),
    ];

    const form = buildStatutoryReportSummaryForm(records, [], { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "paymentReport")!;

    expect(section.rows).toHaveLength(1);
    expect(section.rows[0]).toEqual({
      category: "デザイン料",
      personCount: 1,
      paymentAmount: 120000,
      withholdingTaxAmount: 12252,
    });
    expect(section.subtotal).toEqual({
      category: "合計",
      personCount: 1,
      paymentAmount: 120000,
      withholdingTaxAmount: 12252,
    });
  });

  it("aggregates multiple categories and multiple payees per category separately", () => {
    const records = [
      paymentRow({ payeeName: "A", category: "デザイン料", grossAmount: 100000, withholdingTax: 10210 }),
      paymentRow({ payeeName: "B", category: "デザイン料", grossAmount: 200000, withholdingTax: 20420 }),
      paymentRow({ payeeName: "C", category: "原稿料・講演料等", grossAmount: 50001, withholdingTax: 5101 }),
    ];

    const form = buildStatutoryReportSummaryForm(records, [], { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "paymentReport")!;

    const design = section.rows.find((r) => r.category === "デザイン料")!;
    const manuscript = section.rows.find((r) => r.category === "原稿料・講演料等")!;

    expect(design).toEqual({
      category: "デザイン料",
      personCount: 2,
      paymentAmount: 300000,
      withholdingTaxAmount: 30630,
    });
    expect(manuscript).toEqual({
      category: "原稿料・講演料等",
      personCount: 1,
      paymentAmount: 50001,
      withholdingTaxAmount: 5101,
    });
    expect(section.subtotal.personCount).toBe(3);
    expect(section.subtotal.paymentAmount).toBe(350001);
    expect(section.subtotal.withholdingTaxAmount).toBe(35731);

    // Categories with no matching rows are omitted entirely (not shown as zero rows).
    expect(section.rows.some((r) => r.category === "弁護士・税理士等の報酬")).toBe(false);
  });

  it("excludes payment-report rows explicitly marked reportRequired: false", () => {
    const records = [
      paymentRow({ payeeName: "A", category: "デザイン料", grossAmount: 30000, reportRequired: false }),
      paymentRow({ payeeName: "B", category: "デザイン料", grossAmount: 60000, reportRequired: true }),
    ];

    const form = buildStatutoryReportSummaryForm(records, [], { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "paymentReport")!;

    expect(section.rows).toHaveLength(1);
    expect(section.rows[0].personCount).toBe(1);
    expect(section.rows[0].paymentAmount).toBe(60000);
  });

  it("treats an omitted reportRequired field as included", () => {
    const records = [paymentRow({ payeeName: "A", category: "デザイン料", grossAmount: 30000 })];
    const form = buildStatutoryReportSummaryForm(records, [], { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "paymentReport")!;
    expect(section.rows[0].personCount).toBe(1);
  });

  it("aggregates withholding-slip records into a single salary row (personCount = number of employees)", () => {
    const records = [
      salaryRow({ employee: { name: "山田太郎" }, paymentAmount: 4_000_000, withholdingTaxAmount: 132000 }),
      salaryRow({ employee: { name: "鈴木花子" }, paymentAmount: 3_500_000, withholdingTaxAmount: 98000 }),
    ];

    const form = buildStatutoryReportSummaryForm([], records, { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "salary")!;

    expect(section.rows).toHaveLength(1);
    expect(section.rows[0]).toEqual({
      category: SALARY_ROW_LABEL,
      personCount: 2,
      paymentAmount: 7_500_000,
      withholdingTaxAmount: 230000,
    });
    expect(section.subtotal).toEqual({
      category: "合計",
      personCount: 2,
      paymentAmount: 7_500_000,
      withholdingTaxAmount: 230000,
    });
  });

  it("filters withholding-slip records to the given fiscal year, keeping records without a fiscalYear regardless", () => {
    const records = [
      salaryRow({ employee: { name: "A" }, paymentAmount: 1000, withholdingTaxAmount: 0, fiscalYear: 2025 }),
      salaryRow({ employee: { name: "B" }, paymentAmount: 2000, withholdingTaxAmount: 0, fiscalYear: 2026 }),
      salaryRow({ employee: { name: "C" }, paymentAmount: 3000, withholdingTaxAmount: 0 }),
    ];

    const form = buildStatutoryReportSummaryForm([], records, { fiscalYear: 2026, submitter: SUBMITTER });
    const section = form.sections.find((s) => s.id === "salary")!;

    expect(section.rows[0].personCount).toBe(2);
    expect(section.rows[0].paymentAmount).toBe(5000);
  });

  it("computes overallTotals across all sections (payment-report + salary)", () => {
    const paymentRecords = [
      paymentRow({ payeeName: "A", category: "デザイン料", grossAmount: 100000, withholdingTax: 10210 }),
    ];
    const salaryRecords = [
      salaryRow({ employee: { name: "山田太郎" }, paymentAmount: 4_000_000, withholdingTaxAmount: 132000 }),
    ];

    const form = buildStatutoryReportSummaryForm(paymentRecords, salaryRecords, {
      fiscalYear: 2026,
      submitter: SUBMITTER,
    });

    expect(form.overallTotals).toEqual({
      totalDocumentCount: 2,
      totalPaymentAmount: 4_100_000,
      totalWithholdingTaxAmount: 142210,
    });
  });

  it("throws when the submitter name is blank", () => {
    expect(() =>
      buildStatutoryReportSummaryForm([], [], { fiscalYear: 2026, submitter: { name: "   " } })
    ).toThrow();
  });

  it("throws for a non-integer fiscal year", () => {
    expect(() =>
      buildStatutoryReportSummaryForm([], [], { fiscalYear: 2026.5, submitter: SUBMITTER })
    ).toThrow();
  });

  it("throws for a fiscal year outside the supported range", () => {
    expect(() => buildStatutoryReportSummaryForm([], [], { fiscalYear: 1500, submitter: SUBMITTER })).toThrow();
  });

  it("carries over the standard draft disclaimer text", () => {
    const form = buildStatutoryReportSummaryForm([], [], { fiscalYear: 2026, submitter: SUBMITTER });
    expect(form.assumptions.some((a) => a.includes("下書きです。提出はご自身の責任で行ってください"))).toBe(true);
  });
});

describe("end-to-end: paymentReportForm.ts + withholdingSlip.ts -> statutoryReportSummaryForm.ts", () => {
  it("rolls up buildPaymentReportLines output and buildWithholdingSlip output into one summary", () => {
    const sourceRows: PaymentReportSourceRow[] = [
      { payeeName: "〇〇税理士事務所", category: "弁護士・税理士等の報酬", grossAmount: 66000, withholdingTax: 6738 },
      { payeeName: "△△デザイン事務所", category: "デザイン料", grossAmount: 120000, withholdingTax: 12252 },
    ];
    const lines = buildPaymentReportLines(sourceRows);

    const yearEndAdjustment = calculateYearEndAdjustment({
      annualGrossCompensation: 4_000_000,
      annualSocialInsurancePremium: 500_000,
      dependentCount: 1,
      monthlyWithholdingTotal: 100_000,
    });
    const slip = buildWithholdingSlip({
      fiscalYear: 2026,
      employee: { name: "山田太郎" },
      payer: { companyName: "今ごえん合同会社" },
      yearEndAdjustment,
    });

    const form = buildStatutoryReportSummaryForm(lines, [slip], {
      fiscalYear: 2026,
      submitter: { name: "今ごえん合同会社" },
    });

    const paymentSection = form.sections.find((s) => s.id === "paymentReport")!;
    const salarySection = form.sections.find((s) => s.id === "salary")!;

    expect(paymentSection.subtotal.personCount).toBe(2);
    expect(paymentSection.subtotal.paymentAmount).toBe(186000);
    expect(paymentSection.subtotal.withholdingTaxAmount).toBe(18990);

    expect(salarySection.rows[0].paymentAmount).toBe(slip.paymentAmount);
    expect(salarySection.rows[0].withholdingTaxAmount).toBe(slip.withholdingTaxAmount);

    expect(form.overallTotals.totalDocumentCount).toBe(3);
    expect(form.overallTotals.totalPaymentAmount).toBe(186000 + slip.paymentAmount);
    expect(form.overallTotals.totalWithholdingTaxAmount).toBe(18990 + slip.withholdingTaxAmount);
  });
});
