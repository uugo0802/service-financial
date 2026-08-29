/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useBalanceSheetData } from "@/hooks/useBalanceSheetData";

// useLedgerTransactions・useBalanceSheetData自体はそれぞれのlib層のテストで検証済みのため、
// ここではFinancialStatementsClientが新設した勘定科目内訳明細書・法人事業概況説明書の
// セクションへ、フックが返したtransactionsをそのまま
// buildAccountBreakdownForms/buildMonthlySalesTrendに渡していることだけを検証する
// （app/transactions/TransactionsClient.test.tsx等と同じフックモック方針）。
// 貸借対照表等の既存セクションはこのspecの対象外のため、useBalanceSheetDataは
// 常にサンプル値のままにしておく。
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: vi.fn(),
}));
vi.mock("@/hooks/useBalanceSheetData", () => ({
  useBalanceSheetData: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SAMPLE_LIKE_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "sample-1",
    date: "2026-04-10",
    description: "コンサルティングフィー入金（A社）",
    amount: 550_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "sample-2",
    date: "2026-04-15",
    description: "コワーキングスペース利用料",
    amount: -32_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
    note: "WeWork月額利用料",
  },
];

const REAL_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "real-rent-1",
    date: "2026-03-01",
    description: "実データ地代家賃：オフィスA",
    amount: -50_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "real-income-1",
    date: "2026-03-05",
    description: "実データ売上入金",
    amount: 400_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
];

describe("FinancialStatementsClient（勘定科目内訳明細書・法人事業概況説明書セクション）", () => {
  it("isSampleDataがtrueの間は、サンプルの取引データから内訳・月別推移が算出される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: SAMPLE_LIKE_TRANSACTIONS, isSampleData: true });
    vi.mocked(useBalanceSheetData).mockReturnValue({ data: null, isSampleData: true });

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    expect(screen.getByText("勘定科目内訳明細書（簡易版）")).toBeTruthy();
    expect(screen.getByText("地代家賃の内訳書")).toBeTruthy();
    expect(screen.getByText("コワーキングスペース利用料")).toBeTruthy();

    expect(screen.getByText("法人事業概況説明書（簡易版・売上高の月別推移）")).toBeTruthy();
    expect(
      screen.getByText((_, node) => node?.textContent === "2026-04（1件）")
    ).toBeTruthy();
  });

  it("isSampleDataがfalseの場合、フック経由の実データがそのまま内訳明細書・事業概況説明書に反映される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: false });
    vi.mocked(useBalanceSheetData).mockReturnValue({ data: null, isSampleData: true });

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    // 勘定科目内訳明細書: 地代家賃の内訳書に実データの取引先・金額が反映されている
    expect(screen.getByText("地代家賃の内訳書")).toBeTruthy();
    expect(screen.getByText("実データ地代家賃：オフィスA")).toBeTruthy();
    // 明細行・計行の両方に実データの金額（50,000円）が反映されている
    expect(screen.getAllByText("￥50,000").length).toBeGreaterThanOrEqual(2);
    // サンプルデータの内訳（コワーキングスペース利用料）は混入していない
    expect(screen.queryByText("コワーキングスペース利用料")).toBeNull();

    // 法人事業概況説明書: 売上高の月別推移に実データの月・金額が反映されている
    expect(
      screen.getByText((_, node) => node?.textContent === "2026-03（1件）")
    ).toBeTruthy();
    expect(screen.getAllByText("￥400,000").length).toBeGreaterThanOrEqual(2);
  });
});
