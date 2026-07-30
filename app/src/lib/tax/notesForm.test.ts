import { describe, expect, it } from "vitest";
import { buildNotesForm, notesFormSections } from "./notesForm";
import { buildEquityChangeForm } from "./equityChangeForm";

const sampleEquityChange = buildEquityChangeForm({
  capitalStock: 1_000_000,
  openingCash: 3_000_000,
  netIncome: 750_000,
});

describe("buildNotesForm", () => {
  it("defaults the going-concern note to 該当なし when no flag is passed", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.goingConcern.title).toBe("継続企業の前提に関する注記");
    expect(notes.goingConcern.lines).toHaveLength(1);
    expect(notes.goingConcern.lines[0].label).toBe("該当なし");
  });

  it("surfaces a going-concern description when the flag is set", () => {
    const notes = buildNotesForm({
      hasGoingConcernConcern: true,
      goingConcernDescription: "主要取引先の契約終了により売上が急減しています。",
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.goingConcern.lines[0].label).toBe("重要な疑義の内容及び対応策");
    expect(notes.goingConcern.lines[0].value).toBe("主要取引先の契約終了により売上が急減しています。");
  });

  it("falls back to a placeholder when the flag is set but no description is given", () => {
    const notes = buildNotesForm({
      hasGoingConcernConcern: true,
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.goingConcern.lines[0].value).toContain("入力されていません");
  });

  it("falls back to a placeholder when the description is only whitespace", () => {
    const notes = buildNotesForm({
      hasGoingConcernConcern: true,
      goingConcernDescription: "   \n\t  ",
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.goingConcern.lines[0].value).toContain("入力されていません");
  });

  it("always states the cash-basis simplification disclaimer in accounting policy notes", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    const cashBasisLine = notes.significantAccountingPolicies.lines.find((l) =>
      l.label.includes("現金主義")
    );
    expect(cashBasisLine).toBeDefined();
    expect(cashBasisLine?.value).toContain("現金主義的な簡易処理");
  });

  it("reports 該当なし for balance sheet notes when there are no unpaid taxes", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.balanceSheetNotes.lines).toEqual([
      { label: "該当なし", value: "期末時点の未払法人税等・未払消費税等はありません。" },
    ]);
  });

  it("lists unpaid corporate and consumption taxes when present", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 200_000,
      unpaidConsumptionTax: 50_000,
      equityChange: sampleEquityChange,
    });

    expect(notes.balanceSheetNotes.lines).toEqual([
      { label: "未払法人税等（法人税・地方法人税・住民税・事業税等）", value: "200,000円" },
      { label: "未払消費税等", value: "50,000円" },
    ]);
  });

  it("only lists the unpaid tax line that is actually present", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 200_000,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.balanceSheetNotes.lines).toHaveLength(1);
    expect(notes.balanceSheetNotes.lines[0].label).toContain("未払法人税等");
  });

  it("treats a negative unpaid tax figure (data-entry anomaly) as 該当なし rather than displaying a negative amount", () => {
    // The > 0 guard means a negative unpaid-tax figure (which shouldn't occur, but could result
    // from a bad prior calculation) is silently omitted instead of showing a nonsensical negative yen amount.
    const notes = buildNotesForm({
      unpaidCorporateTaxes: -100_000,
      unpaidConsumptionTax: -1,
      equityChange: sampleEquityChange,
    });

    expect(notes.balanceSheetNotes.lines).toEqual([
      { label: "該当なし", value: "期末時点の未払法人税等・未払消費税等はありません。" },
    ]);
  });

  it("reflects the equity change form's ending balances in the equity note", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    expect(notes.equityChangeNotes.lines).toEqual([
      { label: "資本金の当期末残高", value: "1,000,000円" },
      { label: "利益剰余金の当期末残高", value: "2,750,000円" },
      { label: "純資産合計の当期末残高", value: "3,750,000円" },
    ]);
  });

  it("appends share count details when provided and positive", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
      shareCount: 100,
    });

    expect(notes.equityChangeNotes.lines).toContainEqual({
      label: "発行済株式の種類及び総数",
      value: "普通株式 100株",
    });
  });

  it("omits share count details when not provided or zero", () => {
    const notesWithoutShareCount = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });
    const notesWithZeroShareCount = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
      shareCount: 0,
    });

    expect(notesWithoutShareCount.equityChangeNotes.lines).toHaveLength(3);
    expect(notesWithZeroShareCount.equityChangeNotes.lines).toHaveLength(3);
  });
});

describe("notesFormSections", () => {
  it("returns all four sections in a stable, renderable order", () => {
    const notes = buildNotesForm({
      unpaidCorporateTaxes: 0,
      unpaidConsumptionTax: 0,
      equityChange: sampleEquityChange,
    });

    const sections = notesFormSections(notes);
    expect(sections.map((s) => s.title)).toEqual([
      "継続企業の前提に関する注記",
      "重要な会計方針に係る事項に関する注記",
      "貸借対照表に関する注記",
      "株主資本等関係注記",
    ]);
  });
});
