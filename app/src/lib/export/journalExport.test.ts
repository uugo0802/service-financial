import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { estimateForIndividual } from "../tax/estimate";
import { estimateForMicroCorp } from "../tax/corporateEstimate";
import {
  EXPORT_DISCLAIMER,
  JOURNAL_ENTRY_CSV_HEADERS,
  buildJournalExportCsv,
  journalEntriesToCsv,
  taxEstimateSummaryRows,
  taxEstimateSummaryToCsv,
} from "./journalExport";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    id: "1",
    date: "2026-01-05",
    description: "事務用品購入",
    amount: -3000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("journalEntriesToCsv", () => {
  it("emits the expected header row in the documented column order", () => {
    const csv = journalEntriesToCsv([]);
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe(JOURNAL_ENTRY_CSV_HEADERS.join(","));
  });

  it("returns only the header row for an empty entry list", () => {
    const csv = journalEntriesToCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  it("renders a plain entry as a comma-separated row in column order", () => {
    const csv = journalEntriesToCsv([tx({})]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe("2026-01-05,事務用品購入,-3000,消耗品費,課税仕入10%,,ルール自動判定,1");
  });

  it("maps every CategorySource to its Japanese label", () => {
    const csv = journalEntriesToCsv([
      tx({ id: "a", source: "rule" }),
      tx({ id: "b", source: "ai" }),
      tx({ id: "c", source: "uncategorized" }),
      tx({ id: "d", source: "manual" }),
    ]);
    const rows = csv.split("\r\n").slice(1);
    expect(rows[0]).toContain("ルール自動判定");
    expect(rows[1]).toContain("AI自動判定");
    expect(rows[2]).toContain("未分類");
    expect(rows[3]).toContain("手入力");
  });

  it("quotes a description field containing a comma", () => {
    const csv = journalEntriesToCsv([tx({ description: "打ち合わせ, 会食代" })]);
    expect(csv).toContain('"打ち合わせ, 会食代"');
  });

  it("quotes and doubles internal double-quotes in a memo field", () => {
    const csv = journalEntriesToCsv([tx({ note: 'クライアント"A社"向け' })]);
    expect(csv).toContain('"クライアント""A社""向け"');
  });

  it("quotes a memo field containing an embedded newline, keeping it a single logical row", () => {
    const csv = journalEntriesToCsv([tx({ note: "備考1行目\n備考2行目" })]);
    expect(csv).toContain('"備考1行目\n備考2行目"');
    // 埋め込まれた素の"\n"はCSVの行区切りである"\r\n"とは別物なので、
    // レコード数は依然としてヘッダー+1行のまま。
    const recordCount = csv.split("\r\n").filter((line) => line.length > 0).length;
    expect(recordCount).toBe(2);
  });

  it("does not quote a field with no special characters", () => {
    const csv = journalEntriesToCsv([tx({ description: "通常の摘要" })]);
    expect(csv).toContain(",通常の摘要,");
  });

  it("renders an empty memo as an empty field rather than the literal 'undefined'", () => {
    const csv = journalEntriesToCsv([tx({ note: undefined })]);
    expect(csv).not.toContain("undefined");
  });
});

describe("taxEstimateSummaryToCsv", () => {
  it("uses a fixed 項目/内容 header for the individual estimate", () => {
    const estimate = estimateForIndividual([tx({ amount: 1_000_000, account: "売上高", taxCategory: "課税売上10%" })]);
    const csv = taxEstimateSummaryToCsv({ kind: "individual", estimate });
    expect(csv.split("\r\n")[0]).toBe("項目,内容");
  });

  it("labels the individual estimate section distinctly from the corporate one", () => {
    const individual = estimateForIndividual([]);
    const corporate = estimateForMicroCorp([]);

    const individualRows = taxEstimateSummaryRows({ kind: "individual", estimate: individual });
    const corporateRows = taxEstimateSummaryRows({ kind: "corporate", estimate: corporate });

    expect(individualRows[0]).toEqual({ label: "区分", value: "個人事業主（所得税・消費税の概算試算）" });
    expect(corporateRows[0]).toEqual({ label: "区分", value: "マイクロ法人（法人税・消費税の概算試算）" });
  });

  it("includes every assumption note as its own 前提条件 row so caveats survive the export", () => {
    const estimate = estimateForMicroCorp([]);
    const rows = taxEstimateSummaryRows({ kind: "corporate", estimate });
    const assumptionRows = rows.filter((r) => r.label === "前提条件");
    expect(assumptionRows).toHaveLength(estimate.assumptions.length);
  });

  it("renders an assumption sentence unquoted when it has no RFC4180-special characters", () => {
    const estimate = estimateForMicroCorp([]);
    const csv = taxEstimateSummaryToCsv({ kind: "corporate", estimate });
    const plainAssumption = estimate.assumptions.find((a) => !/[",\r\n]/.test(a));
    expect(plainAssumption).toBeDefined();
    expect(csv).toContain(`前提条件,${plainAssumption}`);
  });
});

describe("buildJournalExportCsv", () => {
  it("includes the legal-safe disclaimer framing the data as a handoff, not a filed return", () => {
    const csv = buildJournalExportCsv({ entries: [] });
    expect(csv).toContain(EXPORT_DISCLAIMER);
  });

  it("never claims the service filed anything on the user's behalf", () => {
    const csv = buildJournalExportCsv({ entries: [tx({})] });
    expect(csv).not.toMatch(/申告(いたし|し)ました|代理.?で.?申告/);
    // 「当社が申告や税務代理を行うものではありません」という否定文以外の形で
    // 「当社が申告」という肯定的な主張が出てこないことを確認する。
    expect(csv).not.toMatch(/当社が申告(?!や税務代理を行うものではありません)/);
  });

  it("includes a fixed generated-at timestamp when one is supplied, for deterministic output", () => {
    const csv = buildJournalExportCsv({ entries: [], generatedAt: new Date("2026-07-29T00:00:00.000Z") });
    expect(csv).toContain("出力日時: 2026-07-29T00:00:00.000Z");
  });

  it("embeds the full journal entry table under its own section marker", () => {
    const csv = buildJournalExportCsv({ entries: [tx({})] });
    expect(csv).toContain("■ 仕訳明細");
    expect(csv).toContain(JOURNAL_ENTRY_CSV_HEADERS.join(","));
    expect(csv).toContain("消耗品費");
  });

  it("omits the tax estimate section entirely when no summary is provided", () => {
    const csv = buildJournalExportCsv({ entries: [] });
    expect(csv).not.toContain("■ 税額概算サマリー");
  });

  it("embeds the tax estimate summary under its own section marker when provided", () => {
    const estimate = estimateForIndividual([tx({ amount: 1_000_000, account: "売上高", taxCategory: "課税売上10%" })]);
    const csv = buildJournalExportCsv({ entries: [], taxEstimate: { kind: "individual", estimate } });
    expect(csv).toContain("■ 税額概算サマリー");
    expect(csv).toContain("項目,内容");
  });

  it("produces only header rows and section markers for a fully empty export", () => {
    const csv = buildJournalExportCsv({ entries: [] });
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain(JOURNAL_ENTRY_CSV_HEADERS.join(","));
  });
});
