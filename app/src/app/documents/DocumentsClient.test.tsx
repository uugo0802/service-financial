/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DocumentWithTransaction } from "@/lib/documents/documentSearch";

// useDocuments()はSupabase接続を伴うため、フック自体をモックして
// isSampleDataがtrue/falseそれぞれの場合のページ側の表示切り替え・
// DocumentSearchFormへのdocuments受け渡しのみを検証する
// （InvoiceReconciliationClient.test.tsxと同じ方針）。
const mockUseDocuments = vi.fn();
vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: (sampleData: DocumentWithTransaction[]) => mockUseDocuments(sampleData),
}));

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない。AppShell.test.tsxと同様、
// 各テスト間で明示的にクリーンアップする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REAL_DOCUMENTS: DocumentWithTransaction[] = [
  {
    id: "real-doc-1",
    tenant_id: "tenant-1",
    transaction_id: "je-1",
    storage_path: "tenant-1/2026/real-invoice.pdf",
    uploaded_at: "2026-08-01T00:00:00Z",
    transaction: {
      date: "2026-07-31",
      description: "実データ側の摘要",
      amount: 120000,
      counterparty: null,
    },
  },
];

describe("DocumentsClient", () => {
  it("isSampleDataがtrueの間はサンプルデータ使用中の注記を表示し、フック経由のdocumentsを検索フォームに渡す", async () => {
    mockUseDocuments.mockReturnValue({
      documents: [],
      isSampleData: true,
    });

    const { DocumentsClient } = await import("./DocumentsClient");
    render(<DocumentsClient />);

    expect(screen.getByText("本ページは開発中のプロトタイプであり、サンプルデータを使用しています。")).toBeTruthy();
    expect(mockUseDocuments).toHaveBeenCalledTimes(1);
    const sampleDataArg = mockUseDocuments.mock.calls[0][0] as DocumentWithTransaction[];
    expect(sampleDataArg.length).toBeGreaterThan(0);
    expect(sampleDataArg.every((doc) => doc.id.startsWith("doc-"))).toBe(true);
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を表示し、フック経由の実データが検索フォームに反映される", async () => {
    mockUseDocuments.mockReturnValue({
      documents: REAL_DOCUMENTS,
      isSampleData: false,
    });

    const { DocumentsClient } = await import("./DocumentsClient");
    render(<DocumentsClient />);

    expect(
      screen.getByText(
        "記帳された実データ（アップロード済みの証憑と、紐づく仕訳）を表示しています。取引先（相手方の名称）は現時点では記録していないため空欄になります。"
      )
    ).toBeTruthy();
    expect(screen.queryByText("本ページは開発中のプロトタイプであり、サンプルデータを使用しています。")).toBeNull();
    // フック経由の実データ（実データ側の摘要）が検索フォームに反映される
    expect(screen.getByText("実データ側の摘要")).toBeTruthy();
  });
});
