import { describe, expect, it } from "vitest";
import { buildConsumptionTaxForm } from "./consumptionTaxForm";
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
