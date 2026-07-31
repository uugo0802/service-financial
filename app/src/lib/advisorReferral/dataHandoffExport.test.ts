import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { estimateForIndividual } from "../tax/estimate";
import { estimateForMicroCorp } from "../tax/corporateEstimate";
import { EXPORT_DISCLAIMER } from "../export/journalExport";
import { DEFAULT_CASH_ACCOUNT } from "../tax/trialBalance";
import {
  TRIAL_BALANCE_CSV_HEADERS,
  buildDataHandoffPackage,
  trialBalanceToCsv,
} from "./dataHandoffExport";

function tx(overrides: Partial<CategorizedTransaction> & Pick<CategorizedTransaction, "date" | "amount" | "account">): CategorizedTransaction {
  return {
    id: overrides.id ?? `${overrides.date}-${overrides.account}-${overrides.amount}`,
    description: overrides.description ?? "サンプル取引",
    taxCategory: overrides.taxCategory ?? "課税売上10%",
    confidence: overrides.confidence ?? 1,
    source: overrides.source ?? "rule",
    ...overrides,
  };
}

const SAMPLE_ENTRIES: CategorizedTransaction[] = [
  tx({ date: "2026-04-10", amount: 550_000, account: "売上高" }),
  tx({ date: "2026-04-15", amount: -32_000, account: "地代家賃", taxCategory: "課税仕入10%" }),
  tx({ date: "2026-06-01", amount: 780_000, account: "売上高" }),
];

const FIXED_NOW = new Date("2026-07-31T00:00:00.000Z");

describe("trialBalanceToCsv", () => {
  it("emits the documented header row", () => {
    const tb = { lines: [], openingDebitTotal: 0, openingCreditTotal: 0, periodDebitTotal: 0, periodCreditTotal: 0, closingDebitTotal: 0, closingCreditTotal: 0, periodStart: "-", periodEnd: "-", balanced: true };
    const csv = trialBalanceToCsv(tb);
    expect(csv.split("\r\n")[0]).toBe(TRIAL_BALANCE_CSV_HEADERS.join(","));
  });

  it("renders one row per account plus a trailing 合計 row", () => {
    const tb = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW }).trialBalance;
    const csv = trialBalanceToCsv(tb);
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(1 + tb.lines.length + 1); // header + lines + total
    expect(rows[rows.length - 1].startsWith("合計,")).toBe(true);
  });

  it("quotes account names containing commas", () => {
    const tb = buildDataHandoffPackage({
      entries: [tx({ date: "2026-04-10", amount: 1000, account: "売上高, 特別" })],
      generatedAt: FIXED_NOW,
    }).trialBalance;
    const csv = trialBalanceToCsv(tb);
    expect(csv).toContain('"売上高, 特別"');
  });
});

