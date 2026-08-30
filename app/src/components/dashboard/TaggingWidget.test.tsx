/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaggableTransaction } from "@/lib/tags/tagging";
import { TaggingWidget } from "./TaggingWidget";

// TagsClient.test.tsxと同じ方針: Supabase接続を伴うgetMyTenantUser・タグDB関数を
// モックし、決定的に検証する。
const mockGetMyTenantUser = vi.fn();
vi.mock("@/lib/db/tenants", () => ({
  getMyTenantUser: () => mockGetMyTenantUser(),
}));

const mockListTags = vi.fn();
const mockListTagAssignments = vi.fn();
const mockAssignTag = vi.fn();
const mockUnassignTag = vi.fn();
vi.mock("@/lib/db/tags", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  listTagAssignments: (...args: unknown[]) => mockListTagAssignments(...args),
  assignTag: (...args: unknown[]) => mockAssignTag(...args),
  unassignTag: (...args: unknown[]) => mockUnassignTag(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TRANSACTIONS: TaggableTransaction[] = [
  { id: "tx-1", date: "2026-07-01", description: "外注費（Xプロジェクト）", amount: -80_000 },
  { id: "tx-2", date: "2026-07-05", description: "少額の消耗品", amount: -1_000 }, // 閾値未満
];

describe("TaggingWidget", () => {
  it("テナント未解決（未ログイン）の場合はタグ作成の案内を表示する", async () => {
    mockGetMyTenantUser.mockResolvedValue(null);

    render(<TaggingWidget transactions={TRANSACTIONS} />);

    await waitFor(() => {
      expect(screen.getByText("まだタグが登録されていません。クライアント名・案件名などのタグを作成すると、ここから取引にタグを付けられるようになります。")).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "タグを作成する →" }).getAttribute("href")).toBe("/tags");
  });

  it("重要性閾値以上の未タグ取引のみを一覧表示する", async () => {
    mockGetMyTenantUser.mockResolvedValue({ tenant_id: "tenant-1", user_id: "u1", role: "owner", created_at: "" });
    mockListTags.mockResolvedValue([{ id: "tag-x", label: "Xプロジェクト", color: "#2a78d6" }]);
    mockListTagAssignments.mockResolvedValue([]);

    render(<TaggingWidget transactions={TRANSACTIONS} />);

    await waitFor(() => {
      expect(screen.getByText(/外注費（Xプロジェクト）/)).toBeTruthy();
    });
    // 閾値未満の取引は表示しない
    expect(screen.queryByText(/少額の消耗品/)).toBeNull();
  });

  it("タグのチップをクリックすると付与APIを呼び出す（タグ付け後は未タグ一覧から外れる）", async () => {
    mockGetMyTenantUser.mockResolvedValue({ tenant_id: "tenant-1", user_id: "u1", role: "owner", created_at: "" });
    mockListTags.mockResolvedValue([{ id: "tag-x", label: "Xプロジェクト", color: "#2a78d6" }]);
    mockListTagAssignments.mockResolvedValue([]);
    mockAssignTag.mockResolvedValue({ tagId: "tag-x", transactionId: "tx-1" });

    render(<TaggingWidget transactions={TRANSACTIONS} />);

    const chip = await screen.findByRole("button", { name: "Xプロジェクト" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);

    await waitFor(() => {
      expect(mockAssignTag).toHaveBeenCalledWith("tag-x", "tx-1");
    });
    // タグが付いた取引は「未タグ付けの主要な取引」一覧の対象外になるため、行ごと消える
    await waitFor(() => {
      expect(screen.queryByText(/外注費（Xプロジェクト）/)).toBeNull();
    });
    expect(screen.getByText("閾値以上の未タグ付け取引はありません。")).toBeTruthy();
  });
});
