/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { Asset } from "@/lib/tax/depreciation";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { useDepreciationScheduleData } from "@/hooks/useDepreciationScheduleData";

// useLedgerTransactions・useDepreciationScheduleData自体はそれぞれのlib層のテストで
// 検証済みのため、ここではDepreciationScheduleClientが両フックの返り値をどう扱うかだけを
// 検証する（app/dashboard/page.test.tsx等、既存のフックモック方針と同じ）。
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: vi.fn(),
}));
vi.mock("@/hooks/useDepreciationScheduleData", () => ({
  useDepreciationScheduleData: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REAL_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "real-1",
    date: "2026-02-01",
    description: "実データ: 業務委託料入金",
    amount: 300_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "real-2",
    date: "2026-11-30",
    description: "実データ: 経費",
    amount: -20_000,
    account: "地代家賃",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
];

const REAL_ASSET: Asset = {
  id: "real-asset-1",
  name: "実データ資産：業務用モニター",
  acquisitionDate: "2025-01-10",
  acquisitionCost: 240_000,
  usefulLifeYears: 4,
  method: "straight-line",
};

describe("DepreciationScheduleClient", () => {
  it("isSampleDataがtrueの間はサンプルデータ表示中である旨を示し、サンプル資産一覧が表示される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: true });
    vi.mocked(useDepreciationScheduleData).mockReturnValue({ data: null, isSampleData: true });

    const { DepreciationScheduleClient } = await import("./DepreciationScheduleClient");
    render(<DepreciationScheduleClient />);

    expect(
      screen.getByText("今ごえん合同会社を想定したサンプルの固定資産データで別表十六（一）の下書きを表示しています。")
    ).toBeTruthy();
    // SAMPLE_ASSETSの定額法資産のうちの1つが表として描画されていること。
    expect(screen.getByText("ノートパソコン（業務用）")).toBeTruthy();
    expect(screen.queryByText("実データ資産：業務用モニター")).toBeNull();
    // 様式ヘッダー（OfficialFormFrame経由）に法人名が反映されていること。
    expect(screen.getByText((_, node) => node?.textContent === "法人名: 今ごえん合同会社")).toBeTruthy();
    // CSVダウンロードボタンが表示されていること。
    expect(screen.getByRole("button", { name: "CSVをダウンロード（別表十六（一））" })).toBeTruthy();
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を示し、フック経由の実テナント名・実資産一覧が反映される", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: false });
    vi.mocked(useDepreciationScheduleData).mockReturnValue({
      data: { entityName: "実データ株式会社", assets: [REAL_ASSET] },
      isSampleData: false,
    });

    const { DepreciationScheduleClient } = await import("./DepreciationScheduleClient");
    render(<DepreciationScheduleClient />);

    expect(screen.getByText("固定資産台帳に登録された実データに基づいて別表十六（一）の下書きを表示しています。")).toBeTruthy();
    expect(screen.queryByText("今ごえん合同会社を想定したサンプルの固定資産データで別表十六（一）の下書きを表示しています。")).toBeNull();
    expect(screen.getByText("実データ資産：業務用モニター")).toBeTruthy();
    expect(screen.getByText("実データ株式会社")).toBeTruthy();
    // サンプル資産は混入していないこと。
    expect(screen.queryByText("ノートパソコン（業務用）")).toBeNull();
  });

  it("対象期間はuseLedgerTransactionsのtransactionsから算出したpl.periodStart/periodEndに追従する", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({ transactions: REAL_TRANSACTIONS, isSampleData: false });
    vi.mocked(useDepreciationScheduleData).mockReturnValue({
      data: { entityName: "実データ株式会社", assets: [REAL_ASSET] },
      isSampleData: false,
    });

    const { DepreciationScheduleClient } = await import("./DepreciationScheduleClient");
    render(<DepreciationScheduleClient />);

    // REAL_TRANSACTIONSの先頭行・末尾行の日付（2026-02-01〜2026-11-30）が
    // 事業年度（DepreciationScheduleTableのfiscalPeriod）として反映されていること。
    expect(
      screen.getByText((_, node) => node?.textContent === "事業年度: 2026-02-01 〜 2026-11-30")
    ).toBeTruthy();
  });
});
