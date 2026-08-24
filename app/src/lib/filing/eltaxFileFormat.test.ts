import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { estimateForIndividual } from "../tax/estimate";
import { estimateForMicroCorp } from "../tax/corporateEstimate";
import {
  ELTAX_DRAFT_DISCLAIMER,
  ELTAX_DRAFT_FIELD_HEADERS,
  ELTAX_DRAFT_SCHEMA_VERSION,
  buildEltaxDraftCsv,
  eltaxDraftFields,
  eltaxDraftFieldsToCsv,
} from "./eltaxFileFormat";

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

describe("eltaxDraftFields", () => {
  it("returns the individual field set as income-context reference rows (no local income-levy calculation)", () => {
    const estimate = estimateForIndividual([
      tx({ amount: 1_000_000 }),
      tx({ id: "2", amount: -200_000, account: "消耗品費", taxCategory: "課税仕入10%" }),
    ]);
    const fields = eltaxDraftFields({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.business_profit_reference).toBe(estimate.businessProfit);
    expect(byKey.taxable_income_reference).toBe(estimate.taxableIncome);
  });

  it("returns the corporate field set with income totals, per-capita levy, and a tax-due reference", () => {
    const estimate = estimateForMicroCorp([
      tx({ amount: 5_000_000 }),
      tx({ id: "2", amount: -1_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
    ]);
    const fields = eltaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

    expect(byKey.revenue_reference).toBe(estimate.revenue);
    expect(byKey.expenses_reference).toBe(estimate.expenses);
    expect(byKey.taxable_income_reference).toBe(estimate.taxableIncome);
    expect(byKey.per_capita_tax).toBe(estimate.perCapitaTaxReference);
  });

  it("includes every assumption note as its own 前提条件 row so caveats survive the export", () => {
    const estimate = estimateForMicroCorp([]);
    const fields = eltaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    const assumptionRows = fields.filter((f) => f.label === "前提条件");
    expect(assumptionRows).toHaveLength(estimate.assumptions.length);
  });

  describe("edge cases", () => {
    it("handles zero income (no transactions) without throwing", () => {
      const individual = estimateForIndividual([]);
      const corporate = estimateForMicroCorp([]);

      const individualFields = eltaxDraftFields({ taxpayerKind: "individual", estimate: individual, taxYear: 2026 });
      const corporateFields = eltaxDraftFields({ taxpayerKind: "corporate", estimate: corporate, taxYear: 2026 });

      const individualByKey = Object.fromEntries(individualFields.map((f) => [f.key, f.value]));
      const corporateByKey = Object.fromEntries(corporateFields.map((f) => [f.key, f.value]));

      expect(individualByKey.business_profit_reference).toBe(0);
      expect(individualByKey.taxable_income_reference).toBe(0);
      expect(corporateByKey.revenue_reference).toBe(0);
      expect(corporateByKey.taxable_income_reference).toBe(0);
      // 均等割は所得に関わらず発生しうる固定額の参考値なので、0円の売上でも出力される。
      expect(corporateByKey.per_capita_tax).toBe(corporate.perCapitaTaxReference);
    });

    it("surfaces a negative business profit for an individual loss scenario without clamping the reference value", () => {
      const estimate = estimateForIndividual([
        tx({ amount: 100_000 }),
        tx({ id: "2", amount: -900_000, account: "消耗品費", taxCategory: "課税仕入10%" }),
      ]);
      expect(estimate.businessProfit).toBeLessThan(0);

      const fields = eltaxDraftFields({ taxpayerKind: "individual", estimate, taxYear: 2026 });
      const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

      expect(byKey.business_profit_reference).toBe(estimate.businessProfit);
      expect(byKey.business_profit_reference).toBeLessThan(0);
      // 課税所得金額は0円未満にはならない（tax/estimate.tsのfloor仕様に追従）。
      expect(byKey.taxable_income_reference).toBe(0);
    });

    it("floor-clamps the corporate taxable income reference to zero in a loss scenario, while still reporting the per-capita levy", () => {
      const estimate = estimateForMicroCorp([
        tx({ amount: 500_000 }),
        tx({ id: "2", amount: -3_000_000, account: "外注費", taxCategory: "課税仕入10%" }),
      ]);
      const fields = eltaxDraftFields({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
      const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

      expect(byKey.taxable_income_reference).toBe(0);
      // 均等割は赤字でも発生しうる（法人住民税の性質上、所得がゼロでも課される）ため、
      // 参考値として出力され続ける。
      expect(byKey.per_capita_tax).toBe(estimate.perCapitaTaxReference);
    });
  });
});

describe("eltaxDraftFieldsToCsv", () => {
  it("emits the documented header row", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = eltaxDraftFieldsToCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe(ELTAX_DRAFT_FIELD_HEADERS.join(","));
  });

  it("notes that individual local tax filing is usually unnecessary because it piggybacks on the income tax return", () => {
    const estimate = estimateForIndividual([]);
    const csv = eltaxDraftFieldsToCsv({ taxpayerKind: "individual", estimate, taxYear: 2026 });
    expect(csv).toMatch(/別途eLTAX申告は不要な場合がほとんど/);
  });
});

describe("buildEltaxDraftCsv", () => {
  it("includes the draft/non-representation disclaimer", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toContain(ELTAX_DRAFT_DISCLAIMER);
  });

  it("never claims the company files the return on the user's behalf", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).not.toMatch(/申告(いたし|し)ました|代理.?で.?申告|当社が(送信|代理送信)します/);
  });

  it("includes the schema version so future real-eltax migrations can detect this placeholder format", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toContain(`スキーマバージョン: ${ELTAX_DRAFT_SCHEMA_VERSION}`);
  });

  it("includes a fixed generated-at timestamp, tax year, taxpayer name, and municipality when supplied", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({
      taxpayerKind: "corporate",
      estimate,
      taxYear: 2025,
      taxpayerName: "今ごえん合同会社",
      municipality: "東京都渋谷区",
      generatedAt: new Date("2026-07-29T00:00:00.000Z"),
    });
    expect(csv).toContain("出力日時: 2026-07-29T00:00:00.000Z");
    expect(csv).toContain("対象年分/事業年度: 2025");
    expect(csv).toContain("氏名/名称: 今ごえん合同会社");
    expect(csv).toContain("提出先自治体: 東京都渋谷区");
  });

  it("falls back to a placeholder municipality field prompting PCdesk selection when none is supplied", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toContain("提出先自治体: （未選択。PCdesk上でご選択ください）");
  });

  it("embeds the field table under its own section marker", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toContain("■ 下書きデータ");
    expect(csv).toContain(ELTAX_DRAFT_FIELD_HEADERS.join(","));
    expect(csv).toContain("均等割額（参考値）");
  });

  it("stamps an ISO-8601 generated-at timestamp using the current time when none is supplied", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = buildEltaxDraftCsv({ taxpayerKind: "corporate", estimate, taxYear: 2026 });
    expect(csv).toMatch(/出力日時: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});
