import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIALITY_THRESHOLD,
  Tag,
  TagAssignment,
  TaggableTransaction,
  addTag,
  assignTag,
  computeTagProfitability,
  findUntaggedAboveThreshold,
  hasTagFieldErrors,
  removeTag,
  removeTagAndAssignments,
  renameTag,
  tagIdsForTransaction,
  unassignTag,
  validateTagLabel,
} from "./tagging";

function tx(overrides: Partial<TaggableTransaction>): TaggableTransaction {
  return {
    id: "tx-1",
    date: "2026-06-01",
    description: "test",
    amount: 0,
    ...overrides,
  };
}

describe("computeTagProfitability - per-tag aggregation with mixed income/expense signs", () => {
  it("sums income (amount >= 0) and expense (amount < 0, absolute value) separately per tag", () => {
    const tags: Tag[] = [{ id: "clientA", label: "A社案件" }];
    const transactions: TaggableTransaction[] = [
      tx({ id: "t1", amount: 300_000, description: "コンサルティング売上" }),
      tx({ id: "t2", amount: -80_000, description: "外注費" }),
      tx({ id: "t3", amount: -20_000, description: "交通費" }),
    ];
    const assignments: TagAssignment[] = [
      { tagId: "clientA", transactionId: "t1" },
      { tagId: "clientA", transactionId: "t2" },
      { tagId: "clientA", transactionId: "t3" },
    ];

    const result = computeTagProfitability(tags, assignments, transactions);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tagId: "clientA",
      label: "A社案件",
      income: 300_000,
      expense: 100_000,
      net: 200_000,
      transactionCount: 3,
    });
  });

  it("returns zeroed rows for tags with no assigned transactions, instead of omitting them", () => {
    const tags: Tag[] = [{ id: "unused", label: "未使用タグ" }];
    const result = computeTagProfitability(tags, [], []);
    expect(result).toEqual([
      { tagId: "unused", label: "未使用タグ", color: undefined, income: 0, expense: 0, net: 0, transactionCount: 0 },
    ]);
  });

  it("sorts by net descending, so the most profitable tag comes first", () => {
    const tags: Tag[] = [
      { id: "lossy", label: "赤字案件" },
      { id: "profitable", label: "黒字案件" },
    ];
    const transactions: TaggableTransaction[] = [
      tx({ id: "t1", amount: 100_000 }),
      tx({ id: "t2", amount: -150_000 }),
      tx({ id: "t3", amount: 500_000 }),
      tx({ id: "t4", amount: -50_000 }),
    ];
    const assignments: TagAssignment[] = [
      { tagId: "lossy", transactionId: "t1" },
      { tagId: "lossy", transactionId: "t2" },
      { tagId: "profitable", transactionId: "t3" },
      { tagId: "profitable", transactionId: "t4" },
    ];

    const result = computeTagProfitability(tags, assignments, transactions);
    expect(result.map((r) => r.tagId)).toEqual(["profitable", "lossy"]);
    expect(result[0].net).toBe(450_000);
    expect(result[1].net).toBe(-50_000);
  });

  it("counts a shared transaction fully toward every tag it is assigned to (no proration across tags)", () => {
    const tags: Tag[] = [
      { id: "clientA", label: "A社" },
      { id: "projectX", label: "Xプロジェクト" },
    ];
    const transactions: TaggableTransaction[] = [tx({ id: "shared", amount: -30_000 })];
    const assignments: TagAssignment[] = [
      { tagId: "clientA", transactionId: "shared" },
      { tagId: "projectX", transactionId: "shared" },
    ];

    const result = computeTagProfitability(tags, assignments, transactions);
    expect(result.find((r) => r.tagId === "clientA")?.expense).toBe(30_000);
    expect(result.find((r) => r.tagId === "projectX")?.expense).toBe(30_000);
  });

  it("ignores assignments that reference a transaction id that no longer exists", () => {
    const tags: Tag[] = [{ id: "clientA", label: "A社" }];
    const assignments: TagAssignment[] = [{ tagId: "clientA", transactionId: "deleted-tx" }];
    const result = computeTagProfitability(tags, assignments, []);
    expect(result[0]).toMatchObject({ income: 0, expense: 0, net: 0, transactionCount: 0 });
  });

  it("treats a zero-amount transaction as income (amount >= 0 branch), not expense", () => {
    const tags: Tag[] = [{ id: "clientA", label: "A社" }];
    const transactions: TaggableTransaction[] = [tx({ id: "t1", amount: 0 })];
    const assignments: TagAssignment[] = [{ tagId: "clientA", transactionId: "t1" }];
    const result = computeTagProfitability(tags, assignments, transactions);
    expect(result[0].income).toBe(0);
    expect(result[0].expense).toBe(0);
    expect(result[0].transactionCount).toBe(1);
  });
});

