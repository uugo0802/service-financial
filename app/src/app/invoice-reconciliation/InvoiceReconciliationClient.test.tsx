/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";

// useLedgerTransactions()はSupabase接続を伴うため、フック自体をモックして
// isSampleDataがtrue/falseそれぞれの場合のページ側の表示切り替え・
// InvoicePaymentMatchPanelへのtransactions受け渡しのみを検証する
// （budget/page.test.tsx・dashboard/page.test.tsxと同じ方針）。
const mockUseLedgerTransactions = vi.fn();
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: (sampleData: CategorizedTransaction[]) => mockUseLedgerTransactions(sampleData),
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
// 各テスト間で明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// SAMPLE_INVOICES（page.tsx内、変更対象外）のうち、他の請求書と金額が重複しない
// F運輸株式会社（88,000円）とD商店（500,000円）を使い、フック経由で渡した
// transactionsが実際にInvoicePaymentMatchPanelへ届いていること（高信頼度マッチとして
// 表示されること）を確認する。
const TRANSACTIONS_MATCHING_F_TRANSPORT: CategorizedTransaction[] = [
  {
    id: "test-tx-f",
    date: "2026-06-16",
    description: "フリコミ）テストニユウキンA",
    amount: 88000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

const TRANSACTIONS_MATCHING_D_SHOP: CategorizedTransaction[] = [
  {
    id: "test-tx-d",
    date: "2026-06-17",
    description: "フリコミ）テストニユウキンB",
    amount: 500000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "manual",
  },
];

describe("InvoiceReconciliationClient", () => {
  it("isSampleDataがtrueの間は取引データもサンプルである旨を表示し、フック経由のtransactionsをパネルに渡す", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: TRANSACTIONS_MATCHING_F_TRANSPORT,
      isSampleData: true,
    });
    mockGetMyTenantUser.mockResolvedValue(null); // 未ログイン・未所属の場合はSAMPLE_INVOICESのまま

    const { InvoiceReconciliationClient } = await import("./InvoiceReconciliationClient");
    render(<InvoiceReconciliationClient />);

    expect(
      screen.getByText(
        "銀行の入金取引データも、現時点ではサンプルデータを表示しています。記帳データが登録されると、自動的に実際のデータへ切り替わります。"
      )
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "発行済み請求書のデータは、現時点ではサンプルデータを表示しています（Supabase未接続、または未ログインのため）。"
      )
    ).toBeTruthy();
    // フック経由のtransactionsがパネルに渡り、F運輸株式会社(88,000円)への高信頼度マッチとして表示される
    expect(screen.getByText("フリコミ）テストニユウキンA")).toBeTruthy();
  });

  it("テナント解決後はinvoicesの実データに切り替わり、その旨を表示する", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: TRANSACTIONS_MATCHING_F_TRANSPORT,
      isSampleData: true,
    });
    mockGetMyTenantUser.mockResolvedValue({
      tenant_id: "tenant-1",
      user_id: "user-1",
      role: "owner",
      created_at: "2026-08-01T00:00:00Z",
    });
    mockListInvoices.mockResolvedValue([
      {
        invoiceNumber: "INV-REAL-0001",
        clientName: "実データ商事",
        issueDate: "2026-06-01",
        dueDate: "2026-06-30",
        grandTotal: 88000,
      },
    ]);

    const { InvoiceReconciliationClient } = await import("./InvoiceReconciliationClient");
    render(<InvoiceReconciliationClient />);

    expect(
      await screen.findByText("発行済み請求書のデータは、登録済みの内容（Supabase）を表示しています。")
    ).toBeTruthy();
    expect(mockListInvoices).toHaveBeenCalledWith("tenant-1");
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を表示し、フック経由の実データがパネルに反映される", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: TRANSACTIONS_MATCHING_D_SHOP,
      isSampleData: false,
    });
    mockGetMyTenantUser.mockResolvedValue(null);

    const { InvoiceReconciliationClient } = await import("./InvoiceReconciliationClient");
    render(<InvoiceReconciliationClient />);

    expect(
      screen.getByText("銀行の入金取引データは、記帳された実データ（当期の取引）を表示しています。")
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "銀行の入金取引データも、現時点ではサンプルデータを表示しています。記帳データが登録されると、自動的に実際のデータへ切り替わります。"
      )
    ).toBeNull();
    // フック経由の実データ（D商店 500,000円への高信頼度マッチ）がパネルに反映される
    expect(screen.getByText("フリコミ）テストニユウキンB")).toBeTruthy();
    // サンプルデータ側の取引descriptionは表示されない
    expect(screen.queryByText("フリコミ）テストニユウキンA")).toBeNull();
  });

  it("useLedgerTransactionsにはページ専用のSAMPLE_TRANSACTIONSがフォールバック値として渡される", async () => {
    mockUseLedgerTransactions.mockReturnValue({
      transactions: [],
      isSampleData: true,
    });
    mockGetMyTenantUser.mockResolvedValue(null);

    const { InvoiceReconciliationClient } = await import("./InvoiceReconciliationClient");
    render(<InvoiceReconciliationClient />);

    expect(mockUseLedgerTransactions).toHaveBeenCalledTimes(1);
    const sampleDataArg = mockUseLedgerTransactions.mock.calls[0][0] as CategorizedTransaction[];
    expect(sampleDataArg.length).toBeGreaterThan(0);
    expect(sampleDataArg.every((tx) => tx.id.startsWith("sample-tx-"))).toBe(true);
  });
});
