/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RuleBackfillPage from "./page";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { createUserCategoryRule, UserCategoryRule } from "@/lib/categorize/userRules";

// useLedgerTransactionsはSupabase接続を伴う非同期フックなので、ここでは差し替えて
// isSampleDataの2状態（サンプルデータ表示中／実データ取得済み）それぞれの描画を検証する。
let mockState: { transactions: CategorizedTransaction[]; isSampleData: boolean };
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: () => mockState,
}));

// ユーザー辞書ルール（user_categorize_rules テーブル）は、getMyTenantUser()・listCategorizeRules()を
// 直接モックし、テナント未解決（サンプルのまま）／実データ取得済みの2状態を決定的に検証する。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));
const mockListCategorizeRules = vi.fn();
vi.mock("@/lib/db/categorizeRules", () => ({
  listCategorizeRules: (tenantId: string) => mockListCategorizeRules(tenantId),
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// テスト間でJSDOMのdocumentが残らないよう明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

const REAL_USER_RULE: UserCategoryRule = createUserCategoryRule(
  {
    pattern: "実データ辞書ルール",
    account: "雑費",
    taxCategory: "課税仕入10%",
  },
  new Date("2026-08-10T00:00:00Z")
);

describe("RuleBackfillPage", () => {
  it("isSampleDataがtrueの間はサンプルデータ表示中である旨を案内する", async () => {
    mockState = { transactions: [], isSampleData: true };
    mockGetMyTenantUser.mockResolvedValue(null); // 未ログイン・未所属を想定
    render(<RuleBackfillPage />);

    expect(screen.getByText("現在は取引データもサンプルデータを表示しています。")).toBeTruthy();
    expect(screen.queryByText("記帳された実データ（当期の取引）を表示しています。")).toBeNull();
    expect(
      await screen.findByText("ユーザー辞書ルールもサンプルデータを表示しています（Supabase未接続、または未ログインのため）。")
    ).toBeTruthy();
  });

  it("isSampleDataがfalseになったら実データ使用中の案内に切り替わり、フックが返した取引を一覧表示する", () => {
    mockState = { transactions: [REAL_TRANSACTION], isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<RuleBackfillPage />);

    expect(screen.getByText("記帳された実データ（当期の取引）を表示しています。")).toBeTruthy();
    expect(screen.queryByText("現在は取引データもサンプルデータを表示しています。")).toBeNull();
    // ルール一括再適用パネルにフック経由の実データが渡っていること
    // （SAMPLE_USER_RULESの「クライアントA社」ルールはREAL_TRANSACTIONの摘要とは無関係なので、
    // ここでは変更対象なしの案内文が出ないこと＝実データが渡っていることを確認する代わりに、
    // 実データの摘要がテーブルに表示されていることを直接確認する）。
    expect(screen.getByText("記帳された実データの取引")).toBeTruthy();
  });

  it("テナントが未解決の間はユーザー辞書ルールがサンプルデータのままであることを画面下部の注記で案内する", async () => {
    mockState = { transactions: [], isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<RuleBackfillPage />);

    expect(
      await screen.findByText("ユーザー辞書ルールもサンプルデータを表示しています（Supabase未接続、または未ログインのため）。")
    ).toBeTruthy();
  });

  it("テナント解決後はuser_categorize_rulesの実データに切り替わり、その旨を案内する", async () => {
    mockState = { transactions: [], isSampleData: true };
    mockGetMyTenantUser.mockResolvedValue({
      tenant_id: "tenant-1",
      user_id: "user-1",
      role: "owner",
      created_at: "2026-08-01T00:00:00Z",
    });
    mockListCategorizeRules.mockResolvedValue([REAL_USER_RULE]);
    render(<RuleBackfillPage />);

    expect(
      await screen.findByText("ユーザー辞書ルールは登録済みの内容（Supabase）を表示しています。")
    ).toBeTruthy();
    expect(mockListCategorizeRules).toHaveBeenCalledWith("tenant-1");
  });
});
