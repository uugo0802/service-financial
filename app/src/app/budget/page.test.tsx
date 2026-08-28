/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { formatPeriod } from "@/lib/budget/budgetTracking";

// useLedgerTransactions()はSupabase接続を伴うため、フック自体をモックして
// isSampleDataがtrue/falseそれぞれの場合のページ側の表示切り替えのみを検証する。
// （フック自体のロード挙動はhooks/useLedgerTransactions.tsに対応するテストで検証する想定）
const mockUseLedgerTransactions = vi.fn();
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: (sampleData: CategorizedTransaction[]) => mockUseLedgerTransactions(sampleData),
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// 各テスト間で明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CURRENT_PERIOD = formatPeriod(new Date());

describe("BudgetPage", () => {
  it("isSampleDataがtrueの間はサンプルデータ使用中である旨を表示する", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: [
        {
          id: "sample-1",
          date: `${CURRENT_PERIOD}-01`,
          description: "サンプル: 地代家賃",
          amount: -180000,
          account: "地代家賃",
          taxCategory: "課税仕入10%",
          confidence: 1,
          source: "rule",
        },
      ] satisfies CategorizedTransaction[],
      isSampleData: true,
    });

    const { default: BudgetPage } = await import("./page");
    render(<BudgetPage />);

    expect(
      screen.getByText("本ページは開発中のプロトタイプであり、サンプルの実績データを使用しています。")
    ).toBeTruthy();
    // サンプルの実績（地代家賃）が予算比較セクションに反映されていること
    expect(screen.getAllByText("地代家賃").length).toBeGreaterThan(0);
  });

  it("isSampleDataがfalseの場合は実データ表示中である旨を表示し、実データの実績を集計する", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: [
        {
          id: "real-1",
          date: `${CURRENT_PERIOD}-15`,
          description: "実データ: 通信費",
          amount: -50000,
          account: "通信費",
          taxCategory: "課税仕入10%",
          confidence: 1,
          source: "manual",
        },
      ] satisfies CategorizedTransaction[],
      isSampleData: false,
    });

    const { default: BudgetPage } = await import("./page");
    render(<BudgetPage />);

    expect(
      screen.getByText("記帳された実データ（当期の取引）をもとに実績を集計しています。")
    ).toBeTruthy();
    // 実績合計タイルに実データ由来の合計額（50,000円）が反映されていること
    expect(screen.getByText("￥50,000")).toBeTruthy();
  });

  it("実データの対象期間外の取引は実績集計から除外される", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: [
        {
          id: "real-old",
          date: "2020-01-15",
          description: "対象期間外: 通信費",
          amount: -99999,
          account: "通信費",
          taxCategory: "課税仕入10%",
          confidence: 1,
          source: "manual",
        },
      ] satisfies CategorizedTransaction[],
      isSampleData: false,
    });

    const { default: BudgetPage } = await import("./page");
    render(<BudgetPage />);

    // 対象月（今月）に一致しないため実績合計は0円のまま
    expect(screen.getByText("￥0")).toBeTruthy();
    expect(screen.queryByText("￥99,999")).toBeNull();
  });
});