describe("buildDataHandoffPackage", () => {
  it("reuses buildJournalExportCsv output verbatim for the journal export section", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    expect(pkg.journalExportCsv).toContain("■ 仕訳明細");
    expect(pkg.journalExportCsv).toContain(EXPORT_DISCLAIMER);
    expect(pkg.journalExportCsv).toContain("売上高");
  });

  it("reuses buildTrialBalance's computed totals rather than recomputing them", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    const salesLine = pkg.trialBalance.lines.find((l) => l.account === "売上高");
    expect(salesLine?.periodCredit).toBe(550_000 + 780_000);
    expect(pkg.trialBalance.balanced).toBe(true);
  });

  it("stamps the supplied generatedAt in ISO-8601 form", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    expect(pkg.generatedAt).toBe("2026-07-31T00:00:00.000Z");
  });

  it("stamps the current time when generatedAt is omitted", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES });
    expect(pkg.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("includes the tax estimate summary in the journal CSV and notes its presence in the cover sheet when supplied", () => {
    const estimate = estimateForIndividual(SAMPLE_ENTRIES);
    const pkg = buildDataHandoffPackage({
      entries: SAMPLE_ENTRIES,
      taxEstimate: { kind: "individual", estimate },
      generatedAt: FIXED_NOW,
    });
    expect(pkg.journalExportCsv).toContain("■ 税額概算サマリー");
    expect(pkg.coverSheetMarkdown).toContain("税額概算サマリー: 仕訳明細CSVの末尾に含まれています");
  });

  it("notes the absence of a tax estimate in the cover sheet when none is supplied", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    expect(pkg.journalExportCsv).not.toContain("■ 税額概算サマリー");
    expect(pkg.coverSheetMarkdown).toContain("税額概算サマリー: 含まれていません");
  });

  it("carries the recipient label into the cover sheet when supplied, and omits the line otherwise", () => {
    const withRecipient = buildDataHandoffPackage({
      entries: SAMPLE_ENTRIES,
      recipientLabel: "○○税理士事務所",
      generatedAt: FIXED_NOW,
    });
    expect(withRecipient.coverSheetMarkdown).toContain("お渡し先: ○○税理士事務所");

    const withoutRecipient = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    expect(withoutRecipient.coverSheetMarkdown).not.toContain("お渡し先:");
  });

  describe("edge case: empty period (no entries at all)", () => {
    it("reports a placeholder period and zero counts without throwing", () => {
      const pkg = buildDataHandoffPackage({ entries: [], generatedAt: FIXED_NOW });
      expect(pkg.entryCount).toBe(0);
      expect(pkg.periodStart).toBe("-");
      expect(pkg.periodEnd).toBe("-");
      expect(pkg.fiscalYears).toEqual([]);
      expect(pkg.spansMultipleFiscalYears).toBe(false);
      expect(pkg.hasTrialBalanceActivity).toBe(false);
    });

    it("still produces header-only CSVs and a cover sheet noting there is no data", () => {
      const pkg = buildDataHandoffPackage({ entries: [], generatedAt: FIXED_NOW });
      expect(pkg.journalExportCsv).toContain("■ 仕訳明細");
      expect(pkg.trialBalanceCsv).toBe(`${TRIAL_BALANCE_CSV_HEADERS.join(",")}\r\n合計,0,0,0,0`);
      expect(pkg.coverSheetMarkdown).toContain("対象期間のデータがありません");
    });
  });

  describe("edge case: multi-year data", () => {
    const MULTI_YEAR_ENTRIES: CategorizedTransaction[] = [
      tx({ date: "2023-04-10", amount: 300_000, account: "売上高" }),
      tx({ date: "2024-12-20", amount: -15_000, account: "消耗品費" }),
      tx({ date: "2026-06-01", amount: 780_000, account: "売上高" }),
    ];

    it("collects every distinct fiscal year covered by the entries, sorted ascending", () => {
      const pkg = buildDataHandoffPackage({ entries: MULTI_YEAR_ENTRIES, generatedAt: FIXED_NOW });
      expect(pkg.fiscalYears).toEqual([2023, 2024, 2026]);
      expect(pkg.spansMultipleFiscalYears).toBe(true);
    });

    it("spans the full period from the earliest to the latest transaction date", () => {
      const pkg = buildDataHandoffPackage({ entries: MULTI_YEAR_ENTRIES, generatedAt: FIXED_NOW });
      expect(pkg.periodStart).toBe("2023-04-10");
      expect(pkg.periodEnd).toBe("2026-06-01");
    });

    it("flags the multi-year situation in the cover sheet so the advisor is not misled about the period", () => {
      const pkg = buildDataHandoffPackage({ entries: MULTI_YEAR_ENTRIES, generatedAt: FIXED_NOW });
      expect(pkg.coverSheetMarkdown).toContain("複数の会計年度");
      expect(pkg.coverSheetMarkdown).toContain("2023年、2024年、2026年");
    });

    it("does not flag a single fiscal year as spanning multiple years", () => {
      const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
      expect(pkg.fiscalYears).toEqual([2026]);
      expect(pkg.spansMultipleFiscalYears).toBe(false);
      expect(pkg.coverSheetMarkdown).not.toContain("複数の会計年度");
    });
  });

  describe("edge case: missing trial balance activity (entries exist but net to nothing bookable)", () => {
    it("reports hasTrialBalanceActivity=false when every entry is a zero-amount transaction", () => {
      const zeroEntries: CategorizedTransaction[] = [
        tx({ date: "2026-04-10", amount: 0, account: "売上高" }),
        tx({ date: "2026-04-11", amount: 0, account: "雑費" }),
      ];
      const pkg = buildDataHandoffPackage({ entries: zeroEntries, generatedAt: FIXED_NOW });

      expect(pkg.entryCount).toBe(2); // 仕訳明細としては件数が残る
      expect(pkg.trialBalance.lines).toHaveLength(0); // が、試算表には計上されない
      expect(pkg.hasTrialBalanceActivity).toBe(false);
      expect(pkg.trialBalanceCsv).toBe(`${TRIAL_BALANCE_CSV_HEADERS.join(",")}\r\n合計,0,0,0,0`);
      expect(pkg.coverSheetMarkdown).toContain("ヘッダー行のみの空データです");
    });

    it("reports hasTrialBalanceActivity=false and a balanced empty table when trialBalanceOptions filter out every entry by period", () => {
      const pkg = buildDataHandoffPackage({
        entries: SAMPLE_ENTRIES,
        trialBalanceOptions: { periodStart: "2099-01-01", periodEnd: "2099-12-31" },
        generatedAt: FIXED_NOW,
      });

      expect(pkg.entryCount).toBe(SAMPLE_ENTRIES.length); // 仕訳明細CSV自体は絞り込まれない
      expect(pkg.hasTrialBalanceActivity).toBe(false);
      expect(pkg.trialBalance.balanced).toBe(true); // 空の試算表は貸借一致（0=0）
    });

    it("still balances and reports activity when opening balances alone populate the trial balance with no period transactions", () => {
      const pkg = buildDataHandoffPackage({
        entries: [],
        trialBalanceOptions: { openingBalances: { [DEFAULT_CASH_ACCOUNT]: { debit: 100_000 }, 資本金: { credit: 100_000 } } },
        generatedAt: FIXED_NOW,
      });

      expect(pkg.hasTrialBalanceActivity).toBe(true);
      expect(pkg.trialBalance.balanced).toBe(true);
      expect(pkg.coverSheetMarkdown).toContain("貸借一致");
    });
  });

  it("includes the legal-safe disclaimer in the cover sheet, framing this as a data handoff rather than a filed return", () => {
    const pkg = buildDataHandoffPackage({ entries: SAMPLE_ENTRIES, generatedAt: FIXED_NOW });
    expect(pkg.coverSheetMarkdown).toContain(EXPORT_DISCLAIMER);
    expect(pkg.coverSheetMarkdown).toContain("税務代理");
  });

  it("works end to end with a corporate tax estimate as well as an individual one", () => {
    const estimate = estimateForMicroCorp(SAMPLE_ENTRIES);
    const pkg = buildDataHandoffPackage({
      entries: SAMPLE_ENTRIES,
      taxEstimate: { kind: "corporate", estimate },
      generatedAt: FIXED_NOW,
    });
    expect(pkg.journalExportCsv).toContain("マイクロ法人（法人税・消費税の概算試算）");
  });
});
