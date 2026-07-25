import { describe, expect, it } from "vitest";
import { normalizeCsv } from "./parse";

describe("normalizeCsv", () => {
  it("parses a single-amount-column format (generic)", () => {
    const csv = "日付,摘要,金額\n2026-01-05,家賃,-120000\n2026-01-08,業務委託料入金,450000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ date: "2026-01-05", description: "家賃", amount: -120000 });
    expect(result.detectedColumns).toEqual({ date: "日付", description: "摘要", amount: "金額" });
  });

  it("parses a 三井住友銀行-style split withdraw/deposit format with 年月日", () => {
    const csv = "年月日,お取り扱い内容,お引出し,お預入れ,残高\n2026-01-05,家賃引落,120000,,880000\n2026-01-08,振込入金,,450000,1330000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "家賃引落", amount: -120000 },
      { id: "row-2", date: "2026-01-08", description: "振込入金", amount: 450000 },
    ]);
  });

  it("parses a credit-card-style format (ご利用日/ご利用店名及び商品名/ご利用金額)", () => {
    const csv = "ご利用日,ご利用店名及び商品名,ご利用金額\n2026-01-12,Amazon.co.jp,6400\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([{ id: "row-1", date: "2026-01-12", description: "Amazon.co.jp", amount: -6400 }]);
  });

  it("parses a signed single-column format (楽天銀行-style 入出金)", () => {
    const csv = "取引日,入出金先内容,入出金\n2026-01-05,カード引落,-3000\n2026-01-06,給与振込,300000\n";
    const result = normalizeCsv(csv);
    expect(result.transactions).toEqual([
      { id: "row-1", date: "2026-01-05", description: "カード引落", amount: -3000 },
      { id: "row-2", date: "2026-01-06", description: "給与振込", amount: 300000 },
    ]);
  });

  it("returns empty result with unknown columns when nothing matches", () => {
    const result = normalizeCsv("foo,bar\n1,2\n");
    expect(result.detectedColumns).toEqual({ date: "未検出", description: "未検出", amount: "未検出" });
  });
});
