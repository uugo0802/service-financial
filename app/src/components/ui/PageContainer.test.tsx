/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageContainer } from "./PageContainer";

// @testing-library/reactの自動クリーンアップはtest.globals未使用時は効かないため明示的に行う。
afterEach(() => {
  cleanup();
});

describe("PageContainer", () => {
  it("子要素をそのまま描画する", () => {
    render(
      <PageContainer>
        <p>本文</p>
      </PageContainer>
    );
    expect(screen.getByText("本文")).toBeTruthy();
  });

  it("既定では<div>要素として描画される", () => {
    const { container } = render(<PageContainer>本文</PageContainer>);
    expect(container.querySelector("div")?.tagName).toBe("DIV");
    expect(container.querySelector("main")).toBeNull();
  });

  it('as="main"の場合は<main>要素として描画される', () => {
    const { container } = render(<PageContainer as="main">本文</PageContainer>);
    expect(container.querySelector("main")).not.toBeNull();
  });

  it("min-w-0を常に含む（祖先flex/gridアイテムとしての横あふれ防止）", () => {
    const { container } = render(<PageContainer>本文</PageContainer>);
    expect(container.firstElementChild?.className).toContain("min-w-0");
  });

  it("maxWidthに応じてTailwindのmax-wクラスが変わる", () => {
    const { container: md } = render(<PageContainer maxWidth="md">本文</PageContainer>);
    expect(md.firstElementChild?.className).toContain("max-w-md");

    const { container: xl } = render(<PageContainer maxWidth="xl">本文</PageContainer>);
    expect(xl.firstElementChild?.className).toContain("max-w-xl");

    const { container: xl3 } = render(<PageContainer maxWidth="3xl">本文</PageContainer>);
    expect(xl3.firstElementChild?.className).toContain("max-w-3xl");

    const { container: xl5 } = render(<PageContainer>本文</PageContainer>);
    expect(xl5.firstElementChild?.className).toContain("max-w-5xl");
  });

  it("追加のclassNameとその他のprops（data-testid等）を子要素へ渡す", () => {
    const { container } = render(
      <PageContainer className="extra-class" data-testid="page-container">
        本文
      </PageContainer>
    );
    const el = container.firstElementChild;
    expect(el?.className).toContain("extra-class");
    expect(el?.getAttribute("data-testid")).toBe("page-container");
  });
});
