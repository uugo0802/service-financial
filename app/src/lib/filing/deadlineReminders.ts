// 申告期限・タスクリマインダーのロジック層。
//
// 目的（docs/business-plan.md「切り替えコストとなる要素」）: 記帳・下書き生成だけでなく、
// 「いつまでに何をすべきか」を継続的に提示することで、申告シーズン以外もユーザーが
// 本サービスを開き続ける動機を作る。
//
// 重要（税理士法対応・要注意事項）: ここで計算する期限は、法令上の「原則」ルールを
// 機械的に日付計算した一般的な情報である。以下のような個別事情は反映していない。
//   - 国税庁・地方税共同機構が定める国民の祝日による前後移動
//     （土日への移動は簡易的に翌営業日へロールする実装だが、祝日は考慮していない）
//   - 災害等による申告期限の延長
//   - 法人税の「申告期限の延長の特例」（税務署への届出により最大1ヶ月延長できる制度）等、
//     個別の延長申請
// このモジュール・関連UIは、上記のような個別の延長相談には応じられない旨を必ず
// 一緒に表示すること（DEADLINE_GENERAL_INFO_NOTICE を参照）。正確な期限は国税庁・
// 地方税共同機構等の公式情報、または税理士等の専門家に確認するよう案内する。
//
// 日付はすべて "YYYY-MM-DD" 形式のISO日付文字列（IsoDate）で表す。タイムゾーンに依存する
// ローカルDateやDate.now()の罠を避けるため、内部計算は常にUTC基準の日数（epoch day）で行う。
// 「現在日時」に相当する基準日（asOf）は必ず呼び出し側が明示的な引数として渡す設計とし、
// このモジュールの中でDate.now()やnew Date()（引数なし）を呼ぶことはない。これによりテストで
// 固定の基準日を注入できる。

export type IsoDate = string;

export type FilingCategory =
  | "income-tax" // 個人事業主: 所得税確定申告
  | "consumption-tax" // 個人事業主（インボイス登録事業者）: 消費税確定申告
  | "corporate-tax" // マイクロ法人: 法人税・地方法人税の確定申告
  | "corporate-consumption-tax"; // マイクロ法人: 消費税の確定申告

export type ReminderStatus = "overdue" | "due-soon" | "upcoming";

export interface DeadlineTask {
  id: string;
  category: FilingCategory;
  title: string;
  description: string;
  /** この期限の根拠となる原則ルールの説明（UIの補足表示用） */
  basis: string;
  dueDate: IsoDate;
}

export interface DeadlineReminder extends DeadlineTask {
  status: ReminderStatus;
  /** 期限までの残り日数。0=期限当日、正=あと◯日、負=期限超過◯日 */
  daysRemaining: number;
}

/** この日数以内（当日を含む）を「まもなく期限」として扱う閾値 */
export const DUE_SOON_THRESHOLD_DAYS = 14;

export const DEADLINE_GENERAL_INFO_NOTICE =
  "表示している期限は、法令上の原則ルールに基づく一般的な日付計算です。国民の祝日による前後移動(土日のみ簡易的に翌営業日へ調整済み)、災害等による申告期限の延長、法人税の申告期限の延長の特例といった個別の事情は反映していません。個別の期限延長等のご相談には対応できませんので、正確な期限は国税庁・地方税共同機構等の公式情報でご確認いただくか、税理士等の専門家にご相談ください。";

