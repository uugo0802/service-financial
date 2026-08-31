/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useBalanceSheetData } from "@/hooks/useBalanceSheetData";
import { Asset } from "@/lib/tax/depreciation";
import { Loan } from "@/lib/tax/loanAmortization";

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

// docs/superpowers/specs/2026-08-31-simplified-cash-flow-statement-design.md のテスト方針:
// 「FinancialStatementsClientの統合箇所は、既存のFinancialStatementsClient.test.tsxに
// セクション追加のテストを足す」に対応するスモークテスト。cashFlowStatement.ts自体の
// 計算ロジックはcashFlowStatement.test.tsで別途検証済みのため、ここでは
// PrintableStatementLayoutの1セクションとして「キャッシュ・フロー計算書（簡易）」が
// 正しく描画されること（見出し・区分ラベル・日本語文言の文字化けが無いこと）と、
// useBalanceSheetDataが返すfixedAssets・loansがbuildCashFlowStatement()へそのまま渡り、
// 投資・財務活動区分の金額に反映されることを確認する。
describe("FinancialStatementsClient（キャッシュ・フロー計算書セクション）", () => {
  it("isSampleDataの間も、キャッシュ・フロー計算書（簡易）セクションの見出し・区分・日本語文言が正しく表示される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: SAMPLE_LIKE_TRANSACTIONS, isSampleData: true });
    vi.mocked(useBalanceSheetData).mockReturnValue({ data: null, isSampleData: true });

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    // セクション見出し・区分見出し
    expect(screen.getByText("キャッシュ・フロー計算書（簡易）")).toBeTruthy();
    expect(screen.getByText("営業活動によるキャッシュ・フロー")).toBeTruthy();
    expect(screen.getByText("投資活動によるキャッシュ・フロー")).toBeTruthy();
    expect(screen.getByText("財務活動によるキャッシュ・フロー")).toBeTruthy();

    // 営業活動区分の内訳行（日本語文言が文字化けせず描画されている）
    expect(screen.getByText("当期純利益")).toBeTruthy();
    expect(screen.getByText("減価償却費")).toBeTruthy();
    expect(screen.getByText("未払法人税等の増減額")).toBeTruthy();
    expect(screen.getByText("未払消費税等の増減額")).toBeTruthy();

    // 投資・財務活動区分の内訳行
    expect(screen.getByText("固定資産の取得による支出")).toBeTruthy();
    expect(screen.getByText("借入金の増減額")).toBeTruthy();

    // 期末現金残高との整合性チェック欄（貸借対照表側にも同じ「検算」文言があるため、
    // キャッシュ・フロー計算書固有の文言で判定する。一致・不一致いずれの場合も
    // 「貸借対照表の現金及び預金」という語を含む）
    expect(screen.getAllByText(/貸借対照表の現金及び預金/).length).toBeGreaterThanOrEqual(1);
  });

  it("isSampleDataがfalseの場合、フック経由のfixedAssets・loansが投資・財務活動区分の金額にそのまま反映される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: false });

    // 当期中（2026年）に取得した固定資産1件（cashFlowStatement.test.tsの
    // 「当期取得PC」と同じ条件: 取得価額300,000円 → 投資活動区分は-300,000円になるはず）
    const acquiredThisYear: Asset = {
      id: "cf-asset-1",
      name: "当期取得PC",
      acquisitionDate: "2026-06-01",
      acquisitionCost: 300_000,
      usefulLifeYears: 4,
      method: "straight-line",
    };
    // cashFlowStatement.test.tsと同じ借入金1件（期首2025-12-31時点の残高650,000円 →
    // 期末2026-12-31時点の残高50,000円、当期増減額は-600,000円になるはず）
    const loan: Loan = {
      id: "cf-loan-1",
      name: "運転資金",
      principalAmount: 1_200_000,
      interestRate: 0.06,
      startDate: "2025-01-15",
      termMonths: 24,
      repaymentType: "equal-principal",
    };

    vi.mocked(useBalanceSheetData).mockReturnValue({
      data: {
        capitalStock: 1_000_000,
        openingCash: 3_000_000,
        openingRetainedEarnings: 0,
        fixedAssets: [acquiredThisYear],
        loans: [loan],
        cashInflow: 1_000_000,
        cashOutflow: 200_000,
        fiscalPeriod: { start: "2026-01-01", end: "2026-12-31" },
      },
      isSampleData: false,
    });

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    // 投資活動: 明細行・区分合計行の両方に-300,000円が反映されている（他区分に同額は無い）
    expect(screen.getAllByText("-￥300,000").length).toBeGreaterThanOrEqual(2);
    // 財務活動: 明細行・区分合計行の両方に-600,000円が反映されている
    expect(screen.getAllByText("-￥600,000").length).toBeGreaterThanOrEqual(2);
  });
});
