/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotificationsPage from "./page";
import { CategorizedTransaction } from "@/lib/categorize/engine";

// useLedgerTransactionsはSupabase接続を伴う非同期フックなので、ここでは差し替えて
// isSampleDataの2状態（サンプルデータ表示中／実データ取得済み）それぞれの描画を検証する
// （rule-backfill/page.test.tsxと同じ方針）。
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

// needsEscalation()はconfidence < 0.75をレビュー待ちとみなす。ちょうど1件だけ
// レビュー待ちになるようにして、ダイジェストのプレビューにフック経由の実データが
// 反映されていることを件数で確認できるようにする。
const REAL_TRANSACTION: CategorizedTransaction = {
  id: "je-real-1",
  date: "2026-08-20",
  description: "記帳された実データの取引",
  amount: -12000,
  account: "要確認",
  taxCategory: "要確認",
  confidence: 0.3,
  source: "uncategorized",
};

describe("NotificationsPage", () => {
  it("isSampleDataがtrueの間はレビュー待ち取引もサンプルデータ表示中である旨を案内する", () => {
    mockState = { transactions: [], isSampleData: true };
    render(<NotificationsPage />);

    expect(screen.getByText("現在は取引データもサンプルデータを表示しています。")).toBeTruthy();
    expect(
      screen.getByText("サンプルのレビュー待ち取引を含める（AIカテゴライズの低信頼エスカレーション）")
    ).toBeTruthy();
    expect(screen.queryByText("記帳された実データ（当期の取引）を表示しています。")).toBeNull();
  });

  it("isSampleDataがfalseになったら実データ使用中の案内に切り替わり、フックが返した取引をダイジェストに反映する", () => {
    mockState = { transactions: [REAL_TRANSACTION], isSampleData: false };
    render(<NotificationsPage />);

    expect(screen.getByText("記帳された実データ（当期の取引）を表示しています。")).toBeTruthy();
    expect(
      screen.getByText("記帳された実データのレビュー待ち取引を含める（AIカテゴライズの低信頼エスカレーション）")
    ).toBeTruthy();
    // レビュー待ち件数が1件（=フック経由のREAL_TRANSACTION由来）としてプレビューに表示されること
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("件の取引が確認待ちです")).toBeTruthy();
  });

  it("永続化の仕組みが無い銀行残高突合結果は、実データ表示時もサンプルデータのままである旨を案内する", () => {
    mockState = { transactions: [], isSampleData: false };
    render(<NotificationsPage />);

    expect(
      screen.getByText("サンプルの銀行残高突合結果を含める（未連携テナントを試したい場合はオフ）")
    ).toBeTruthy();
    expect(screen.getByText(/銀行残高突合結果は現時点でサンプルデータのままです。/)).toBeTruthy();
  });
});
