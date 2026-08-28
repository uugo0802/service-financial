/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TransactionRow } from "@/lib/db/supabaseClient";

// useTransactionRows()はSupabase接続を伴うため、フック自体をモックして
// isSampleDataがtrue/falseそれぞれの場合のページ側の表示切り替え・
// TransactionSearchFormへのtransactions受け渡しのみを検証する
// （invoice-reconciliation/InvoiceReconciliationClient.test.tsxと同じ方針）。
const mockUseTransactionRows = vi.fn();
vi.mock("@/hooks/useTransactionRows", () => ({
  useTransactionRows: (sampleData: TransactionRow[]) => mockUseTransactionRows(sampleData),
}));

// BulkCsvJournalImportForm・CsvColumnMapperはこのテストの対象外だが、fetch呼び出しや
// FileReader等ブラウザAPIに依存しているため、レンダリング時に副作用が起きないよう
// 最小限のダミーに差し替える（このページの変更対象はTransactionSearchFormへの配線のみ）。
vi.mock("@/components/BulkCsvJournalImportForm", () => ({
  BulkCsvJournalImportForm: () => <div data-testid="bulk-csv-import-form-stub" />,
}));
vi.mock("@/components/CsvColumnMapper", () => ({
  CsvColumnMapper: () => <div data-testid="csv-column-mapper-stub" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "test-tx",
    tenant_id: "tenant-1",
    date: "2026-06-01",
    description: "テスト取引",
    amount: -1000,
    account_id: null,
    tax_category: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: null,
    personal_deduction_only: false,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("TransactionsClient", () => {
  it("isSampleDataがtrueの間はサンプルデータを表示している旨を示し、フック経由のtransactionsを検索フォームに渡す", async () => {
    mockUseTransactionRows.mockReturnValue({
      transactions: [row({ id: "tx-sample", description: "サンプル取引テキスト" })],
      isSampleData: true,
    });

    const { TransactionsClient } = await import("./TransactionsClient");
    render(<TransactionsClient />);

    expect(screen.getByText("現在はサンプルデータを表示しています。")).toBeTruthy();
    expect(screen.getByText("サンプル取引テキスト")).toBeTruthy();
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を示し、フック経由の実データが検索フォームに反映される", async () => {
    mockUseTransactionRows.mockReturnValue({
      transactions: [row({ id: "tx-real", description: "実データ取引テキスト" })],
      isSampleData: false,
    });

    const { TransactionsClient } = await import("./TransactionsClient");
    render(<TransactionsClient />);

    expect(screen.getByText("記帳された実データ（当期の取引）を表示しています。")).toBeTruthy();
    expect(screen.queryByText("現在はサンプルデータを表示しています。")).toBeNull();
    expect(screen.getByText("実データ取引テキスト")).toBeTruthy();
  });

  it("useTransactionRowsにはページ専用のSAMPLE_TRANSACTIONSがフォールバック値として渡される", async () => {
    mockUseTransactionRows.mockReturnValue({
      transactions: [],
      isSampleData: true,
    });

    const { TransactionsClient } = await import("./TransactionsClient");
    render(<TransactionsClient />);

    expect(mockUseTransactionRows).toHaveBeenCalledTimes(1);
    const sampleDataArg = mockUseTransactionRows.mock.calls[0][0] as TransactionRow[];
    expect(sampleDataArg.length).toBeGreaterThan(0);
    expect(sampleDataArg.every((tx) => tx.id.startsWith("tx-"))).toBe(true);
  });
});
