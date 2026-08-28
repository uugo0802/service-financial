/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MonthlyCloseChecklistPanel } from "./MonthlyCloseChecklistPanel";
import { CategorizedTransaction } from "@/lib/categorize/engine";

// useLedgerTransactionsはSupabase接続を伴う非同期フックなので、ここでは差し替えて
// isSampleDataの2状態（サンプルデータ表示中／実データ取得済み）それぞれで、案内文言と
// 実際の集計結果（未確定の仕訳件数など）にフック経由の取引データが反映されることを検証する。
let mockState: { transactions: CategorizedTransaction[]; isSampleData: boolean };
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: () => mockState,
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// テスト間でJSDOMのdocumentが残らないよう明示的にクリーンアップする。
afterEach(() => {
  cleanup();
});

// 全件confidence:1（要確認なし）の実データ。パネルが依然SAMPLE_TRANSACTIONS
// （うち2件が低信頼度＝要確認）を見ていれば「未確定の仕訳はありません。」は出ないはず。
const REAL_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "je-real-1",
    date: "2026-07-03",
    description: "記帳された実データの取引",
    amount: 100_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
];

describe("MonthlyCloseChecklistPanel", () => {
  it("isSampleDataがtrueの間はサンプルの取引データを使用している旨を案内する", () => {
    mockState = { transactions: [], isSampleData: true };
    render(<MonthlyCloseChecklistPanel />);

    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "銀行残高突合・未確定の仕訳件数の計算には、現在サンプルの取引データを使用しています。請求書データ（入金消込の照合先）は引き続きこのページ専用のサンプルデータです。"
      )
    ).toBeTruthy();
  });

  it("isSampleDataがfalseになったら実データ使用中の案内に切り替わる", () => {
    mockState = { transactions: REAL_TRANSACTIONS, isSampleData: false };
    render(<MonthlyCloseChecklistPanel />);

    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "銀行残高突合・未確定の仕訳件数の計算には、記帳された実データ（当期の取引）を使用しています。請求書データ（入金消込の照合先）は引き続きこのページ専用のサンプルデータです。"
      )
    ).toBeTruthy();
    expect(
      screen.queryByText((_, node) => node?.textContent?.includes("現在サンプルの取引データを使用しています。") ?? false)
    ).toBeNull();
  });

  it("未確定の仕訳件数はフックが返した実データから算出され、SAMPLE_TRANSACTIONSは使われない", () => {
    mockState = { transactions: REAL_TRANSACTIONS, isSampleData: false };
    render(<MonthlyCloseChecklistPanel />);

    expect(screen.getByText("未確定の仕訳はありません。")).toBeTruthy();
  });

  it("入金消込チェックは引き続きSAMPLE_INVOICES（請求書データ）を使うため、取引データが空でも3件の請求書が未消込として検出される", () => {
    // Wave3（invoicesテーブル未実装）のため、SAMPLE_INVOICESは意図的にこのまま。
    mockState = { transactions: [], isSampleData: false };
    render(<MonthlyCloseChecklistPanel />);

    expect(screen.getByText(/要確認の入金・請求書が3件あります/)).toBeTruthy();
  });
});
