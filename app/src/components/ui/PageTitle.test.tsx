/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageTitle } from "./PageTitle";

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

afterEach(() => {
  cleanup();
});

describe("PageTitle", () => {
  it("現在のページに対応するナビラベルを表示する", () => {
    mockPathname = "/journal";
    render(<PageTitle />);
    expect(screen.getByText("仕訳入力")).toBeTruthy();
  });

  it("サブページでも対応するナビラベルを表示する", () => {
    mockPathname = "/settings/security";
    render(<PageTitle />);
    expect(screen.getByText("セキュリティ")).toBeTruthy();
  });

  it("一致するナビ項目がない場合は「スグル」を表示する", () => {
    mockPathname = "/no-such-page";
    render(<PageTitle />);
    expect(screen.getByText("スグル")).toBeTruthy();
  });

  it("ダッシュボードへのリンクとして描画される", () => {
    mockPathname = "/journal";
    render(<PageTitle />);
    const link = screen.getByText("仕訳入力").closest("a");
    expect(link?.getAttribute("href")).toBe("/dashboard");
  });
});