// ---- 日付ユーティリティ（IsoDate文字列とUTC epoch dayのみを扱う） ----

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(date: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`invalid ISO date (expected YYYY-MM-DD): ${date}`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toEpochDay(date: IsoDate): number {
  const { y, m, d } = parseIsoDate(date);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function epochDayToIsoDate(epochDay: number): IsoDate {
  const dt = new Date(epochDay * 86_400_000);
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** 指定した年・月（1-12）の末日を返す */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0=日曜 ... 6=土曜 */
function dayOfWeek(date: IsoDate): number {
  const { y, m, d } = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(date: IsoDate, days: number): IsoDate {
  return epochDayToIsoDate(toEpochDay(date) + days);
}

/**
 * 月末を保ったまま指定月数を加算する。
 * このモジュールの用途では起点が常に「決算月の末日」であるため、常に月末保持のロジックで
 * 加算する（例: 2/29(閏年) + 2ヶ月 = 4/30、2/28(平年) + 2ヶ月 = 4/30）。
 */
function addMonthsKeepingEndOfMonth(date: IsoDate, months: number): IsoDate {
  const { y, m } = parseIsoDate(date);
  const total = y * 12 + (m - 1) + months;
  const targetY = Math.floor(total / 12);
  const targetM = (total % 12) + 1;
  return toIsoDate(targetY, targetM, lastDayOfMonth(targetY, targetM));
}

/**
 * 土日にあたる場合は翌週の月曜日にずらす。国民の祝日は考慮しない（DEADLINE_GENERAL_INFO_NOTICE参照）。
 */
function rollForwardIfWeekend(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date);
  if (dow === 6) return addDays(date, 2); // 土曜 -> 月曜
  if (dow === 0) return addDays(date, 1); // 日曜 -> 月曜
  return date;
}

function assertValidMonth(month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`fiscalYearEndMonth must be an integer from 1 to 12, got: ${month}`);
  }
}

function assertValidYear(label: string, year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`${label} must be a reasonable 4-digit year, got: ${year}`);
  }
}

// ---- 個人事業主モード ----

/**
 * 個人事業主の所得税確定申告期限（原則、対象年の翌年3/15。土日は翌営業日に調整）。
 * taxYear: 申告対象年（例: 2026年分なら2026）
 */
export function getIncomeTaxFilingDeadline(taxYear: number): IsoDate {
  assertValidYear("taxYear", taxYear);
  return rollForwardIfWeekend(toIsoDate(taxYear + 1, 3, 15));
}

/**
 * 個人事業主（インボイス登録事業者）の消費税確定申告期限（原則、対象年の翌年3/31。土日は翌営業日に調整）。
 */
export function getIndividualConsumptionTaxFilingDeadline(taxYear: number): IsoDate {
  assertValidYear("taxYear", taxYear);
  return rollForwardIfWeekend(toIsoDate(taxYear + 1, 3, 31));
}

export interface IndividualReminderInput {
  /** 申告対象年（例: 2026年分の確定申告なら2026） */
  taxYear: number;
  /** インボイス登録事業者かどうか（trueの場合のみ消費税申告タスクを含める） */
  isInvoiceRegistered: boolean;
}

export function getIndividualDeadlineTasks(input: IndividualReminderInput): DeadlineTask[] {
  assertValidYear("taxYear", input.taxYear);

  const tasks: DeadlineTask[] = [
    {
      id: `income-tax-${input.taxYear}`,
      category: "income-tax",
      title: `${input.taxYear}年分 所得税の確定申告`,
      description: `${input.taxYear}年1月1日〜12月31日の所得についての所得税確定申告・納税の期限です。`,
      basis: "原則、対象年の翌年3月15日（土日の場合は翌営業日）。",
      dueDate: getIncomeTaxFilingDeadline(input.taxYear),
    },
  ];

  if (input.isInvoiceRegistered) {
    tasks.push({
      id: `consumption-tax-${input.taxYear}`,
      category: "consumption-tax",
      title: `${input.taxYear}年分 消費税の確定申告`,
      description: `インボイス登録事業者として、${input.taxYear}年分の消費税確定申告・納税の期限です。`,
      basis: "原則、対象年の翌年3月31日（土日の場合は翌営業日）。",
      dueDate: getIndividualConsumptionTaxFilingDeadline(input.taxYear),
    });
  }

  return tasks;
}

// ---- マイクロ法人モード ----

/**
 * マイクロ法人の決算日（決算月の末日、原則）を返す。
 * fiscalYearEndMonth: 決算月（1-12）、fiscalYearEndCalendarYear: 決算日を含む西暦年
 */
