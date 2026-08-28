/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RuleBackfillPage from "./page";
import { CategorizedTransaction } from "@/lib/categorize/engine";

// useLedgerTransactionsはSupabase接続を伴う非同期フックなので、ここでは差し替えて
// isSampleDataの2状態（サンプルデータ表示中／実データ取得済み）それぞれの描画を検証する。
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

const REAL_TRANSACTION: CategorizedTransaction = {
  id: "je-real-1",
  date: "2026-06-20",
  description: "記帳された実データの取引",
  amount: -5000,
  account: "消耗品費",
  taxCategory: "課税仕入10%",
  confidence: 1,
  source: "rule",
};

describe("RuleBackfillPage", () => {
  it("isSampleDataがtrueの間はサンプルデータ表示中である旨を案内する", () => {
    mockState = { transactions: [], isSampleData: true };
    render(<RuleBackfillPage />);

    expect(screen.getByText("現在は取引データもサンプルデータを表示しています。")).toBeTruthy();
    expect(screen.queryByText("記帳された実データ（当期の取引）を表示しています。")).toBeNull();
  });

  it("isSampleDataがfalseになったら実データ使用中の案内に切り替わり、フックが返した取引を一覧表示する", () => {
    mockState = { transactions: [REAL_TRANSACTION], isSampleData: false };
    render(<RuleBackfillPage />);

    expect(screen.getByText("記帳された実データ（当期の取引）を表示しています。")).toBeTruthy();
    expect(screen.queryByText("現在は取引データもサンプルデータを表示しています。")).toBeNull();
    // ルール一括再適用パネルにフック経由の実データが渡っていること
    // （SAMPLE_USER_RULESの「クライアントA社」ルールはREAL_TRANSACTIONの摘要とは無関係なので、
    // ここでは変更対象なしの案内文が出ないこと＝実データが渡っていることを確認する代わりに、
    // 実データの摘要がテーブルに表示されていることを直接確認する）。
    expect(screen.getByText("記帳された実データの取引")).toBeTruthy();
  });

  it("ユーザー辞書ルール（SAMPLE_USER_RULES）は依然サンプルデータのままであることを画面下部の注記で案内する", () => {
    mockState = { transactions: [], isSampleData: false };
    render(<RuleBackfillPage />);

    expect(
      screen.getByText(
        "この画面は開発中のプロトタイプです。表示しているユーザー辞書ルールはサンプルデータであり、適用結果はこのブラウザセッション内のみで保持され、実際のデータベースには保存されません。"
      )
    ).toBeTruthy();
  });
});
