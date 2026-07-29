import { describe, expect, it } from "vitest";
import { buildConsumptionTaxForm, buildConsumptionTaxReturnForm } from "./consumptionTaxForm";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-01",
    description: "test",
    amount: 0,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("buildConsumptionTaxForm", () => {
  it("computes taxable sales/purchase amounts split into national and local tax", () => {
    const rows = [
      tx({ id: "1", amount: 1_100_000, taxCategory: "課税売上10%", account: "売上高" }),
      tx({ id: "2", amount: -550_000, taxCategory: "課税仕入10%", account: "外注費" }),
      tx({ id: "3", amount: -108_000, taxCategory: "課税仕入8%(軽減)", account: "会議費" }),
    ];
    const form = buildConsumptionTaxForm(rows);

    // ①課税標準額: 1,100,000円(税込)から消費税10,0000円を除いた税抜1,000,000円（1,000円未満切り捨て済み）
    expect(form.taxStandardBase).toBe(1_000_000);
    // ②消費税額: 税込110万円の税抜100,000円のうち国税7.8%相当
    expect(form.taxOnSales).toBe(78_000);
    // ④控除対象仕入税額: 標準10%仕入の国税分39,000円 + 軽減8%仕入の国税分6,240円
    expect(form.deductibleInputTax).toBe(45_240);
    expect(form.deductionSubtotal).toBe(form.deductibleInputTax);
    // ⑨差引税額: (78,000-45,240)=32,760円を100円未満切り捨て
    expect(form.nationalTaxDue).toBe(32_700);
    expect(form.localTaxBase).toBe(form.nationalTaxDue);
    // ⑳地方消費税: 32,700×22/78=9,223.07...円を100円未満切り捨て
    expect(form.localTaxDue).toBe(9_200);
    // ㉖合計納付税額
    expect(form.totalDue).toBe(32_700 + 9_200);
  });

  it("excludes 非課税・不課税・対象外・要確認 transactions from the taxable base entirely", () => {
    const rows = [
      tx({ id: "1", amount: 1_100_000, taxCategory: "課税売上10%", account: "売上高" }),
      tx({ id: "2", amount: 500_000, taxCategory: "非課税", account: "受取利息" }),
      tx({ id: "3", amount: 300_000, taxCategory: "不課税", account: "雑収入" }),
      tx({ id: "4", amount: -200_000, taxCategory: "対象外", account: "租税公課" }),
      tx({ id: "5", amount: -150_000, taxCategory: "要確認", account: "雑費" }),
    ];
    const form = buildConsumptionTaxForm(rows);

    // 非課税・不課税の売上は課税標準額や②消費税額に一切反映されない
    expect(form.taxStandardBase).toBe(1_000_000);
    expect(form.taxOnSales).toBe(78_000);
    // 対象外・要確認の仕入は控除対象仕入税額に一切反映されない
    expect(form.deductibleInputTax).toBe(0);
  });

  it("excludes personalDeductionOnly expenses from deductible input tax even when taxable", () => {
    const rows = [
      tx({ id: "1", amount: 1_100_000, taxCategory: "課税売上10%", account: "売上高" }),
      tx({
        id: "2",
        amount: -550_000,
        taxCategory: "課税仕入10%",
        account: "社会保険料",
        personalDeductionOnly: true,
      }),
    ];
    const form = buildConsumptionTaxForm(rows);

    expect(form.deductibleInputTax).toBe(0);
    expect(form.nationalTaxDue).toBe(78_000);
  });

  it("floors the tax due at 0 (refund territory) when deductible input tax exceeds tax on sales", () => {
    const rows = [
      tx({ id: "1", amount: 220_000, taxCategory: "課税売上10%", account: "売上高" }),
      tx({ id: "2", amount: -1_100_000, taxCategory: "課税仕入10%", account: "設備費" }),
    ];
    const form = buildConsumptionTaxForm(rows);

    expect(form.taxOnSales).toBe(15_600);
    expect(form.deductibleInputTax).toBe(78_000);
    expect(form.nationalTaxDue).toBe(0);
    expect(form.localTaxBase).toBe(0);
    expect(form.localTaxDue).toBe(0);
    expect(form.totalDue).toBe(0);
  });

  it("flags isLikelyExempt when total income (including non-taxable income) is at or below 10,000,000 yen", () => {
    const atThreshold = buildConsumptionTaxForm([
      tx({ id: "1", amount: 9_500_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 500_000, taxCategory: "非課税" }),
    ]);
    expect(atThreshold.isLikelyExempt).toBe(true);

    const overThreshold = buildConsumptionTaxForm([
      tx({ id: "1", amount: 9_500_000, taxCategory: "課税売上10%" }),
      tx({ id: "2", amount: 500_001, taxCategory: "非課税" }),
    ]);
    expect(overThreshold.isLikelyExempt).toBe(false);
  });

  // Regression: 免税判定に使う totalIncome（isLikelyExempt の基準）に、借入金の実行や
  // 出資の払込みのような課税売上に該当しない資金調達を含めてはならない。含めてしまうと、
  // 実際の課税売上高が1,000万円以下でも、借入・出資の分だけ合計が押し上げられて誤って
  // 「免税事業者ではない」と判定されてしまう。
  it("does not let loan proceeds or capital contributions push isLikelyExempt to false", () => {
    const rows = [
      tx({ id: "1", amount: 3_000_000, taxCategory: "課税売上10%", account: "売上高" }),
      tx({
        id: "2",
        amount: 8_000_000,
        taxCategory: "対象外",
        account: "借入金",
        excludeFromIncome: true,
      }),
    ];
    const form = buildConsumptionTaxForm(rows);
    expect(form.isLikelyExempt).toBe(true);
  });

  it("returns all zeros for an empty input", () => {
    const form = buildConsumptionTaxForm([]);
    expect(form).toEqual({
      taxStandardBase: 0,
      taxOnSales: 0,
      deductibleInputTax: 0,
      deductionSubtotal: 0,
      nationalTaxDue: 0,
      localTaxBase: 0,
      localTaxDue: 0,
      totalDue: 0,
      isLikelyExempt: true,
    });
  });
});

