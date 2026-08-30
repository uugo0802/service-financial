/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { formatPeriod } from "@/lib/budget/budgetTracking";
import { BudgetSummaryWidget } from "./BudgetSummaryWidget";

afterEach(() => {
  cleanup();
});

const period = formatPeriod(new Date());

const TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "tx-rent",
    date: `${period}-01`,
    description: "事務所家賃",
    amount: -200_000, // DEFAULT_CATEGORY_BUDGETSの地代家賃(180,000円)を超過させる
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "tx-supplies",
    date: `${period}-05`,
    description: "消耗品購入",
    amount: -5_000,
    account: "消耗品費",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
];

describe("BudgetSummaryWidget", () => {
  it("当月の予算・実績合計と超過カテゴリ数を表示する", () => {
    render(<BudgetSummaryWidget transactions={TRANSACTIONS} />);

    expect(screen.getByRole("heading", { name: `予算実績（${period}・概要）` })).toBeTruthy();
    expect(screen.getByText("予算超過カテゴリ: 1件")).toBeTruthy();
    expect(screen.getByText("地代家賃")).toBeTruthy();
    expect(screen.getByText("予算超過")).toBeTruthy();
  });

  it("/budgetへの詳細リンクを表示する", () => {
    render(<BudgetSummaryWidget transactions={TRANSACTIONS} />);

    const link = screen.getByRole("link", { name: "すべての科目・予算設定を見る →" });
    expect(link.getAttribute("href")).toBe("/budget");
  });

  it("実績・予算のいずれも無い期間ではメッセージのみを表示する", () => {
    render(<BudgetSummaryWidget transactions={[]} />);

    // DEFAULT_CATEGORY_BUDGETSに予算設定自体は存在するため、実績0円のカテゴリが
    // 「予算内」として表示される（この時点では超過カテゴリは無い）
    expect(screen.queryByText(/予算超過カテゴリ/)).toBeNull();
  });
});
