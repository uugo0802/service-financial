import { describe, expect, it } from "vitest";
import type { CategorizedTransaction } from "./engine";
import { createUserCategoryRule, UserCategoryRule } from "./userRules";
import {
  applySelectedReapply,
  computeBulkReapplyDiff,
  formatBulkReapplySummary,
  hasCategorizationChanged,
  recategorizeWithCurrentRules,
} from "./bulkReapply";

function tx(overrides: Partial<CategorizedTransaction> & Pick<CategorizedTransaction, "id">): CategorizedTransaction {
  return {
    date: "2026-06-01",
    description: "サンプル取引",
    amount: -10000,
    account: "要確認(未分類の経費)",
    taxCategory: "要確認",
    confidence: 0,
    source: "uncategorized",
    ...overrides,
  };
}

describe("computeBulkReapplyDiff", () => {
  it("returns an empty diff for an empty transaction list", () => {
    const result = computeBulkReapplyDiff([], []);
    expect(result.diffs).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.changedCount).toBe(0);
  });

  it("flags a transaction whose category changes after a new user rule is added", () => {
    // 過去に「事務所家賃」で共通辞書の 地代家賃/課税仕入10% として登録済みだったが、
    // その後ユーザーがこの取引先だけを別科目にしたいというルールを追加したケース。
    const previouslyCategorized = tx({
      id: "tx-1",
      description: "事務所家賃 〇〇不動産",
      amount: -150000,
      account: "地代家賃",
      taxCategory: "課税仕入10%",
      confidence: 1,
      source: "rule",
    });

    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({
        pattern: "〇〇不動産",
        account: "地代家賃(自宅兼事務所・家事按分50%)",
        taxCategory: "課税仕入10%",
      }),
    ];

    const result = computeBulkReapplyDiff([previouslyCategorized], userRules);

    expect(result.totalCount).toBe(1);
    expect(result.changedCount).toBe(1);
    expect(result.diffs).toHaveLength(1);

    const diff = result.diffs[0];
    expect(diff.id).toBe("tx-1");
    expect(diff.previous.account).toBe("地代家賃");
    expect(diff.next.account).toBe("地代家賃(自宅兼事務所・家事按分50%)");
    expect(diff.next.taxCategory).toBe("課税仕入10%");
    expect(diff.next.confidence).toBe(1);
  });

  it("does not flag a transaction whose category stays the same under the current rules", () => {
    const stable = tx({
      id: "tx-2",
      description: "事務所家賃 〇〇不動産",
      amount: -150000,
      account: "地代家賃",
      taxCategory: "課税仕入10%",
      confidence: 1,
      source: "rule",
    });

    // ユーザー辞書ルールが1件もない場合、共通辞書のみで再分類しても結果は変わらないはず。
    const result = computeBulkReapplyDiff([stable], []);

    expect(result.totalCount).toBe(1);
    expect(result.changedCount).toBe(0);
    expect(result.diffs).toEqual([]);
  });

  it("does not flag a transaction just because its stored confidence differs from the recomputed confidence (no incidental-noise false positives)", () => {
    // 勘定科目・税区分は共通辞書の再分類結果と完全に一致しているが、confidence の値だけが
    // 保存時（例: AI分類で 0.82 など）と異なるケース。confidence の揺れだけでは
    // 「変更が必要な差分」として検出してはならない。
    const aiClassified = tx({
      id: "tx-3",
      description: "事務所家賃 〇〇不動産",
      amount: -150000,
      account: "地代家賃",
      taxCategory: "課税仕入10%",
      confidence: 0.82,
      source: "ai",
      note: "AIによる推定",
    });

    const result = computeBulkReapplyDiff([aiClassified], []);
    expect(result.changedCount).toBe(0);
  });
});

describe("recategorizeWithCurrentRules", () => {
  it("prefers a matching user rule over the global dictionary fallback", () => {
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({ pattern: "クライアントX社", account: "業務委託売上(特別枠)", taxCategory: "課税売上10%" }),
    ];

    const result = recategorizeWithCurrentRules(
      { id: "tx-4", date: "2026-06-10", description: "クライアントX社 業務委託料", amount: 200000 },
      userRules
    );

    expect(result.account).toBe("業務委託売上(特別枠)");
    expect(result.confidence).toBe(1);
    expect(result.source).toBe("rule");
  });

  it("treats a matched user rule with taxCategory 要確認 as unconfirmed, same as the global engine does", () => {
    const userRules: UserCategoryRule[] = [
      createUserCategoryRule({ pattern: "謎の入出金", account: "仮払金", taxCategory: "要確認" }),
    ];

    const result = recategorizeWithCurrentRules(
      { id: "tx-5", date: "2026-06-11", description: "謎の入出金 処理", amount: -5000 },
      userRules
    );

    expect(result.account).toBe("仮払金");
    expect(result.taxCategory).toBe("要確認");
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("uncategorized");
  });

  it("falls back to the real global engine (engine.ts) when no user rule matches", () => {
    const result = recategorizeWithCurrentRules(
      { id: "tx-6", date: "2026-06-12", description: "事務所家賃の支払い", amount: -150000 },
      []
    );

    expect(result.account).toBe("地代家賃");
    expect(result.taxCategory).toBe("課税仕入10%");
  });
});

