import { describe, expect, it } from "vitest";
import { CategorizedTransaction } from "../categorize/engine";
import { buildGeneralLedger, listLedgerAccounts } from "./generalLedger";

function tx(overrides: Partial<CategorizedTransaction> & Pick<CategorizedTransaction, "id" | "date" | "amount">): CategorizedTransaction {
  return {
    description: "取引",
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "manual",
    ...overrides,
  };
}

describe("buildGeneralLedger", () => {
  const entries: CategorizedTransaction[] = [
    tx({ id: "1", date: "2026-01-10", description: "文具", amount: -3000 }),
    tx({ id: "2", date: "2026-01-05", description: "書籍", amount: -1500 }),
    tx({ id: "3", date: "2026-01-08", description: "コンサル売上", amount: 50000, account: "売上高", taxCategory: "課税売上10%" }),
    tx({ id: "4", date: "2026-01-05", description: "追加購入", amount: -500 }),
  ];

  it("only includes rows for the selected account, in ascending date order", () => {
    const ledger = buildGeneralLedger(entries, "消耗品費");
    expect(ledger.rows.map((r) => r.id)).toEqual(["2", "4", "1"]);
    expect(ledger.rows.every((r) => r.date <= "2026-01-10")).toBe(true);
  });

  it("preserves input order for entries on the same date (stable sort)", () => {
    const ledger = buildGeneralLedger(entries, "消耗品費");
    // id 2 and id 4 both fall on 2026-01-05; id 2 appears first in the input, so it must stay first.
    const sameDayIds = ledger.rows.filter((r) => r.date === "2026-01-05").map((r) => r.id);
    expect(sameDayIds).toEqual(["2", "4"]);
  });

  it("maps a negative amount to the debit column and a positive amount to the credit column", () => {
    const ledger = buildGeneralLedger(entries, "売上高");
    expect(ledger.rows).toEqual([
      expect.objectContaining({ id: "3", debit: 0, credit: 50000 }),
    ]);

    const expenseLedger = buildGeneralLedger(entries, "消耗品費");
    for (const row of expenseLedger.rows) {
      expect(row.credit).toBe(0);
      expect(row.debit).toBeGreaterThan(0);
    }
  });

  it("accumulates a running balance starting from the opening balance (前期繰越)", () => {
    const ledger = buildGeneralLedger(entries, "消耗品費", { openingBalance: 10000 });
    expect(ledger.openingBalance).toBe(10000);
    // 10000 -1500(id2) -500(id4) -3000(id1) => running balance grows by the debit amounts
    expect(ledger.rows.map((r) => r.balance)).toEqual([11500, 12000, 15000]);
    expect(ledger.totalDebit).toBe(5000);
    expect(ledger.totalCredit).toBe(0);
    expect(ledger.closingBalance).toBe(15000);
  });

  it("defaults the opening balance to 0 when not provided", () => {
    const ledger = buildGeneralLedger(entries, "消耗品費");
    expect(ledger.openingBalance).toBe(0);
    expect(ledger.closingBalance).toBe(5000);
  });

  it("filters rows by an inclusive date range when dateFrom/dateTo are provided", () => {
    const ledger = buildGeneralLedger(entries, "消耗品費", { dateFrom: "2026-01-06", dateTo: "2026-01-31" });
    expect(ledger.rows.map((r) => r.id)).toEqual(["1"]);
    expect(ledger.closingBalance).toBe(3000);
  });

  it("returns an empty ledger (rows: []) when no entry matches the account", () => {
    const ledger = buildGeneralLedger(entries, "架空の勘定科目", { openingBalance: 7000 });
    expect(ledger.rows).toEqual([]);
    expect(ledger.totalDebit).toBe(0);
    expect(ledger.totalCredit).toBe(0);
    expect(ledger.closingBalance).toBe(7000);
  });

  it("trims whitespace around the requested account name", () => {
    const ledger = buildGeneralLedger(entries, "  消耗品費  ");
    expect(ledger.account).toBe("消耗品費");
    expect(ledger.rows).toHaveLength(3);
  });

  it("matches an entry whose own account name has incidental surrounding whitespace (e.g. untrimmed OCR/import data), consistent with listLedgerAccounts' trimmed selector options", () => {
    // listLedgerAccounts() trims each entry.account before offering it as a selector option
    // (see the "returns each distinct, non-blank account exactly once" test below, which feeds
    // it an entry with account: "  "). If a real entry's account has *some* non-blank text plus
    // incidental whitespace (e.g. "消耗品費 " with a trailing space from an untrimmed OCR/import
    // source), the selector shows the trimmed "消耗品費" option, so selecting it must still surface
    // that entry's row here — not silently return an empty ledger.
    const untrimmedEntries: CategorizedTransaction[] = [
      tx({ id: "u1", date: "2026-04-01", amount: -1200, account: " 消耗品費" }),
      tx({ id: "u2", date: "2026-04-02", amount: -800, account: "消耗品費\t" }),
    ];
    const ledger = buildGeneralLedger(untrimmedEntries, "消耗品費");
    expect(ledger.rows.map((r) => r.id)).toEqual(["u1", "u2"]);
    expect(ledger.totalDebit).toBe(2000);
  });

  it("records a zero-amount entry as both zero debit and zero credit without affecting the running balance", () => {
    const zeroEntries: CategorizedTransaction[] = [
      tx({ id: "z1", date: "2026-03-01", amount: 0 }),
    ];
    const ledger = buildGeneralLedger(zeroEntries, "消耗品費", { openingBalance: 5000 });
    expect(ledger.rows).toEqual([expect.objectContaining({ id: "z1", debit: 0, credit: 0, balance: 5000 })]);
    expect(ledger.totalDebit).toBe(0);
    expect(ledger.totalCredit).toBe(0);
    expect(ledger.closingBalance).toBe(5000);
  });

  it("carries through taxCategory, source and note for each row", () => {
    const withNote: CategorizedTransaction[] = [
      tx({ id: "5", date: "2026-02-01", amount: -800, note: "備考メモ", source: "ai", confidence: 0.9 }),
    ];
    const ledger = buildGeneralLedger(withNote, "消耗品費");
    expect(ledger.rows[0]).toMatchObject({ taxCategory: "課税仕入10%", source: "ai", note: "備考メモ" });
  });
});

describe("listLedgerAccounts", () => {
  it("returns each distinct, non-blank account exactly once", () => {
    const entries: CategorizedTransaction[] = [
      tx({ id: "1", date: "2026-01-01", amount: -100, account: "消耗品費" }),
      tx({ id: "2", date: "2026-01-02", amount: 200, account: "売上高" }),
      tx({ id: "3", date: "2026-01-03", amount: -300, account: "消耗品費" }),
      tx({ id: "4", date: "2026-01-04", amount: -50, account: "  " }),
    ];
    const accounts = listLedgerAccounts(entries);
    expect(accounts).toHaveLength(2);
    expect(new Set(accounts)).toEqual(new Set(["消耗品費", "売上高"]));
  });

  it("returns accounts sorted in ascending order", () => {
    const entries: CategorizedTransaction[] = [
      tx({ id: "1", date: "2026-01-01", amount: -100, account: "2000_旅費交通費" }),
      tx({ id: "2", date: "2026-01-02", amount: -100, account: "1000_消耗品費" }),
    ];
    expect(listLedgerAccounts(entries)).toEqual(["1000_消耗品費", "2000_旅費交通費"]);
  });

  it("returns an empty array for an empty entry list", () => {
    expect(listLedgerAccounts([])).toEqual([]);
  });
});