describe("findUntaggedAboveThreshold - materiality-based nudge", () => {
  const transactions: TaggableTransaction[] = [
    tx({ id: "big-expense", amount: -100_000, description: "外注費" }),
    tx({ id: "small-expense", amount: -1_000, description: "文房具" }),
    tx({ id: "big-income", amount: 500_000, description: "顧問料" }),
    tx({ id: "tagged-big", amount: -200_000, description: "既にタグ付け済み" }),
  ];
  const assignments: TagAssignment[] = [{ tagId: "clientA", transactionId: "tagged-big" }];

  it("returns only untagged transactions at or above the given threshold, sorted by amount descending", () => {
    const result = findUntaggedAboveThreshold(transactions, assignments, 50_000);
    expect(result.map((t) => t.id)).toEqual(["big-income", "big-expense"]);
  });

  it("excludes already-tagged transactions even if they are above the threshold", () => {
    const result = findUntaggedAboveThreshold(transactions, assignments, 50_000);
    expect(result.find((t) => t.id === "tagged-big")).toBeUndefined();
  });

  it("excludes untagged transactions below the threshold", () => {
    const result = findUntaggedAboveThreshold(transactions, assignments, 50_000);
    expect(result.find((t) => t.id === "small-expense")).toBeUndefined();
  });

  it("treats the threshold as inclusive (>=)", () => {
    const result = findUntaggedAboveThreshold(transactions, [], 100_000);
    expect(result.map((t) => t.id)).toContain("big-expense");
  });

  it("uses DEFAULT_MATERIALITY_THRESHOLD when no threshold argument is given", () => {
    const result = findUntaggedAboveThreshold(transactions, assignments);
    expect(result.map((t) => t.id).sort()).toEqual(["big-expense", "big-income"].sort());
    expect(DEFAULT_MATERIALITY_THRESHOLD).toBeGreaterThan(0);
  });

  it("returns an empty array when there is nothing to flag (no crash on empty input)", () => {
    expect(findUntaggedAboveThreshold([], [], 30_000)).toEqual([]);
  });
});

describe("tag CRUD validation", () => {
  it("rejects an empty label", () => {
    const errors = validateTagLabel("", []);
    expect(errors.label).toBeDefined();
    expect(hasTagFieldErrors(errors)).toBe(true);
  });

  it("rejects a label that is only whitespace", () => {
    const errors = validateTagLabel("   ", []);
    expect(errors.label).toBeDefined();
  });

  it("rejects a duplicate label (case-insensitive)", () => {
    const tags: Tag[] = [{ id: "t1", label: "A社案件" }];
    const errors = validateTagLabel("a社案件", tags);
    expect(errors.label).toBeDefined();
  });

  it("accepts a unique, non-empty label", () => {
    const tags: Tag[] = [{ id: "t1", label: "A社案件" }];
    const errors = validateTagLabel("B社案件", tags);
    expect(hasTagFieldErrors(errors)).toBe(false);
  });

  it("allows renaming a tag to its own current label (excludeTagId skips self-comparison)", () => {
    const tags: Tag[] = [{ id: "t1", label: "A社案件" }];
    const errors = validateTagLabel("A社案件", tags, "t1");
    expect(hasTagFieldErrors(errors)).toBe(false);
  });

  it("addTag appends a new tag with a trimmed label and generated id", () => {
    const tags = addTag([], { label: "  新規案件  " });
    expect(tags).toHaveLength(1);
    expect(tags[0].label).toBe("新規案件");
    expect(tags[0].id).toBeTruthy();
  });

  it("renameTag updates only the matching tag", () => {
    const tags: Tag[] = [
      { id: "t1", label: "旧名" },
      { id: "t2", label: "他のタグ" },
    ];
    const renamed = renameTag(tags, "t1", "新名");
    expect(renamed.find((t) => t.id === "t1")?.label).toBe("新名");
    expect(renamed.find((t) => t.id === "t2")?.label).toBe("他のタグ");
  });

  it("removeTag drops only the matching tag and leaves others untouched", () => {
    const tags: Tag[] = [
      { id: "t1", label: "削除対象" },
      { id: "t2", label: "残るタグ" },
    ];
    expect(removeTag(tags, "t1").map((t) => t.id)).toEqual(["t2"]);
  });

  it("removeTagAndAssignments cleans up assignments referencing the deleted tag", () => {
    const tags: Tag[] = [
      { id: "t1", label: "削除対象" },
      { id: "t2", label: "残るタグ" },
    ];
    const assignments: TagAssignment[] = [
      { tagId: "t1", transactionId: "tx-1" },
      { tagId: "t2", transactionId: "tx-2" },
    ];
    const result = removeTagAndAssignments(tags, assignments, "t1");
    expect(result.tags.map((t) => t.id)).toEqual(["t2"]);
    expect(result.assignments).toEqual([{ tagId: "t2", transactionId: "tx-2" }]);
  });
});

describe("tag assignment helpers", () => {
  it("assignTag adds a new assignment and is idempotent for duplicates", () => {
    let assignments: TagAssignment[] = [];
    assignments = assignTag(assignments, "t1", "tx-1");
    expect(assignments).toHaveLength(1);
    assignments = assignTag(assignments, "t1", "tx-1");
    expect(assignments).toHaveLength(1); // no duplicate entry created
  });

  it("unassignTag removes only the matching pairing", () => {
    const assignments: TagAssignment[] = [
      { tagId: "t1", transactionId: "tx-1" },
      { tagId: "t1", transactionId: "tx-2" },
    ];
    const result = unassignTag(assignments, "t1", "tx-1");
    expect(result).toEqual([{ tagId: "t1", transactionId: "tx-2" }]);
  });

  it("tagIdsForTransaction returns all tag ids assigned to a given transaction", () => {
    const assignments: TagAssignment[] = [
      { tagId: "t1", transactionId: "tx-1" },
      { tagId: "t2", transactionId: "tx-1" },
      { tagId: "t3", transactionId: "tx-2" },
    ];
    expect(tagIdsForTransaction(assignments, "tx-1").sort()).toEqual(["t1", "t2"]);
    expect(tagIdsForTransaction(assignments, "tx-3")).toEqual([]);
  });
});