describe("hasCategorizationChanged", () => {
  it("returns false when account/taxCategory/flags are identical even if confidence differs", () => {
    const previous = tx({ id: "tx-7", account: "消耗品費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" });
    const next = tx({ id: "tx-7", account: "消耗品費", taxCategory: "課税仕入10%", confidence: 0.6, source: "ai" });
    expect(hasCategorizationChanged(previous, next)).toBe(false);
  });

  it("treats undefined and false personalDeductionOnly/excludeFromIncome as equivalent", () => {
    const previous = tx({ id: "tx-8", account: "売上高", taxCategory: "課税売上10%", excludeFromIncome: undefined });
    const next = tx({ id: "tx-8", account: "売上高", taxCategory: "課税売上10%", excludeFromIncome: false });
    expect(hasCategorizationChanged(previous, next)).toBe(false);
  });

  it("returns true when the account differs", () => {
    const previous = tx({ id: "tx-9", account: "消耗品費", taxCategory: "課税仕入10%" });
    const next = tx({ id: "tx-9", account: "旅費交通費", taxCategory: "課税仕入10%" });
    expect(hasCategorizationChanged(previous, next)).toBe(true);
  });

  it("returns true when only the personalDeductionOnly flag differs", () => {
    const previous = tx({ id: "tx-10", account: "社会保険料(個人)", taxCategory: "非課税", personalDeductionOnly: false });
    const next = tx({ id: "tx-10", account: "社会保険料(個人)", taxCategory: "非課税", personalDeductionOnly: true });
    expect(hasCategorizationChanged(previous, next)).toBe(true);
  });
});

describe("formatBulkReapplySummary", () => {
  it("formats the total/changed counts into a Japanese summary string", () => {
    const summary = formatBulkReapplySummary({ diffs: [], totalCount: 340, changedCount: 12 });
    expect(summary).toContain("340");
    expect(summary).toContain("12");
  });
});

describe("applySelectedReapply", () => {
  it("applies only the selected ids and leaves the rest untouched", () => {
    const txA = tx({ id: "a", account: "旧科目A", taxCategory: "課税仕入10%" });
    const txB = tx({ id: "b", account: "旧科目B", taxCategory: "課税仕入10%" });
    const txC = tx({ id: "c", account: "旧科目C", taxCategory: "課税仕入10%" });

    const diffs = [
      { id: "a", date: txA.date, description: txA.description, amount: txA.amount, previous: { account: "旧科目A", taxCategory: "課税仕入10%" as const }, next: { ...txA, account: "新科目A" } },
      { id: "b", date: txB.date, description: txB.description, amount: txB.amount, previous: { account: "旧科目B", taxCategory: "課税仕入10%" as const }, next: { ...txB, account: "新科目B" } },
    ];

    const result = applySelectedReapply([txA, txB, txC], diffs, ["a"]);

    expect(result.find((r) => r.id === "a")?.account).toBe("新科目A");
    expect(result.find((r) => r.id === "b")?.account).toBe("旧科目B");
    expect(result.find((r) => r.id === "c")?.account).toBe("旧科目C");
  });

  it("does not mutate the input transactions array", () => {
    const txA = tx({ id: "a", account: "旧科目A", taxCategory: "課税仕入10%" });
    const original = [txA];
    const originalCopy = [...original];

    const diffs = [
      { id: "a", date: txA.date, description: txA.description, amount: txA.amount, previous: { account: "旧科目A", taxCategory: "課税仕入10%" as const }, next: { ...txA, account: "新科目A" } },
    ];

    applySelectedReapply(original, diffs, ["a"]);

    expect(original).toEqual(originalCopy);
  });

  it("returns an empty list unchanged when given no transactions", () => {
    expect(applySelectedReapply([], [], ["a"])).toEqual([]);
  });

  it("leaves a transaction untouched when its id is selected but has no corresponding diff entry", () => {
    const txA = tx({ id: "a", account: "旧科目A", taxCategory: "課税仕入10%" });
    const result = applySelectedReapply([txA], [], ["a"]);
    expect(result[0].account).toBe("旧科目A");
  });
});
