// ------------------------------------------------------------------
// 免責: このファイルが生成するカレンダーイベントの日付は、国税庁・自治体が
// 公表している一般的な申告期限（暦情報）に基づく参考値です。個別の税務相談・
// 助言ではありません。土日祝日により実際の期限が前後する場合があるため、
// 必ず国税庁・eLTAX（地方税ポータルシステム）の公式情報、または税理士等の
// 専門家にご確認ください。この免責文言は各イベントのDESCRIPTIONにも含まれます。
// ------------------------------------------------------------------

import type { FilingDeadline } from "./deadlines";

/** RFC 5545 が要求する行の折り返し（フォールディング）前の最大オクテット数 */
const ICS_MAX_LINE_OCTETS = 75;

/** 各VEVENTのDESCRIPTIONに必ず含める免責文言。UI側でも再利用できるようexportする。 */
export const ICS_DISCLAIMER_TEXT =
  "この日付は一般的な法定期限に基づく参考値であり、個別の税務相談・助言ではありません。" +
  "必ず国税庁・eLTAX（地方税ポータルシステム）の公式情報、または税理士等の専門家にご確認ください。";

export interface BuildDeadlinesIcsOptions {
  /** カレンダー全体の名前（X-WR-CALNAME）。省略時は既定の名前を使用。 */
  calendarName?: string;
  /** DTSTAMPに使う「現在時刻」。テストで固定するために注入可能。省略時は new Date()。 */
  now?: Date;
}

const DEFAULT_CALENDAR_NAME = "申告期限リマインダー（本人申告支援）";

/**
 * RFC 5545のTEXT値エスケープ規則を適用する。
 * バックスラッシュ・カンマ・セミコロンをエスケープし、改行は "\n"（2文字）に変換する。
 * 順序が重要: バックスラッシュのエスケープを最初に行わないと、後続の置換で
 * 挿入したバックスラッシュ自体を二重にエスケープしてしまう。
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

/**
 * RFC 5545の行フォールディング（3.1節）を実装する。
 * 1行がUTF-8で75オクテットを超える場合、75オクテット目で折り返し、
 * 継続行の先頭にスペース1つを付与する（このスペースも75オクテットの一部としてカウントされる）。
 * マルチバイト文字（UTF-8継続バイト 0b10xxxxxx）の途中では分割しない。
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= ICS_MAX_LINE_OCTETS) return line;

  const decoder = new TextDecoder();
  const segments: string[] = [];
  let start = 0;
  let firstSegment = true;

  while (start < bytes.length) {
    // 継続行はスペース1つ分を差し引いた74オクテットが実質の上限。
    const limit = firstSegment ? ICS_MAX_LINE_OCTETS : ICS_MAX_LINE_OCTETS - 1;
    let end = Math.min(start + limit, bytes.length);
    // UTF-8継続バイトの途中で切らないよう、境界を後退させる。
    while (end > start + 1 && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    segments.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    firstSegment = false;
  }

  return segments.join("\r\n ");
}

function formatIcsUtcTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

/** "YYYY-MM-DD" を全終日イベント用の "YYYYMMDD" に変換する。 */
function formatIcsAllDayDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid ISO date string (expected YYYY-MM-DD): ${isoDate}`);
  }
  return `${match[1]}${match[2]}${match[3]}`;
}

function buildDescription(deadline: FilingDeadline): string {
  return [
    `${deadline.label}（期日: ${deadline.dueDate}）`,
    "",
    `免責事項: ${ICS_DISCLAIMER_TEXT}`,
  ].join("\n");
}

function buildVEvent(deadline: FilingDeadline, dtstamp: string): string[] {
  const uid = `${deadline.id}-${formatIcsAllDayDate(deadline.dueDate)}@filing-deadlines.service-financial.local`;

  // 終日イベントはDTSTARTのみでDTEND/DURATIONを省略できる（RFC 5545上、
  // 終日でDTENDがない場合は1日分の長さと解釈される）。複数日にまたがる
  // イベントは現時点で扱わないため、簡潔さのためDTENDは意図的に省略する。
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${formatIcsAllDayDate(deadline.dueDate)}`,
    `SUMMARY:${escapeIcsText(deadline.label)}`,
    `DESCRIPTION:${escapeIcsText(buildDescription(deadline))}`,
    "END:VEVENT",
  ];

  return lines.map(foldIcsLine);
}

/**
 * 申告期限一覧から、RFC 5545準拠のiCalendar（.ics）文字列を生成する。
 * 外部の ics ライブラリには依存せず、このリポジトリの方針どおり
 * 依存関係を追加しない実装とする。
 *
 * 空配列を渡した場合も、VEVENTを含まない有効なVCALENDARを返す。
 */
export function buildDeadlinesIcs(
  deadlines: readonly FilingDeadline[],
  options: BuildDeadlinesIcsOptions = {},
): string {
  const dtstamp = formatIcsUtcTimestamp(options.now ?? new Date());
  const calendarName = options.calendarName ?? DEFAULT_CALENDAR_NAME;

  const headerLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//service-financial//Filing Deadline Reminders//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ].map(foldIcsLine);

  const eventLines = deadlines.flatMap((deadline) => buildVEvent(deadline, dtstamp));

  const footerLines = ["END:VCALENDAR"];

  return [...headerLines, ...eventLines, ...footerLines].join("\r\n") + "\r\n";
}

/** ダウンロードファイル名として使いやすい形式のデフォルトファイル名を返す。 */
export function buildDeadlinesIcsFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `filing-deadlines-${y}${m}${d}.ics`;
}
