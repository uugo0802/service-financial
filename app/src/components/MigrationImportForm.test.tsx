/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { MigrationImportForm } from "./MigrationImportForm";
import { parseMigrationCsvBuffer } from "@/lib/csv/migrationImport";

vi.mock("@/lib/csv/migrationImport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csv/migrationImport")>("@/lib/csv/migrationImport");
  return { ...actual, parseMigrationCsvBuffer: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeCsvFile(content = "dummy") {
  return new File([content], "journal.csv", { type: "text/csv" });
}

async function uploadFile(view: RenderResult, file: File) {
  const input = view.container.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("MigrationImportForm", () => {
  it("自動判定に成功した場合、フォーマット選択ボタンは表示しない", async () => {
    vi.mocked(parseMigrationCsvBuffer).mockReturnValue({
      formatId: "freee",
      encoding: "utf-8",
      transactions: [],
      skippedRows: 0,
      detectedColumns: { date: "日付", debitAccount: "借方勘定科目", creditAccount: "貸方勘定科目", amount: "金額", description: "摘要" },
    });

    const view = render(<MigrationImportForm />);
    await uploadFile(view, makeCsvFile());

    await waitFor(() => expect(screen.getByText(/取込件数/)).toBeTruthy());
    expect(screen.queryByText("移行元ソフトを指定（自動判定できなかった場合）")).toBeNull();
  });

  it("自動判定に失敗した場合のみ、フォーマット選択ボタンを表示する", async () => {
    vi.mocked(parseMigrationCsvBuffer).mockReturnValue({
      formatId: null,
      encoding: "utf-8",
      transactions: [],
      skippedRows: 0,
      detectedColumns: { date: null, debitAccount: null, creditAccount: null, amount: null, description: null },
    });

    const view = render(<MigrationImportForm />);
    await uploadFile(view, makeCsvFile());

    await waitFor(() => expect(screen.getByText("移行元ソフトを指定（自動判定できなかった場合）")).toBeTruthy());
  });
});
