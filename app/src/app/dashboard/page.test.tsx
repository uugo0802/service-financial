/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import DashboardPage from "./page";

// useLedgerTransactions自体はhooks/useLedgerTransactions.test.tsで検証済み。
// ここではDashboardPageが返り値（transactions・isSampleData）をどう扱うかだけを検証するため、
// フックをモックしてサンプル/実データ双方の描画結果を確認する
// （trial-balance/TrialBalanceClient.tsx等、既存のuseLedgerTransactions利用ページと同じ方針）。
vi.mock("@/hooks/useLedgerTransactions", () => ({
  useLedgerTransactions: vi.fn(),
}));

// TaggingWidget（タグ付けウィジェット）がgetMyTenantUser()・listTags()・
// listTagAssignments()を呼び出すため、TagsClient.test.tsxと同じ方針でモックし、
// テナント未解決（サンプル運用のまま）で決定的に検証できるようにする。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));
vi.mock("@/lib/db/tags", () => ({
  listTags: vi.fn(),
  listTagAssignments: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));

// Vitest 4のjsdom環境はpopulateGlobal時にjsdom自体が実装するlocalStorageを
// 引き継がない既知のギャップがあり、window.localStorageがundefinedのままになる
// （lib/settings/themePreference.test.ts等が元々window全体を手動スタブしているのも
// 同じ理由）。hooks/useDashboardWidgetLayout.tsがgetItem/setItem/clearを使うため最小限スタブする。
function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: createLocalStorageStub(),
    configurable: true,
    writable: true,
  });
  mockGetMyTenantUser.mockResolvedValue(null); // 未ログイン・未所属の場合はサンプル（タグ0件）のまま
});

// このプロジェクトはvitest.config.tsでtest.globalsを有効化していないため、
// @testing-library/reactの自動クリーンアップが効かない（AppShell.test.tsxと同じ理由で明示的に行う）。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

// dashboardページのグラフが年度別集計を出せるよう、収入・支出それぞれ1件ずつを含む
// 最小の実データセット。勘定科目名はSAMPLE_EXPENSE_CATEGORY_ROWS（page.tsx内のダミー
// 経費内訳データ）と重複しない名前にして、実データ表示時にダミー行が混入していないことを
// 判別できるようにする。
const REAL_TRANSACTIONS: CategorizedTransaction[] = [
  {
    id: "real-income-1",
    date: "2026-03-05",
    description: "実データ: 業務委託料入金",
    amount: 500_000,
    account: "売上高",
    taxCategory: "課税売上10%",
    confidence: 1,
    source: "rule",
  },
  {
    id: "real-expense-1",
    date: "2026-03-10",
    description: "実データ: 経費",
    amount: -50_000,
    account: "特別経費テスト",
    taxCategory: "課税仕入10%",
    confidence: 1,
    source: "rule",
  },
];

describe("DashboardPage", () => {
  it("isSampleDataがtrueの間はサンプルデータ使用中である旨を表示する", () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({
      transactions: REAL_TRANSACTIONS,
      isSampleData: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText("現時点ではサンプルデータを表示しています。")).toBeTruthy();
    expect(
      screen.getByText("表示している金額はサンプルデータに基づく概算であり、実際の申告内容を示すものではありません。")
    ).toBeTruthy();
    // サンプル表示中は経費内訳チャート用の補完ダミー行(SAMPLE_EXPENSE_CATEGORY_ROWS)が
    // 上乗せされ、その科目（例: 外注費）がグラフに描画される。
    expect(screen.getAllByText("外注費").length).toBeGreaterThan(0);
  });

  it("isSampleDataがfalseの場合は実データ表示である旨を表示し、ダミー経費行を混入させない", () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({
      transactions: REAL_TRANSACTIONS,
      isSampleData: false,
    });

    render(<DashboardPage />);

    expect(screen.getByText(/記帳された実データ（当期・過去の取引）に基づいて表示しています。/)).toBeTruthy();
    expect(
      screen.getByText("表示している金額は記帳データに基づく概算であり、実際の申告内容を示すものではありません。")
    ).toBeTruthy();
    expect(screen.queryByText("現時点ではサンプルデータを表示しています。")).toBeNull();
    // 実データ表示中はSAMPLE_EXPENSE_CATEGORY_ROWS由来の科目（外注費など、実データには
    // 存在しない科目名）が混入してはならない。
    expect(screen.queryByText("外注費")).toBeNull();
    expect(screen.getAllByText("特別経費テスト").length).toBeGreaterThan(0);
  });

  it("useLedgerTransactionsが返した実データを月次・年次の集計にそのまま流し込む", () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({
      transactions: REAL_TRANSACTIONS,
      isSampleData: false,
    });

    render(<DashboardPage />);

    // 2026年（唯一の年度）の売上・損益がStatTileに反映されていること。
    // 収入500,000円・経費50,000円なので損益は450,000円。
    expect(screen.getByText((_, node) => node?.textContent === "今期の売上（2026年 1〜1月）")).toBeTruthy();
    expect(screen.getAllByText((_, node) => node?.textContent === "￥450,000").length).toBeGreaterThan(0);
  });

  it("タグ付けウィジェット・予算実績ウィジェット・表示設定への案内リンクを表示する", async () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({
      transactions: REAL_TRANSACTIONS,
      isSampleData: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "取引にタグを付ける" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /予算実績/ })).toBeTruthy();
    const appearanceLink = screen.getByRole("link", { name: "表示設定" });
    expect(appearanceLink.getAttribute("href")).toBe("/settings/appearance");
  });

  it("実データが空でyearlyTrendが空になる場合は空状態のメッセージを表示する", () => {
    vi.mocked(useLedgerTransactions).mockReturnValue({
      transactions: [],
      isSampleData: false,
    });

    render(<DashboardPage />);

    expect(
      screen.getByText("表示できる記帳データがありません。記帳データが登録されると、ここに売上・損益の推移が表示されます。")
    ).toBeTruthy();
  });
});
