import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { estimateForIndividual } from "../tax/estimate";
import { estimateForMicroCorp } from "../tax/corporateEstimate";
import {
  ETAX_DRAFT_DISCLAIMER,
  ETAX_DRAFT_FIELD_HEADERS,
  ETAX_DRAFT_SCHEMA_VERSION,
  buildEtaxDraftCsv,
  etaxDraftFields,
  etaxDraftFieldsToCsv,
} from "./etaxFileFormat";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-05",
    description: "売上",
    amount: 100_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("etaxDraftFields", () => {
  it("returns the individual field set with income totals, deduction totals, and tax due", () => {
    const estimate = estimateForIndividual([
      tx({ amount: 1_000_000 }),
      tx({ id: "2", amount: -200_000, account: "消耗品費", taxCategory: "課税仕入10%" }),
    ]);
    const fields = etaxDraftFields({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.total_income).toBe(estimate.totalIncome);
    expect(byKey.necessary_expenses).toBe(estimate.totalExpense);
    expect(byKey.blue_return_deduction).toBe(estimate.blueReturnDeduction);
    expect(byKey.social_insurance_deduction).toBe(estimate.socialInsuranceDeduction);
    expect(byKey.taxable_income).toBe(estimate.taxableIncome);
    expect(byKey.income_tax).toBe(estimate.incomeTax.tax);
    expect(byKey.total_income_tax).toBe(estimate.totalIncomeTax);
    expect(byKey.consumption_tax_payable).toBe(estimate.consumptionTax.payable);
  });

  it("returns the corporate field set with income totals, deduction-equivalent totals, and tax due", () => {
    const estimate = estimateForMicroCorp([
      tx({ amount: 5_000_000 }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ]);
    const fields = etaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.revenue).toBe(estimate.revenue);
    expect(byKey.expenses).toBe(estimate.expenses);
    expect(byKey.taxable_income).toBe(estimate.taxableIncome);
    expect(byKey.corporate_tax).toBe(estimate.corporateTax);
    expect(byKey.local_corporate_tax).toBe(estimate.localCorporateTax);
    expect(byKey.total_national_tax).toBe(estimate.totalNationalTax);
    expect(byKey.consumption_tax_payable).toBe(estimate.consumptionTax.payable);
  });

  it("includes every assumption note as its own 前提条件 row so caveats survive the export (individual)", () => {
    const estimate = estimateForIndividual([]);
    const fields = etaxDraftFields({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    const assumptionRows = fields.filter((f) => f.label === "前提条件");
    expect(assumptionRows).toHaveLength(estimate.assumptions.length);
  });

  it("includes every assumption note as its own 前提条件 row so caveats survive the export (corporate)", () => {
    const estimate = estimateForMicroCorp([]);
    const fields = etaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    const assumptionRows = fields.filter((f) => f.label === "前提条件");
    expect(assumptionRows).toHaveLength(estimate.assumptions.length);
  });

  describe("edge cases", () => {
    it("handles zero income (no transactions) without throwing and reports zero tax due", () => {
      const individual = estimateForIndividual([]);
      const corporate = estimateForMicroCorp([]);

      const individualFields = etaxDraftFields({ taxpayerKind: "individual", estimate: individual, taxYear: 2026 });
      const corporateFields = etaxDraftFields({ taxpayerKind: "corporate", estimate: corporate, taxYear: 2026 });

      const individualByKey = Object.fromEntries(individualFields.map((f) => [f.key, f.value]));
      const corporateByKey = Object.fromEntries(corporateFields.map((f) => [f.key, f.value]));

      expect(individualByKey.total_income).toBe(0);
      expect(individualByKey.income_tax).toBe(0);
      expect(individualByKey.taxable_income).toBe(0);
      expect(corporateByKey.revenue).toBe(0);
      expect(corporateByKey.corporate_tax).toBe(0);
      expect(corporateByKey.taxable_income).toBe(0);
    });

    it("handles a loss scenario (expenses exceed income) by floor-clamping taxable income to zero, not negative", () => {
      const estimate = estimateForIndividual([
        tx({ amount: 100_000 }),
        tx({ id: "2", amount: -900_000, account: "消耗品費", taxCategory: "課税仕入10%" }),
      ]);
      expect(estimate.businessProfit).toBeLessThan(0);

      const fields = etaxDraftFields({ taxpayerKind: "individual", estimate, taxYear: 2026 });
      const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

      // 事業所得自体は赤字（負値）だが、課税所得金額・所得税額は0円未満にはならない。
      expect(byKey.business_profit).toBe(estimate.businessProfit);
      expect(byKey.business_profit).toBeLessThan(0);
      expect(byKey.taxable_income).toBe(0);
      expect(byKey.income_tax).toBe(0);
    });

    it("handles a corporate loss scenario by floor-clamping taxable income to zero", () => {
      const estimate = estimateForMicroCorp([
        tx({ amount: 500_000 }),
        tx({ id: "2", amount: -3_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
      ]);
      const fields = etaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
      const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

      expect(byKey.taxable_income).toBe(0);
      expect(byKey.corporate_tax).toBe(0);
      expect(byKey.local_corporate_tax).toBe(0);
    });
  });
});

describe("etaxDraftFieldsToCsv", () => {
  it("emits the documented header row", () => {
    const estimate = estimateForIndividual([]);
    const csv = etaxDraftFieldsToCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe(ETAX_DRAFT_FIELD_HEADERS.join(","));
  });

  it("includes the marginal income tax rate as an explanatory note on the income_tax row", () => {
    const estimate = estimateForIndividual([]);
    const csv = etaxDraftFieldsToCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toContain("適用税率（限界税率） 0%");
  });
});

describe("buildEtaxDraftCsv", () => {
  it("includes the draft/non-representation disclaimer", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toContain(ETAX_DRAFT_DISCLAIMER);
  });

  it("never claims the company files the return on the user's behalf", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).not.toMatch(/申告(いたし|し)ました|代理.?で.?申告|当社が(送信|代理送信)します/);
  });

  it("includes the schema version so future real-xtx migrations can detect this placeholder format", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toContain(`スキーマバージョン: ${ETAX_DRAFT_SCHEMA_VERSION}`);
  });

  it("includes a fixed generated-at timestamp and tax year when supplied, for deterministic output", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({
      taxpayerKind: "individual",
      estimate,
      taxYear: 2025,
      taxpayerName: "山田太郎",
      generatedAt: new Date("2026-07-29T00:00:00.000Z"),
    });
    expect(csv).toContain("出力日時: 2026-07-29T00:00:00.000Z");
    expect(csv).toContain("対象年分/事業年度: 2025");
    expect(csv).toContain("氏名/名称: 山田太郎");
  });

  it("falls back to an empty taxpayer name field when none is supplied", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toContain("氏名/名称: \r\n");
  });

  it("quotes a metadata field containing a comma (e.g. a taxpayer name)", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({
      taxpayerKind: "individual",
      estimate,
      taxYear: 2026,
      taxpayerName: "山田, 太郎",
    });
    expect(csv).toContain('"氏名/名称: 山田, 太郎"');
  });

  it("embeds the field table under its own section marker", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toContain("■ 下書きデータ");
    expect(csv).toContain(ETAX_DRAFT_FIELD_HEADERS.join(","));
    expect(csv).toContain("法人税額");
  });

  it("stamps an ISO-8601 generated-at timestamp using the current time when none is supplied", () => {
    const estimate = estimateForIndividual([]);
    const csv = buildEtaxDraftCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toMatch(/出力日時: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});
