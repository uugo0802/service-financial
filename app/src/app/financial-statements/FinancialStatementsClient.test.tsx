/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useBalanceSheetData } from "@/hooks/useBalanceSheetData";
import { LedgerBalanceSheetData } from "@/lib/db/balanceSheetData";
import { Asset } from "@/lib/tax/depreciation";
import { Loan } from "@/lib/tax/loanAmortization";
import { estimateForMicroCorp } from "@/lib/tax/corporateEstimate";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { buildConsumptionTaxForm } from "@/lib/tax/consumptionTaxForm";
import { buildCorporateTaxForm, buildFinancialStatements } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildBalanceSheetForm, BalanceSheetForm } from "@/lib/tax/balanceSheetForm";

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

// docs/superpowers/specs/2026-08-29-financial-statements-display-fix-design.md 課題②
// （貸借対照表の「資産の部」「負債の部」「純資産の部」の各ボックスが、見出しは表示される
// ものの中身の行の金額が見えない）の再発防止テスト。
//
// 原因調査の結果（コミット094195c時点では未特定・「実機で再確認する」がプレースホルダーの
// ままだったため、このセッションで改めて特定した）: 当時の原因は、貸借対照表・株主資本等
// 変動計算書等「常にライト固定」であるべき決算書類プレビュー（DocumentPreviewFrame配下）に
// dark:バリアントの配色クラス（例: dark:bg-stone-900）が付いたまま、行(<td>)自体には
// 明示的な文字色クラスが無く親要素の文字色に依存していたことだった。OS/アプリのダーク
// モード判定時にセルの背景だけがdark:バリアントで暗くなる一方、文字色は
// DocumentPreviewFrameが固定する明るい紙面向けの色（text-stone-900）のまま変わらず、
// 暗い背景に暗い文字が乗ってコントラストが失われ「空欄に見える」状態になっていた。
//
// この問題は、コミット7ac1d29（2026-08-29-entry-auth-theme-nav-design.md側の対応）で、
// 決算書類プレビュー配下のdark:バリアントクラスを撤去し「常にライト固定」を徹底したことで
// 副次的に解消済み（該当spec: 2026-08-29-financial-statements-display-fix-design.md の
// スコープ外にあった別コミットでの解消のため、専用の回帰テストが存在していなかった）。
// 現状のFinancialStatementsClient.tsx・TableScrollArea.tsxにdark:バリアントは残っておらず、
// 貸借対照表の各セルはDocumentPreviewFrameが固定するtext-stone-900を素直に継承するため、
// 本テストは「セルの金額が実際にDOM上へレンダリングされ、空文字列やNaNにならないこと」を
// 貸借対照表を構成する全セクション（資産の部・負債の部・純資産の部、固定資産・借入金を
// 含む場合・含まない場合の両方）について検証する。
describe("FinancialStatementsClient（貸借対照表セクション・空欄表示の回帰テスト）", () => {
  // コンポーネント内のyen（Intl.NumberFormat("ja-JP", {style:"currency", currency:"JPY",
  // maximumFractionDigits:0})）と同じフォーマッタ。空文字列やNaNとの違いを厳密に見分けるため、
  // 期待値も同じフォーマッタで文字列化してから比較する。
  const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

  // FinancialStatementsClient.tsxが実際に辿る計算パイプライン（estimateForMicroCorp →
  // buildProfitLossStatement/buildConsumptionTaxForm → buildCorporateTaxForm →
  // buildLocalCorporateTaxForm → buildFinancialStatements → buildBalanceSheetForm）を
  // そのままテスト側でも再現し、「コンポーネントが実際にレンダリングするはずの値」を
  // 手計算ではなく本物のロジックから導出する。
  function computeExpectedBalanceSheet(
    transactions: CategorizedTransaction[],
    bsData: LedgerBalanceSheetData | null
  ): BalanceSheetForm {
    const pl = buildProfitLossStatement(transactions);
    const estimate = estimateForMicroCorp(transactions);
    const consumptionForm = buildConsumptionTaxForm(transactions);
    const taxForm = buildCorporateTaxForm(estimate);
    const localTaxForm = buildLocalCorporateTaxForm(estimate, taxForm);
    const fs = buildFinancialStatements(pl, taxForm, "テスト法人", localTaxForm.grandTotal);
    const bsNetIncome = fs.incomeBeforeTax - fs.taxes - consumptionForm.totalDue;

    if (bsData) {
      return buildBalanceSheetForm(
        {
          capitalStock: bsData.capitalStock,
          openingCash: bsData.openingCash,
          openingRetainedEarnings: bsData.openingRetainedEarnings,
          shareCount: 100,
          fixedAssets: bsData.fixedAssets,
          loans: bsData.loans,
          fiscalPeriod: bsData.fiscalPeriod,
        },
        bsData.cashInflow,
        bsData.cashOutflow,
        fs.taxes,
        consumptionForm.totalDue,
        bsNetIncome
      );
    }

    // FinancialStatementsClient.tsxのサンプル値フォールバック（SAMPLE_CAPITAL_STOCK=
    // 1,000,000円・SAMPLE_OPENING_CASH=3,000,000円・SAMPLE_SHARE_COUNT=100株）と
    // 同じ値。これらはコンポーネント側のモジュール内定数でexportされていないため、
    // 既存テストのSAMPLE_ENTRIESの扱いと同じ方針でここでも同じ値を複製する。
    return buildBalanceSheetForm(
      { capitalStock: 1_000_000, openingCash: 3_000_000, shareCount: 100 },
      pl.incomeTotal,
      pl.expenseTotal,
      fs.taxes,
      consumptionForm.totalDue,
      bsNetIncome
    );
  }

  it("サンプルデータ表示時、資産の部・負債の部・純資産の部の各金額セルが空欄にならず実際にレンダリングされる", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: SAMPLE_LIKE_TRANSACTIONS, isSampleData: true });
    vi.mocked(useBalanceSheetData).mockReturnValue({ data: null, isSampleData: true });

    const expected = computeExpectedBalanceSheet(SAMPLE_LIKE_TRANSACTIONS, null);

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    // 見出し（資産の部・負債の部・純資産の部）は元々表示されていたため、
    // ここでは中身の行の金額セルが空欄にならないことを検証する。
    expect(screen.getByText("資産の部")).toBeTruthy();
    expect(screen.getByText("負債の部")).toBeTruthy();
    expect(screen.getByText("純資産の部")).toBeTruthy();

    for (const value of [
      expected.endingCash,
      expected.assetsTotal,
      expected.unpaidCorporateTaxes,
      expected.unpaidConsumptionTax,
      expected.liabilitiesTotal,
      expected.capitalStock,
      expected.retainedEarningsEnding,
      expected.netAssetsTotal,
    ]) {
      const formatted = yen.format(value);
      // NaNは"NaN"という文字列になり、この正規表現には一致しない（空欄化・文字化けの検出も兼ねる）。
      expect(formatted).toMatch(/^￥-?[0-9,]+$/);
      expect(screen.getAllByText(formatted).length).toBeGreaterThanOrEqual(1);
    }

    // 固定資産・借入金は未指定（サンプルフォールバックでは常に0円）のため、行自体が出ない。
    expect(screen.queryByText("固定資産（期末帳簿価額）")).toBeNull();
    expect(screen.queryByText("借入金")).toBeNull();
  });

  it("実データ（bsData）取得時、固定資産・借入金を含む全ての金額セルが空欄にならず実際にレンダリングされる", async () => {
    const fixedAsset: Asset = {
      id: "asset-1",
      name: "ノートパソコン",
      acquisitionDate: "2026-03-01",
      acquisitionCost: 1_200_000,
      usefulLifeYears: 4,
    };
    const loan: Loan = {
      id: "loan-1",
      name: "日本政策金融公庫 運転資金",
      principalAmount: 2_000_000,
      interestRate: 0.02,
      startDate: "2026-01-01",
      termMonths: 60,
    };
    const bsData: LedgerBalanceSheetData = {
      capitalStock: 3_000_000,
      openingCash: 5_000_000,
      openingRetainedEarnings: 1_500_000,
      fixedAssets: [fixedAsset],
      loans: [loan],
      cashInflow: 400_000,
      cashOutflow: 50_000,
      fiscalPeriod: { start: "2026-03-01", end: "2026-08-31" },
    };

    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: false });
    vi.mocked(useBalanceSheetData).mockReturnValue({ data: bsData, isSampleData: false });

    const expected = computeExpectedBalanceSheet(REAL_TRANSACTIONS, bsData);
    // フィクスチャが固定資産・借入金の行を実際に描画させる（0円にならない）ことを保証する。
    expect(expected.fixedAssetsBookValue).toBeGreaterThan(0);
    expect(expected.loansBalance).toBeGreaterThan(0);

    const { FinancialStatementsClient } = await import("./FinancialStatementsClient");
    render(<FinancialStatementsClient />);

    expect(screen.getByText("資産の部")).toBeTruthy();
    expect(screen.getByText("負債の部")).toBeTruthy();
    expect(screen.getByText("純資産の部")).toBeTruthy();
    expect(screen.getByText("固定資産（期末帳簿価額）")).toBeTruthy();
    expect(screen.getByText("借入金")).toBeTruthy();

    for (const value of [
      expected.endingCash,
      expected.fixedAssetsBookValue,
      expected.assetsTotal,
      expected.unpaidCorporateTaxes,
      expected.unpaidConsumptionTax,
      expected.loansBalance,
      expected.liabilitiesTotal,
      expected.capitalStock,
      expected.retainedEarningsEnding,
      expected.netAssetsTotal,
    ]) {
      const formatted = yen.format(value);
      expect(formatted).toMatch(/^￥-?[0-9,]+$/);
      expect(screen.getAllByText(formatted).length).toBeGreaterThanOrEqual(1);
    }
  });
});