export function getCorporateFiscalYearEndDate(fiscalYearEndMonth: number, fiscalYearEndCalendarYear: number): IsoDate {
  assertValidMonth(fiscalYearEndMonth);
  assertValidYear("fiscalYearEndCalendarYear", fiscalYearEndCalendarYear);
  return toIsoDate(
    fiscalYearEndCalendarYear,
    fiscalYearEndMonth,
    lastDayOfMonth(fiscalYearEndCalendarYear, fiscalYearEndMonth)
  );
}

/**
 * 法人税・地方法人税・消費税等の確定申告期限（原則、決算日の翌日から2ヶ月以内。土日は翌営業日に調整）。
 * 「決算日の翌日から2ヶ月以内」は、決算日が月末である限り「決算日の2ヶ月後の月末」と一致する。
 */
export function getCorporateFilingDeadline(fiscalYearEndDate: IsoDate): IsoDate {
  return rollForwardIfWeekend(addMonthsKeepingEndOfMonth(fiscalYearEndDate, 2));
}

export interface MicroCorporationReminderInput {
  /** 決算月（1-12） */
  fiscalYearEndMonth: number;
  /** 決算日を含む西暦年 */
  fiscalYearEndCalendarYear: number;
}

export function getMicroCorporationDeadlineTasks(input: MicroCorporationReminderInput): DeadlineTask[] {
  const fiscalYearEndDate = getCorporateFiscalYearEndDate(input.fiscalYearEndMonth, input.fiscalYearEndCalendarYear);
  const dueDate = getCorporateFilingDeadline(fiscalYearEndDate);

  return [
    {
      id: `corporate-tax-${fiscalYearEndDate}`,
      category: "corporate-tax",
      title: "法人税・地方法人税の確定申告",
      description: `決算日（${fiscalYearEndDate}）を基準とした、法人税および地方法人税の確定申告・納税の期限です。`,
      basis: "原則、決算日の翌日から2ヶ月以内（延長の特例の届出がある場合は別途延長あり）。",
      dueDate,
    },
    {
      id: `corporate-consumption-tax-${fiscalYearEndDate}`,
      category: "corporate-consumption-tax",
      title: "消費税の確定申告",
      description: `決算日（${fiscalYearEndDate}）を基準とした、消費税（課税事業者の場合）の確定申告・納税の期限です。`,
      basis: "原則、決算日の翌日から2ヶ月以内。",
      dueDate,
    },
  ];
}

// ---- 期限ステータスの判定 ----

/**
 * 基準日（asOf）から見た期限のステータスと残り日数を計算する。
 * daysRemaining が負の場合は期限超過（overdue）。
 */
export function getDeadlineReminder(task: DeadlineTask, asOf: IsoDate): DeadlineReminder {
  const daysRemaining = toEpochDay(task.dueDate) - toEpochDay(asOf);
  const status: ReminderStatus =
    daysRemaining < 0 ? "overdue" : daysRemaining <= DUE_SOON_THRESHOLD_DAYS ? "due-soon" : "upcoming";
  return { ...task, status, daysRemaining };
}

/** 複数タスクをステータス付きに変換し、期限が近い順（昇順）に並べ替える */
export function getDeadlineReminders(tasks: DeadlineTask[], asOf: IsoDate): DeadlineReminder[] {
  return tasks
    .map((task) => getDeadlineReminder(task, asOf))
    .sort((a, b) => toEpochDay(a.dueDate) - toEpochDay(b.dueDate));
}

/**
 * 「次にやるべきタスク」を1件返す。期限が最も近い（期限超過分も含め、日付が最も早い）ものを優先する。
 * タスクが空の場合はundefinedを返す。
 */
export function getNextDeadlineReminder(tasks: DeadlineTask[], asOf: IsoDate): DeadlineReminder | undefined {
  return getDeadlineReminders(tasks, asOf)[0];
}
