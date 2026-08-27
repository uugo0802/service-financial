/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DocumentPreviewFrame } from "./DocumentPreviewFrame";

// @testing-library/reactの自動クリーンアップはtest.globals未使用時は効かないため明示的に行う。
afterEach(() => {
  cleanup();
});

describe("DocumentPreviewFrame", () => {
  it("子要素をそのまま描画する", () => {
    render(
      <DocumentPreviewFrame>
        <p>書類プレビュー本文</p>
      </DocumentPreviewFrame>
    );
    expect(screen.getByText("書類プレビュー本文")).toBeTruthy();
  });

  it("既定では<div>要素として描画される", () => {
    const { container } = render(<DocumentPreviewFrame>本文</DocumentPreviewFrame>);
    expect(container.querySelector("main")).toBeNull();
  });

  it('as="main"の場合は<main>要素として描画される', () => {
    const { container } = render(<DocumentPreviewFrame as="main">本文</DocumentPreviewFrame>);
    expect(container.querySelector("main")).not.toBeNull();
  });

  it("常にライト固定の背景・文字色クラス（bg-white / text-stone-900）を持つ（ダークモード非対応）", () => {
    const { container } = render(<DocumentPreviewFrame>本文</DocumentPreviewFrame>);
    const el = container.firstElementChild;
    expect(el?.className).toContain("bg-white");
    expect(el?.className).toContain("text-stone-900");
    expect(el?.className).not.toContain("dark:");
  });

  it("内側にoverflow-x-autoを持つ横スクロール可能なラッパーを持つ（印刷時はprint:overflow-visible）", () => {
    const { container } = render(<DocumentPreviewFrame>本文</DocumentPreviewFrame>);
    const inner = container.firstElementChild?.firstElementChild;
    expect(inner?.className).toContain("overflow-x-auto");
    expect(inner?.className).toContain("print:overflow-visible");
  });

  it("maxWidthに応じてTailwindのmax-wクラスが変わる", () => {
    const { container: xl3 } = render(<DocumentPreviewFrame maxWidth="3xl">本文</DocumentPreviewFrame>);
    expect(xl3.firstElementChild?.className).toContain("max-w-3xl");

    const { container: xl5 } = render(<DocumentPreviewFrame maxWidth="5xl">本文</DocumentPreviewFrame>);
    expect(xl5.firstElementChild?.className).toContain("max-w-5xl");

    const { container: def } = render(<DocumentPreviewFrame>本文</DocumentPreviewFrame>);
    expect(def.firstElementChild?.className).toContain("max-w-4xl");
  });
});
