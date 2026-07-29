// ------------------------------------------------------------------
// 免責: ここに表示される期日は、国税庁・自治体が公表している一般的な
// 申告期限（暦・カレンダー情報）に基づく参考値です。個別の税務相談・
// 助言ではありません。土日祝日により実際の期限が前後する場合があるため、
// 必ず国税庁・お住まいの自治体の公式情報でご確認ください。
// ------------------------------------------------------------------

export type EntityType = "individual" | "corporate";

export type DeadlineUrgency = "urgent" | "warning" | "normal";

export interface FilingDeadline {
  id: string;
  label: string;
  dueDate: string; // ISO形式の日付のみ "YYYY-MM-DD"
  daysRemaining: number; // 0 = 本日が期日、負の値は返さない（翌年分に繰り越す）
  urgency: DeadlineUrgency;
}

export interface GetUpcomingFilingDeadlinesInput {
  entityType: EntityType;
  referenceDate: Date | string;
  /** 法人のみ。決算月（1〜12）。省略時は3月（多くのマイクロ法人が採用する3月決算）を仮定 */
  fiscalYearEndMonth?: number;
}

export const DEFAULT_FISCAL_YEAR_END_MONTH = 3;

const URGENT_THRESHOLD_DAYS = 14;
const WARNING_THRESHOLD_DAYS = 45;

export function classifyUrgency(daysRemaining: number): DeadlineUrgency {
  if (daysRemaining <= URGENT_THRESHOLD_DAYS) return "urgent";
  if (daysRemaining <= WARNING_THRESHOLD_DAYS) return "warning";
  return "normal";
}

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function toCalendarDate(input: Date | string): CalendarDate {
  if (typeof input === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (!match) {
      throw new Error(`Invalid date string (expected YYYY-MM-DD): ${input}`);
    }
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  // ローカルのカレンダー値（年/月/日）だけを取り出し、以降はUTC基準で扱うことで
  // タイムゾーンによる日付のズレを避ける。
  return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() };
}

function makeUTCDate({ year, month, day }: CalendarDate): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function lastDayOfMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) は「month(1-indexed)の0日目」= 前月の末日を返すJSの挙動を利用。
  // うるう年のうるう日（2月29日）もこれで自動的に正しく判定される。
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 毎年繰り返される期日（月・日を指定）のうち、referenceDate以降で最も近いものを返す。
 * referenceDateと同日の場合は「今日が期日」として扱い、翌年には繰り越さない。
 */
function nextAnnualDeadline(reference: Date, month: number, day: number | "last"): Date {
  const year = reference.getUTCFullYear();
  const resolveDay = (y: number) => (day === "last" ? lastDayOfMonth(y, month) : day);

  const candidate = makeUTCDate({ year, month, day: resolveDay(year) });
  if (candidate.getTime() < reference.getTime()) {
    return makeUTCDate({ year: year + 1, month, day: resolveDay(year + 1) });
  }
  return candidate;
}

interface DeadlineDefinition {
  id: string;
  label: string;
  month: number;
  day: number | "last";
}

function individualDeadlineDefinitions(): DeadlineDefinition[] {
  return [
    { id: "individual-income-tax", label: "所得税確定申告（下書き）", month: 3, day: 15 },
    { id: "individual-consumption-tax", label: "消費税確定申告（課税事業者のみ・下書き）", month: 3, day: 31 },
  ];
}

function corporateDeadlineDefinitions(fiscalYearEndMonth: number): DeadlineDefinition[] {
  if (!Number.isInteger(fiscalYearEndMonth) || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
    throw new Error(`fiscalYearEndMonth must be an integer between 1 and 12 (got ${fiscalYearEndMonth})`);
  }
  // 申告期限は事業年度終了日の翌日から2ヶ月以内＝決算月の2ヶ月後の末日（一般的な確定申告期限の考え方）。
  const rawDueMonth = fiscalYearEndMonth + 2;
  const dueMonth = rawDueMonth > 12 ? rawDueMonth - 12 : rawDueMonth;
  return [
    { id: "corporate-national-tax", label: "法人税・地方法人税・消費税の申告・納付（概算）", month: dueMonth, day: "last" },
    { id: "corporate-local-tax", label: "法人住民税・事業税の申告・納付（概算）", month: dueMonth, day: "last" },
  ];
}

/**
 * 直近の申告期限一覧を、日数残り少ない順に返す。
 * あくまで一般的な暦情報（法定の原則的な期限）であり、個別の税務相談ではない。
 */
export function getUpcomingFilingDeadlines(input: GetUpcomingFilingDeadlinesInput): FilingDeadline[] {
  const referenceCalendarDate = toCalendarDate(input.referenceDate);
  const reference = makeUTCDate(referenceCalendarDate);

  const definitions: DeadlineDefinition[] =
    input.entityType === "individual"
      ? individualDeadlineDefinitions()
      : corporateDeadlineDefinitions(input.fiscalYearEndMonth ?? DEFAULT_FISCAL_YEAR_END_MONTH);

  return definitions
    .map((def) => {
      const dueDate = nextAnnualDeadline(reference, def.month, def.day);
      const daysRemaining = daysBetween(reference, dueDate);
      return {
        id: def.id,
        label: def.label,
        dueDate: formatISODate(dueDate),
        daysRemaining,
        urgency: classifyUrgency(daysRemaining),
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining || a.id.localeCompare(b.id));
}