describe("buildConsumptionTaxReturnForm", () => {
  const baseRows = [
    tx({ id: "1", amount: 1_100_000, taxCategory: "課税売上10%", account: "売上高" }),
    tx({ id: "2", amount: -550_000, taxCategory: "課税仕入10%", account: "外注費" }),
    tx({ id: "3", amount: -108_000, taxCategory: "課税仕入8%(軽減)", account: "会議費" }),
  ];

  it("defaults to the general taxation method and matches buildConsumptionTaxForm's figures", () => {
    const legacy = buildConsumptionTaxForm(baseRows);
    const form = buildConsumptionTaxReturnForm(baseRows);

    expect(form.method).toBe("general");
    expect(form.taxStandardBase).toBe(legacy.taxStandardBase);
    expect(form.taxOnSales).toBe(legacy.taxOnSales);
    expect(form.deductibleInputTax).toBe(legacy.deductibleInputTax);
    expect(form.nationalTaxDue).toBe(legacy.nationalTaxDue);
    expect(form.localTaxDue).toBe(legacy.localTaxDue);
    expect(form.totalDue).toBe(legacy.totalDue);
    expect(form.simplifiedAppendix).toBeUndefined();
    expect(form.twentyPercentSpecialAppendix).toBeUndefined();
  });

  it("builds the second-table (課税標準額等の内訳書) rate breakdown", () => {
    const form = buildConsumptionTaxReturnForm(baseRows);

    expect(form.secondTable.standardRate).toEqual({ taxableBase: 1_000_000, tax: 78_000 });
    // 現状の分類辞書には軽減税率売上の区分がないため、軽減税率分は常に0円
    expect(form.secondTable.reducedRate).toEqual({ taxableBase: 0, tax: 0 });
    expect(form.secondTable.taxStandardBaseTotal).toBe(1_000_000);
    expect(form.secondTable.taxOnSalesTotal).toBe(78_000);
  });

  it("computes deductible input tax via the deemed purchase rate under simplified taxation, defaulting to business category 5", () => {
    const form = buildConsumptionTaxReturnForm(baseRows, { method: "simplified" });

    expect(form.method).toBe("simplified");
    // ②消費税額78,000円 × みなし仕入率50%（第五種・既定）＝39,000円
    expect(form.simplifiedAppendix).toMatchObject({ businessCategory: 5, deemedPurchaseRate: 0.5 });
    expect(form.deductibleInputTax).toBe(39_000);
    expect(form.nationalTaxDue).toBe(39_000);
    expect(form.localTaxDue).toBe(11_000);
    expect(form.totalDue).toBe(50_000);
    // 簡易課税では実額の仕入取引は一切参照しない
    expect(form.deductibleInputTax).not.toBe(45_240);
  });

  it("uses the selected business category's deemed purchase rate under simplified taxation", () => {
    const form = buildConsumptionTaxReturnForm(baseRows, {
      method: "simplified",
      simplifiedBusinessCategory: 1,
    });

    // ②消費税額78,000円 × みなし仕入率90%（第一種・卸売業）＝70,200円
    expect(form.simplifiedAppendix).toMatchObject({ businessCategory: 1, deemedPurchaseRate: 0.9 });
    expect(form.deductibleInputTax).toBe(70_200);
    expect(form.nationalTaxDue).toBe(7_800);
    expect(form.localTaxDue).toBe(2_200);
    expect(form.totalDue).toBe(10_000);
  });

  it("computes deductible input tax at a flat 80% deemed rate under the 2-wari (invoice transition) special rule", () => {
    const form = buildConsumptionTaxReturnForm(baseRows, { method: "twentyPercentSpecial" });

    expect(form.method).toBe("twentyPercentSpecial");
    // ②消費税額78,000円 × 80% ＝62,400円（納税額は売上税額の2割相当）
    expect(form.twentyPercentSpecialAppendix).toEqual({ deemedPurchaseRate: 0.8, deductibleInputTax: 62_400 });
    expect(form.deductibleInputTax).toBe(62_400);
    expect(form.nationalTaxDue).toBe(15_600);
    expect(form.localTaxDue).toBe(4_400);
    expect(form.totalDue).toBe(20_000);
    expect(form.simplifiedAppendix).toBeUndefined();
  });

  it("flags isLikelyExempt consistently regardless of taxation method", () => {
    const smallBusinessRows = [tx({ id: "1", amount: 9_500_000, taxCategory: "課税売上10%" })];

    const simplified = buildConsumptionTaxReturnForm(smallBusinessRows, { method: "simplified" });
    const special = buildConsumptionTaxReturnForm(smallBusinessRows, { method: "twentyPercentSpecial" });

    expect(simplified.isLikelyExempt).toBe(true);
    expect(special.isLikelyExempt).toBe(true);
  });

  it("returns all zeros with no appendices for an empty input under every method", () => {
    for (const method of ["general", "simplified", "twentyPercentSpecial"] as const) {
      const form = buildConsumptionTaxReturnForm([], { method });
      expect(form.taxStandardBase).toBe(0);
      expect(form.taxOnSales).toBe(0);
      expect(form.deductibleInputTax).toBe(0);
      expect(form.nationalTaxDue).toBe(0);
      expect(form.localTaxDue).toBe(0);
      expect(form.totalDue).toBe(0);
      expect(form.isLikelyExempt).toBe(true);
      expect(form.secondTable).toEqual({
        standardRate: { taxableBase: 0, tax: 0 },
        reducedRate: { taxableBase: 0, tax: 0 },
        taxStandardBaseTotal: 0,
        taxOnSalesTotal: 0,
      });
    }
  });
});
