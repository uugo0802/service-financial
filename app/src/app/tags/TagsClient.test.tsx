/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";

// useLedgerTransactions()はSupabase接続を伴うため、フック自体をモックして
// isSampleDataがtrue/falseそれぞれの場合のページ側の表示切り替え・
// TagManagerClientへのtransactions受け渡しのみを検証する
// （invoice-reconciliation/InvoiceReconciliationClient.test.tsxと同じ方針）。
const mockUseLedgerTransactions = vi.fn();
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: (sampleData: CategorizedTransaction[]) => mockUseLedgerTransactions(sampleData),
}));

// タグ・タグ付け（tags/tag_assignmentsテーブル）はTagManagerClient内で
// getMyTenantUser()・listTags()・listTagAssignments()を呼び出すため、
// テナント未解決（サンプルのまま）で決定的に検証できるようモックする。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));
vi.mock("@/lib/db/tags", () => ({
  listTags: vi.fn(),
  listTagAssignments: vi.fn(),
  createTag: vi.fn(),
  upsertTag: vi.fn(),
  deleteTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// 各テスト間で明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REAL_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "je-1",
    date: "2026-08-01",
    description: "実データ側のコンサル売上",
    amount: 400000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

describe("TagsClient", () => {
  it("isSampleDataがtrueの間は取引データがサンプルである旨を表示し、フック経由のtransactionsをTagManagerClientに渡す", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: [],
      isSampleData: true,
    });
    mockGetMyTenantUser.mockResolvedValue(null); // 未ログイン・未所属の場合はサンプルのまま

    const { TagsClient } = await import("./TagsClient");
    render(<TagsClient />);

    expect(
      screen.getByText("取引一覧は開発中のプロトタイプであり、サンプルデータを使用しています。")
    ).toBeTruthy();
    expect(mockUseLedgerTransactions).toHaveBeenCalledTimes(1);
    const sampleDataArg = mockUseLedgerTransactions.mock.calls[0][0] as CategorizedTransaction[];
    expect(sampleDataArg.length).toBeGreaterThan(0);
    expect(sampleDataArg.every((tx) => tx.id.startsWith("tx-"))).toBe(true);
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を表示し、フック経由の実データが反映される", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: REAL_TRANSACTIONS,
      isSampleData: false,
    });
    mockGetMyTenantUser.mockResolvedValue(null);

    const { TagsClient } = await import("./TagsClient");
    render(<TagsClient />);

    expect(screen.getByText("記帳された実データ（当期の取引）を表示しています。")).toBeTruthy();
    expect(
      screen.queryByText("取引一覧は開発中のプロトタイプであり、サンプルデータを使用しています。")
    ).toBeNull();
    // フック経由の実データがTagManagerClientの取引一覧テーブルに反映される
    expect(screen.getByText("実データ側のコンサル売上")).toBeTruthy();
  });
});
