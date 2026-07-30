import { describe, expect, it } from "vitest";
import { DEFAULT_COUNTERPARTY_SIMILARITY_THRESHOLD, findReceiptDuplicate } from "./receiptDuplicateDetection";
import { ReceiptJournalCandidate, ReceiptScanMetadata } from "./receiptCandidate";

function scanMetadata(overrides: Partial<ReceiptScanMetadata> = {}): ReceiptScanMetadata {
  return {
    uploadedAt: "2026-07-20T00:00:00.000Z",
    originalFileName: "receipt.png",
    mimeType: "image/png",
    sizeBytes: 12345,
    width: 1500,
    height: 2000,
    isColor: true,
    estimatedDpi: 320,
    meetsScannerStorageRequirement: true,
    scannerStorageWarnings: [],
    ...overrides,
  };
}

function receipt(
  overrides: Partial<ReceiptJournalCandidate> & Pick<ReceiptJournalCandidate, "id">
): ReceiptJournalCandidate {
  return {
    date: "2026-07-20",
    counterparty: "スターバックス 渋谷店",
    amount: 580,
    account: "会議費",
    taxCategory: "課税仕入10%",
    confidence: 0.9,
    source: "ai",
    scanMetadata: scanMetadata(),
    correctionHistory: [],
    ...overrides,
  };
}

describe("findReceiptDuplicate", () => {
  it("flags a candidate that exactly matches an already-recorded receipt (same date/amount/counterparty)", () => {
    const existing = [receipt({ id: "existing-1" })];
    const candidate = receipt({ id: "new-1" });

    expect(findReceiptDuplicate(existing, candidate)).toEqual({
      matchedExistingId: "existing-1",
      counterpartySimilarity: 1,
    });
  });

  it("flags a match even when the date separators differ", () => {
    const existing = [receipt({ id: "existing-1", date: "2026-07-20" })];
    const candidate = receipt({ id: "new-1", date: "2026/07/20" });

    const match = findReceiptDuplicate(existing, candidate);

    expect(match?.matchedExistingId).toBe("existing-1");
  });

  it("flags a match when the counterparty has minor formatting differences", () => {
    const existing = [receipt({ id: "existing-1", counterparty: "スターバックス渋谷店" })];
    const candidate = receipt({ id: "new-1", counterparty: "スターバックス　渋谷店＊12345" });

    const match = findReceiptDuplicate(existing, candidate);

    expect(match?.matchedExistingId).toBe("existing-1");
  });

  it("does not flag receipts with a different date", () => {
    const existing = [receipt({ id: "existing-1", date: "2026-07-20" })];
    const candidate = receipt({ id: "new-1", date: "2026-07-21" });

    expect(findReceiptDuplicate(existing, candidate)).toBeNull();
  });

  it("does not flag receipts with a different amount", () => {
    const existing = [receipt({ id: "existing-1", amount: 580 })];
    const candidate = receipt({ id: "new-1", amount: 600 });

    expect(findReceiptDuplicate(existing, candidate)).toBeNull();
  });

  it("does not flag two unrelated receipts that coincidentally share the same date and amount", () => {
    const existing = [receipt({ id: "existing-1", date: "2026-07-20", amount: 3000, counterparty: "スターバックス渋谷店" })];
    const candidate = receipt({ id: "new-1", date: "2026-07-20", amount: 3000, counterparty: "タクシー代（深夜）" });

    expect(findReceiptDuplicate(existing, candidate)).toBeNull();
  });

  it("picks the best-matching existing receipt when multiple candidates share the date and amount", () => {
    const existing = [
      receipt({ id: "existing-close", date: "2026-07-20", amount: 3000, counterparty: "スターバックス渋谷店＊9999" }),
      receipt({ id: "existing-exact", date: "2026-07-20", amount: 3000, counterparty: "スターバックス渋谷店" }),
    ];
    const candidate = receipt({ id: "new-1", date: "2026-07-20", amount: 3000, counterparty: "スターバックス渋谷店" });

    const match = findReceiptDuplicate(existing, candidate);

    expect(match).toEqual({ matchedExistingId: "existing-exact", counterpartySimilarity: 1 });
  });

  it("returns null when there are no existing receipts to compare against", () => {
    expect(findReceiptDuplicate([], receipt({ id: "new-1" }))).toBeNull();
  });

  it("does not flag a candidate whose date could not be read (null)", () => {
    const existing = [receipt({ id: "existing-1" })];
    const candidate = receipt({ id: "new-1", date: null });

    expect(findReceiptDuplicate(existing, candidate)).toBeNull();
  });

  it("does not flag a candidate whose amount could not be read (null)", () => {
    const existing = [receipt({ id: "existing-1" })];
    const candidate = receipt({ id: "new-1", amount: null });

    expect(findReceiptDuplicate(existing, candidate)).toBeNull();
  });

  it("skips an existing receipt whose date or amount could not be read, even if others match", () => {
    const existing = [
      receipt({ id: "existing-unreadable", date: null }),
      receipt({ id: "existing-readable", date: "2026-07-20", amount: 580, counterparty: "スターバックス 渋谷店" }),
    ];
    const candidate = receipt({ id: "new-1" });

    const match = findReceiptDuplicate(existing, candidate);

    expect(match?.matchedExistingId).toBe("existing-readable");
  });

  it("respects a custom similarity threshold", () => {
    const existing = [receipt({ id: "existing-1", date: "2026-07-20", amount: 3000, counterparty: "スターバックス渋谷店" })];
    const candidate = receipt({ id: "new-1", date: "2026-07-20", amount: 3000, counterparty: "スターバックス新宿店" });

    // 既定の閾値(0.6)ではマッチしうるが、閾値を極端に高く指定すればマッチしなくなることを確認する
    expect(findReceiptDuplicate(existing, candidate, 0.99)).toBeNull();
    expect(findReceiptDuplicate(existing, candidate, DEFAULT_COUNTERPARTY_SIMILARITY_THRESHOLD)).not.toBeNull();
  });

  it("still flags a match when amounts differ only by a sub-yen floating point rounding error", () => {
    const existing = [receipt({ id: "existing-1", amount: 580 })];
    const candidate = receipt({ id: "new-1", amount: 580.005 });

    expect(findReceiptDuplicate(existing, candidate)?.matchedExistingId).toBe("existing-1");
  });
});
