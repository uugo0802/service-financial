import { describe, expect, it } from "vitest";
import { buildDeadlinesIcs, buildDeadlinesIcsFilename, ICS_DISCLAIMER_TEXT } from "./icsExport";
import type { FilingDeadline } from "./deadlines";

function makeDeadline(overrides: Partial<FilingDeadline> = {}): FilingDeadline {
  return {
    id: "individual-income-tax",
    label: "所得税確定申告（下書き）",
    dueDate: "2026-03-15",
    daysRemaining: 30,
    urgency: "warning",
    ...overrides,
  };
}

/** VCALENDAR文字列から折り返された行を1論理行に戻す（CRLF + 先頭スペースの継続行を結合）。 */
function unfold(ics: string): string[] {
  const rawLines = ics.split("\r\n");
  const logicalLines: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith(" ") && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      logicalLines.push(line);
    }
  }
  return logicalLines;
}

describe("buildDeadlinesIcs", () => {
  it("produces a valid VCALENDAR wrapper with correct header fields", () => {
    const ics = buildDeadlinesIcs([makeDeadline()], { now: new Date("2026-01-10T00:00:00Z") });

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("CALSCALE:GREGORIAN\r\n");
    expect(ics).toMatch(/PRODID:-\/\/service-financial\/\/Filing Deadline Reminders\/\/JA/);
  });

  it("produces a valid but eventless calendar for an empty deadline list", () => {
    const ics = buildDeadlinesIcs([]);
    const lines = unfold(ics);

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("END:VEVENT");
  });

  it("emits one VEVENT block per deadline, in the given order", () => {
    const deadlines = [
      makeDeadline({ id: "individual-income-tax", label: "所得税確定申告", dueDate: "2026-03-15" }),
      makeDeadline({ id: "individual-consumption-tax", label: "消費税確定申告", dueDate: "2026-03-31" }),
    ];

    const ics = buildDeadlinesIcs(deadlines);
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount = (ics.match(/END:VEVENT/g) ?? []).length;

    expect(beginCount).toBe(2);
    expect(endCount).toBe(2);

    const firstIndex = ics.indexOf("individual-income-tax");
    const secondIndex = ics.indexOf("individual-consumption-tax");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it("formats DTSTART as an all-day date (VALUE=DATE), not a DATETIME", () => {
    const ics = buildDeadlinesIcs([makeDeadline({ dueDate: "2026-03-15" })]);
    const lines = unfold(ics);

    const dtstartLine = lines.find((l) => l.startsWith("DTSTART"));
    expect(dtstartLine).toBe("DTSTART;VALUE=DATE:20260315");
    // 終日イベントなので時刻・タイムゾーン(T, Z)を含んではならない。
    expect(dtstartLine).not.toMatch(/T\d{6}/);
  });

  it("includes a UID and DTSTAMP for every event", () => {
    const ics = buildDeadlinesIcs([makeDeadline()], { now: new Date("2026-01-10T12:34:56Z") });
    const lines = unfold(ics);

    const uidLine = lines.find((l) => l.startsWith("UID:"));
    const dtstampLine = lines.find((l) => l.startsWith("DTSTAMP:"));

    expect(uidLine).toMatch(/^UID:individual-income-tax-20260315@/);
    expect(dtstampLine).toBe("DTSTAMP:20260110T123456Z");
  });

  it("includes a disclaimer in the DESCRIPTION pointing to official NTA/eLTAX sources or a tax accountant", () => {
    const ics = buildDeadlinesIcs([makeDeadline()]);
    const lines = unfold(ics);

    const descriptionLine = lines.find((l) => l.startsWith("DESCRIPTION:"));
    expect(descriptionLine).toBeDefined();
    expect(descriptionLine).toContain(escapeExpectedText(ICS_DISCLAIMER_TEXT));
    expect(descriptionLine).toContain("国税庁");
    expect(descriptionLine).toContain("eLTAX");
    expect(descriptionLine).toContain("税理士");
    // 個別の助言ではないことが明記されていること
    expect(ICS_DISCLAIMER_TEXT).toContain("個別の税務相談・助言ではありません");
  });

  describe("RFC 5545 text escaping", () => {
    it("escapes commas in the SUMMARY", () => {
      const ics = buildDeadlinesIcs([makeDeadline({ label: "確定申告, 準備" })]);
      const lines = unfold(ics);
      const summaryLine = lines.find((l) => l.startsWith("SUMMARY:"));
      expect(summaryLine).toBe("SUMMARY:確定申告\\, 準備");
    });

    it("escapes semicolons in the SUMMARY", () => {
      const ics = buildDeadlinesIcs([makeDeadline({ label: "所得税; 消費税" })]);
      const lines = unfold(ics);
      const summaryLine = lines.find((l) => l.startsWith("SUMMARY:"));
      expect(summaryLine).toBe("SUMMARY:所得税\\; 消費税");
    });

    it("escapes backslashes in the SUMMARY", () => {
      const ics = buildDeadlinesIcs([makeDeadline({ label: "税務\\申告" })]);
      const lines = unfold(ics);
      const summaryLine = lines.find((l) => l.startsWith("SUMMARY:"));
      expect(summaryLine).toBe("SUMMARY:税務\\\\申告");
    });

    it("escapes backslashes before escaping other characters (no double-escaping)", () => {
      const ics = buildDeadlinesIcs([makeDeadline({ label: "a\\,b" })]);
      const lines = unfold(ics);
      const summaryLine = lines.find((l) => l.startsWith("SUMMARY:"));
      // 入力 "a\,b" は まず "\\" -> "a\\,b" となり、次にカンマがエスケープされ "a\\\,b" になる。
      expect(summaryLine).toBe("SUMMARY:a\\\\\\,b");
    });

    it("converts newlines in the DESCRIPTION into the literal two-character sequence \\n", () => {
      const ics = buildDeadlinesIcs([makeDeadline({ label: "テスト期限" })]);
      const lines = unfold(ics);
      const descriptionLine = lines.find((l) => l.startsWith("DESCRIPTION:"));

      expect(descriptionLine).toBeDefined();
      // 実際の改行文字(\n, \r)を含んではならない。
      expect(descriptionLine).not.toMatch(/[\r\n]/);
      // リテラルの "\n" (バックスラッシュ+n) は含まれる。
      expect(descriptionLine).toContain("\\n");
    });
  });

  describe("line folding", () => {
    it("folds a SUMMARY line exceeding 75 octets, with continuation lines starting with a space", () => {
      const longLabel = "非常に長いタイトル".repeat(10);
      const ics = buildDeadlinesIcs([makeDeadline({ label: longLabel })]);
      const rawLines = ics.split("\r\n");

      // 折り返された継続行が少なくとも1つ存在するはず。
      const continuationLines = rawLines.filter((l) => l.startsWith(" "));
      expect(continuationLines.length).toBeGreaterThan(0);

      // どの物理行もUTF-8で75オクテットを超えないこと。
      const encoder = new TextEncoder();
      for (const line of rawLines) {
        expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      }

      // アンフォールドすると元のテキストが（エスケープ済みの形で）復元できること。
      const unfolded = unfold(ics);
      const summaryLine = unfolded.find((l) => l.startsWith("SUMMARY:"));
      expect(summaryLine).toBe(`SUMMARY:${longLabel}`);
    });

    it("does not fold a short SUMMARY line", () => {
      // DESCRIPTIONは免責事項を含むため長くなり折り返される場合があるが、
      // 短いSUMMARY自体は単独の物理行のまま出力されるはず。
      const ics = buildDeadlinesIcs([makeDeadline({ label: "短いタイトル" })]);
      const rawLines = ics.split("\r\n");
      const summaryIndex = rawLines.findIndex((l) => l.startsWith("SUMMARY:"));

      expect(summaryIndex).toBeGreaterThan(-1);
      expect(rawLines[summaryIndex]).toBe("SUMMARY:短いタイトル");
      expect(rawLines[summaryIndex + 1]?.startsWith(" ")).toBe(false);
    });
  });
});

describe("buildDeadlinesIcsFilename", () => {
  it("produces a stable, date-based .ics filename", () => {
    const filename = buildDeadlinesIcsFilename(new Date(2026, 0, 10));
    expect(filename).toBe("filing-deadlines-20260110.ics");
  });
});

/** テスト内で期待値を組み立てる際に、本体と同じエスケープ規則を適用するための小さなヘルパー。 */
function escapeExpectedText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
