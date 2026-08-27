/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TableScrollArea } from "./TableScrollArea";

// @testing-library/reactの自動クリーンアップはtest.globals未使用時は効かないため明示的に行う。
afterEach(() => {
  cleanup();
});

describe("TableScrollArea", () => {
  it("子要素（テーブル等）をそのまま描画する", () => {
    render(
      <TableScrollArea>
        <table>
          <tbody>
            <tr>
              <td>セル</td>
            </tr>
          </tbody>
        </table>
      </TableScrollArea>
    );
    expect(screen.getByText("セル")).toBeTruthy();
  });

  it("ルート要素にmin-w-0を持つ（祖先flex/gridアイテムとしての横あふれ防止）", () => {
    const { container } = render(<TableScrollArea>中身</TableScrollArea>);
    expect(container.firstElementChild?.className).toContain("min-w-0");
  });

  it("内側の要素にoverflow-x-autoを持つ（実際に横スクロールするのはこちら）", () => {
    const { container } = render(<TableScrollArea>中身</TableScrollArea>);
    const inner = container.firstElementChild?.firstElementChild;
    expect(inner?.className).toContain("overflow-x-auto");
  });

  it("innerClassNameは内側のoverflow-x-auto要素に付与される（外側には付かない）", () => {
    const { container } = render(<TableScrollArea innerClassName="border rounded-lg">中身</TableScrollArea>);
    const outer = container.firstElementChild;
    const inner = outer?.firstElementChild;
    expect(inner?.className).toContain("border");
    expect(inner?.className).toContain("rounded-lg");
    expect(outer?.className).not.toContain("rounded-lg");
  });

  it("classNameは外側のルート要素に付与される", () => {
    const { container } = render(<TableScrollArea className="my-4">中身</TableScrollArea>);
    expect(container.firstElementChild?.className).toContain("my-4");
  });
});
