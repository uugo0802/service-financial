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

// 請求書一覧（invoices テーブル）は、getMyTenantUser()・listInvoices()を直接モックし、
// テナント未解決（サンプルのまま）／実データ取得済みの2状態を決定的に検証する。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));
const mockListInvoices = vi.fn();
vi.mock("@/lib/db/invoices", () => ({
  listInvoices: (tenantId: string) => mockListInvoices(tenantId),
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// テスト間でJSDOMのdocumentが残らないよう明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  it("isSampleDataがtrueの間はサンプルの取引データを使用している旨を案内する", async () => {
    mockState = { transactions: [], isSampleData: true };
    mockGetMyTenantUser.mockResolvedValue(null); // 未ログイン・未所属の場合はSAMPLE_INVOICESのまま
    render(<MonthlyCloseChecklistPanel />);

    expect(
      await screen.findByText(
        (_, node) =>
          node?.textContent ===
          "銀行残高突合・未確定の仕訳件数の計算には、現在サンプルの取引データを使用しています。請求書データ（入金消込の照合先）も、現時点ではサンプルデータを使用しています。"
      )
    ).toBeTruthy();
  });

  it("isSampleDataがfalseになったら実データ使用中の案内に切り替わる", async () => {
    mockState = { transactions: REAL_TRANSACTIONS, isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<MonthlyCloseChecklistPanel />);

    expect(
      await screen.findByText(
        (_, node) =>
          node?.textContent ===
          "銀行残高突合・未確定の仕訳件数の計算には、記帳された実データ（当期の取引）を使用しています。請求書データ（入金消込の照合先）も、現時点ではサンプルデータを使用しています。"
      )
    ).toBeTruthy();
    expect(
      screen.queryByText((_, node) => node?.textContent?.includes("現在サンプルの取引データを使用しています。") ?? false)
    ).toBeNull();
  });

  it("未確定の仕訳件数はフックが返した実データから算出され、SAMPLE_TRANSACTIONSは使われない", () => {
    mockState = { transactions: REAL_TRANSACTIONS, isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<MonthlyCloseChecklistPanel />);

    expect(screen.getByText("未確定の仕訳はありません。")).toBeTruthy();
  });

  it("テナントが未解決の間は入金消込チェックがSAMPLE_INVOICES（請求書データ）を使うため、取引データが空でも3件の請求書が未消込として検出される", () => {
    mockState = { transactions: [], isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue(null);
    render(<MonthlyCloseChecklistPanel />);

    expect(screen.getByText(/要確認の入金・請求書が3件あります/)).toBeTruthy();
  });

  it("テナント解決後はinvoicesの実データに切り替わり、その旨を案内する", async () => {
    mockState = { transactions: [], isSampleData: false };
    mockGetMyTenantUser.mockResolvedValue({
      tenant_id: "tenant-1",
      user_id: "user-1",
      role: "owner",
      created_at: "2026-08-01T00:00:00Z",
    });
    mockListInvoices.mockResolvedValue([]);
    render(<MonthlyCloseChecklistPanel />);

    expect(
      await screen.findByText(
        (_, node) =>
          node?.textContent ===
          "銀行残高突合・未確定の仕訳件数の計算には、記帳された実データ（当期の取引）を使用しています。請求書データ（入金消込の照合先）は、登録済みの内容（Supabase）を使用しています。"
      )
    ).toBeTruthy();
    expect(mockListInvoices).toHaveBeenCalledWith("tenant-1");
  });
});
