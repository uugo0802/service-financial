import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESCRIPTION_SIMILARITY_THRESHOLD,
  descriptionSimilarity,
  detectDuplicates,
  normalizeDate,
  normalizeDescription,
} from "./duplicateDetection";
import { CategorizedTransaction } from "../categorize/engine";

function tx(overrides: Partial<CategorizedTransaction> & Pick<CategorizedTransaction, "id">): CategorizedTransaction {
  return {
    date: "2026-01-05",
    description: "Amazon.co.jp",
    amount: -6400,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    ...overrides,
  };
}

describe("normalizeDate", () => {
  it("strips non-digit separators so different date formats compare equal", () => {
    expect(normalizeDate("2026-01-05")).toBe(normalizeDate("2026/01/05"));
    expect(normalizeDate("2026-01-05")).toBe("20260105");
  });

  it("leaves purely numeric dates unchanged", () => {
    expect(normalizeDate("20260105")).toBe("20260105");
  });
});

describe("normalizeDescription", () => {
  it("lowercases and strips half-width and full-width whitespace", () => {
    expect(normalizeDescription("Amazon.co.jp")).toBe("amazon.co.jp");
    expect(normalizeDescription(" スターバックス 渋谷店 ")).toBe(normalizeDescription("スターバックス渋谷店"));
    expect(normalizeDescription("スターバックス　渋谷店")).toBe(normalizeDescription("スターバックス渋谷店"));
  });
});

describe("descriptionSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(descriptionSimilarity("Amazon.co.jp", "Amazon.co.jp")).toBe(1);
  });

  it("returns 1 for strings that only differ in case or whitespace", () => {
    expect(descriptionSimilarity("AMAZON.CO.JP", "amazon.co.jp")).toBe(1);
    expect(descriptionSimilarity("スターバックス 渋谷店", "スターバックス　渋谷店")).toBe(1);
  });

  it("returns a high score for near-identical descriptions with minor formatting differences", () => {
    // 取引番号や店舗コードが末尾に付与されただけのケース
    const score = descriptionSimilarity("スターバックス渋谷店", "スターバックス渋谷店12345");
    expect(score).toBeGreaterThanOrEqual(DEFAULT_DESCRIPTION_SIMILARITY_THRESHOLD);
    expect(score).toBeLessThan(1);
  });

  it("returns a low score for genuinely different merchant names", () => {
    const score = descriptionSimilarity("Amazon.co.jp", "スターバックス");
    expect(score).toBeLessThan(DEFAULT_DESCRIPTION_SIMILARITY_THRESHOLD);
  });

  it("treats two empty strings as identical", () => {
    expect(descriptionSimilarity("", "")).toBe(1);
  });
});

describe("detectDuplicates", () => {
  it("flags a new row that exactly matches an existing row (same date/amount/description)", () => {
    const existing = [tx({ id: "existing-1" })];
    const incoming = [tx({ id: "new-1" })];

    const matches = detectDuplicates(existing, incoming);

    expect(matches).toEqual([{ newRowId: "new-1", matchedExistingId: "existing-1", descriptionSimilarity: 1 }]);
  });

  it("flags a match even when the date separators differ between exports", () => {
    const existing = [tx({ id: "existing-1", date: "2026-01-05" })];
    const incoming = [tx({ id: "new-1", date: "2026/01/05" })];

    const matches = detectDuplicates(existing, incoming);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedExistingId).toBe("existing-1");
  });

  it("flags a match when the description has minor formatting differences (e.g. a trailing store code)", () => {
    const existing = [tx({ id: "existing-1", description: "スターバックス渋谷店" })];
    const incoming = [tx({ id: "new-1", description: "スターバックス　渋谷店＊12345" })];

    const matches = detectDuplicates(existing, incoming);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedExistingId).toBe("existing-1");
  });

  it("does not flag rows with a different date", () => {
    const existing = [tx({ id: "existing-1", date: "2026-01-05" })];
    const incoming = [tx({ id: "new-1", date: "2026-01-06" })];

    expect(detectDuplicates(existing, incoming)).toEqual([]);
  });

  it("does not flag rows with a different amount", () => {
    const existing = [tx({ id: "existing-1", amount: -6400 })];
    const incoming = [tx({ id: "new-1", amount: -6500 })];

    expect(detectDuplicates(existing, incoming)).toEqual([]);
  });

  it("does not flag two unrelated transactions that coincidentally share the same date and amount", () => {
    const existing = [tx({ id: "existing-1", date: "2026-01-05", amount: -3000, description: "スターバックス渋谷店" })];
    const incoming = [tx({ id: "new-1", date: "2026-01-05", amount: -3000, description: "タクシー代（深夜）" })];

    expect(detectDuplicates(existing, incoming)).toEqual([]);
  });

  it("picks the best-matching existing row when multiple candidates share the date and amount", () => {
    const existing = [
      tx({ id: "existing-close", date: "2026-01-05", amount: -3000, description: "スターバックス渋谷店＊9999" }),
      tx({ id: "existing-exact", date: "2026-01-05", amount: -3000, description: "スターバックス渋谷店" }),
    ];
    const incoming = [tx({ id: "new-1", date: "2026-01-05", amount: -3000, description: "スターバックス渋谷店" })];

    const matches = detectDuplicates(existing, incoming);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedExistingId).toBe("existing-exact");
    expect(matches[0].descriptionSimilarity).toBe(1);
  });

  it("returns no matches when either list is empty", () => {
    expect(detectDuplicates([], [tx({ id: "new-1" })])).toEqual([]);
    expect(detectDuplicates([tx({ id: "existing-1" })], [])).toEqual([]);
    expect(detectDuplicates([], [])).toEqual([]);
  });

  it("only flags newRows that actually match, leaving unrelated newRows out of the result", () => {
    const existing = [tx({ id: "existing-1", date: "2026-01-05", amount: -6400, description: "Amazon.co.jp" })];
    const incoming = [
      tx({ id: "new-1", date: "2026-01-05", amount: -6400, description: "Amazon.co.jp" }),
      tx({ id: "new-2", date: "2026-02-01", amount: -1200, description: "コンビニ" }),
    ];

    const matches = detectDuplicates(existing, incoming);

    expect(matches).toEqual([{ newRowId: "new-1", matchedExistingId: "existing-1", descriptionSimilarity: 1 }]);
  });

  it("respects a custom similarity threshold", () => {
    const existing = [tx({ id: "existing-1", date: "2026-01-05", amount: -3000, description: "スターバックス渋谷店" })];
    const incoming = [tx({ id: "new-1", date: "2026-01-05", amount: -3000, description: "スターバックス新宿店" })];

    // 「渋谷店」と「新宿店」は摘要の大部分が共通するため既定の閾値(0.6)ではマッチしうるが、
    // 閾値を極端に高く指定すればマッチしなくなることを確認する
    expect(detectDuplicates(existing, incoming, 0.99)).toEqual([]);
  });
});
