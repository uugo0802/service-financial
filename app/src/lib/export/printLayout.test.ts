import { describe, expect, it } from "vitest";
import {
  DRAFT_WATERMARK_LABEL,
  PRINT_FOOTER_NOTICE,
  buildPrintSectionPlan,
  formatFiscalYearRange,
  selectPrintVisibleFields,
} from "./printLayout";

describe("DRAFT_WATERMARK_LABEL / PRINT_FOOTER_NOTICE", () => {
  it("always frames the printed statement as a draft/simulation, never as an official filing", () => {
    expect(DRAFT_WATERMARK_LABEL).toContain("下書き");
    expect(DRAFT_WATERMARK_LABEL).toContain("シミュレーション");
    expect(PRINT_FOOTER_NOTICE).toContain("下書き");
    expect(PRINT_FOOTER_NOTICE).toContain("正式な決算書ではありません");
    expect(PRINT_FOOTER_NOTICE).not.toContain("当社が申告");
    expect(PRINT_FOOTER_NOTICE).not.toContain("税務代理を行います");
  });
});

describe("formatFiscalYearRange", () => {
  it("formats a period within the same year without repeating the year", () => {
    expect(formatFiscalYearRange("2026-04-10", "2026-06-01")).toBe("2026年4月10日〜6月1日");
  });

  it("formats a period spanning two years with the year on both ends", () => {
    expect(formatFiscalYearRange("2025-10-01", "2026-09-30")).toBe("2025年10月1日〜2026年9月30日");
  });

  it("formats a single-day period", () => {
    expect(formatFiscalYearRange("2026-04-10", "2026-04-10")).toBe("2026年4月10日〜4月10日");
  });

  it("falls back to an 'unset' label when there are no transactions ('-' placeholders)", () => {
    expect(formatFiscalYearRange("-", "-")).toBe("対象期間: 未設定");
  });

  it("falls back to an 'unset' label for unparsable date strings", () => {
    expect(formatFiscalYearRange("not-a-date", "2026-06-01")).toBe("対象期間: 未設定");
    expect(formatFiscalYearRange("2026-06-01", "")).toBe("対象期間: 未設定");
  });
});

describe("selectPrintVisibleFields", () => {
  it("keeps fields that do not set printable (defaults to visible)", () => {
    const fields = [{ key: "tenant", label: "事業者名", value: "今ごえん合同会社" }];
    expect(selectPrintVisibleFields(fields)).toEqual(fields);
  });

  it("excludes fields explicitly marked printable: false", () => {
    const fields = [
      { key: "tenant", label: "事業者名", value: "今ごえん合同会社" },
      { key: "internalNote", label: "内部メモ", value: "UI専用", printable: false },
    ];
    expect(selectPrintVisibleFields(fields)).toEqual([fields[0]]);
  });

  it("preserves input order", () => {
    const fields = [
      { key: "a", label: "A", value: "1" },
      { key: "b", label: "B", value: "2" },
      { key: "c", label: "C", value: "3" },
    ];
    expect(selectPrintVisibleFields(fields).map((f) => f.key)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when given an empty array", () => {
    expect(selectPrintVisibleFields([])).toEqual([]);
  });
});

describe("buildPrintSectionPlan", () => {
  it("marks every section with break-inside-avoid to prevent splitting a table row mid-page", () => {
    const plan = buildPrintSectionPlan([{ id: "balance-sheet" }, { id: "equity-change" }]);
    for (const section of plan) {
      expect(section.className).toContain("print:break-inside-avoid");
    }
  });

  it("never forces a page break before the first section, even if requested", () => {
    const [first] = buildPrintSectionPlan([{ id: "balance-sheet", forceNewPage: true }]);
    expect(first.breakBeforePage).toBe(false);
    expect(first.className).not.toContain("print:break-before-page");
  });

  it("forces a page break before a later section when forceNewPage is set", () => {
    const plan = buildPrintSectionPlan([
      { id: "balance-sheet" },
      { id: "equity-change" },
      { id: "notes", forceNewPage: true },
    ]);
    expect(plan[0].breakBeforePage).toBe(false);
    expect(plan[1].breakBeforePage).toBe(false);
    expect(plan[2].breakBeforePage).toBe(true);
    expect(plan[2].className).toContain("print:break-before-page");
  });

  it("does not force a page break when forceNewPage is omitted or false", () => {
    const plan = buildPrintSectionPlan([{ id: "a" }, { id: "b", forceNewPage: false }]);
    expect(plan.every((s) => !s.breakBeforePage)).toBe(true);
  });

  it("returns an empty array when given no sections", () => {
    expect(buildPrintSectionPlan([])).toEqual([]);
  });
});
