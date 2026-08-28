/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountRow, JournalEntryRow, TenantUser } from "@/lib/db/supabaseClient";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listAccounts, createAccount } from "@/lib/db/accounts";
import { importCategorizedTransactionsAsJournalEntries } from "@/lib/db/csvJournalImport";
import JournalPage from "./page";

// journal/page.tsxは手入力の仕訳一覧を組み立てるだけの既存ロジック（lib/journal/entries.ts）は
// 変更していないため、ここでは「保存」操作の配線（tenant/勘定科目の取得 →
// importCategorizedTransactionsAsJournalEntries呼び出し → 成功時に一覧をクリア）だけを検証する。
// 変換ロジック自体（CategorizedTransaction[] → NewJournalEntryInput[]）は
// lib/db/csvJournalImport.test.tsで既に検証済みのため、ここでは呼び出しの引数のみ確認する。
vi.mock("@/lib/db/tenants", () => ({ getMyTenantUser: vi.fn() }));
vi.mock("@/lib/db/accounts", () => ({ listAccounts: vi.fn(), createAccount: vi.fn() }));
vi.mock("@/lib/db/csvJournalImport", () => ({ importCategorizedTransactionsAsJournalEntries: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tenantUser: TenantUser = { user_id: "user-1", tenant_id: "tenant-1", role: "owner", created_at: "2026-01-01T00:00:00Z" };

const cashAccount: AccountRow = {
  id: "acc-cash",
  tenant_id: "tenant-1",
  code: null,
  name: "現金及び預金",
  account_type: "asset",
  tax_category: null,
  created_at: "2026-01-01T00:00:00Z",
};

async function addEntryViaForm(overrides: { date?: string; description?: string; amount?: string; account?: string } = {}) {
  fireEvent.click(screen.getByRole("button", { name: "＋ 仕訳を追加" }));

  fireEvent.change(screen.getByLabelText("日付"), {
    target: { value: overrides.date ?? "2026-06-01" },
  });
  fireEvent.change(screen.getByPlaceholderText("例: -3000"), {
    target: { value: overrides.amount ?? "-3000" },
  });
  fireEvent.change(screen.getByPlaceholderText("例: 事務用品購入"), {
    target: { value: overrides.description ?? "文房具購入" },
  });
  fireEvent.change(screen.getByPlaceholderText("例: 消耗品費"), {
    target: { value: overrides.account ?? "消耗品費" },
  });

  fireEvent.click(screen.getByRole("button", { name: "仕訳を追加" }));
}

describe("JournalPage save wiring", () => {
  it("disables the save button until a cash account is selected", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listAccounts).mockResolvedValue([cashAccount]);

    render(<JournalPage />);

    await addEntryViaForm();

    const saveButton = (await screen.findByRole("button", { name: /この内容で記帳する/ })) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText("記帳先の現金・預金勘定を選択してください")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("記帳先の現金・預金勘定"), { target: { value: "acc-cash" } });
    expect(saveButton.disabled).toBe(false);
  });

  it("saves entries via importCategorizedTransactionsAsJournalEntries and clears the list on success", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listAccounts).mockResolvedValue([cashAccount]);
    const createdRow = {} as JournalEntryRow;
    vi.mocked(importCategorizedTransactionsAsJournalEntries).mockResolvedValue({
      created: [createdRow],
      createdAccountCount: 0,
    });

    render(<JournalPage />);

    await addEntryViaForm({ description: "文房具購入", amount: "-3000", account: "消耗品費" });
    expect(screen.getByText("（1件）")).toBeTruthy();

    fireEvent.change(await screen.findByLabelText("記帳先の現金・預金勘定"), { target: { value: "acc-cash" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /この内容で記帳する/ }));
    });

    await waitFor(() => {
      expect(importCategorizedTransactionsAsJournalEntries).toHaveBeenCalledTimes(1);
    });
    const [calledTenantId, calledEntries, calledCashAccountId] = vi.mocked(importCategorizedTransactionsAsJournalEntries).mock.calls[0];
    expect(calledTenantId).toBe("tenant-1");
    expect(calledCashAccountId).toBe("acc-cash");
    expect(calledEntries).toHaveLength(1);
    expect(calledEntries[0]).toMatchObject({
      description: "文房具購入",
      amount: -3000,
      account: "消耗品費",
      source: "manual",
    });

    expect(await screen.findByText("1件を記帳しました")).toBeTruthy();
    expect(screen.getByText("まだ仕訳がありません。上の「＋ 仕訳を追加」から入力してください。")).toBeTruthy();
  });

  it("shows an error message and keeps the entries when the save fails", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(tenantUser);
    vi.mocked(listAccounts).mockResolvedValue([cashAccount]);
    vi.mocked(importCategorizedTransactionsAsJournalEntries).mockRejectedValue(new Error("仕訳の作成に失敗しました: boom"));

    render(<JournalPage />);

    await addEntryViaForm();
    fireEvent.change(await screen.findByLabelText("記帳先の現金・預金勘定"), { target: { value: "acc-cash" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /この内容で記帳する/ }));
    });

    expect(await screen.findByText("仕訳の作成に失敗しました: boom")).toBeTruthy();
    expect(screen.getByText("（1件）")).toBeTruthy();
  });

  it("shows an unauthenticated message instead of the save form when there is no tenant user", async () => {
    vi.mocked(getMyTenantUser).mockResolvedValue(null);

    render(<JournalPage />);

    expect(await screen.findByText("ログインすると入力した仕訳を保存できます。")).toBeTruthy();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("shows an unconfigured message when tenant lookup throws (Supabase not configured)", async () => {
    vi.mocked(getMyTenantUser).mockRejectedValue(new Error("Supabaseが未設定です"));

    render(<JournalPage />);

    expect(
      await screen.findByText("Supabaseが未設定のため、この機能はまだ利用できません（開発中のプロトタイプです）。")
    ).toBeTruthy();
  });
});
