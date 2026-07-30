// ------------------------------------------------------------------
// 免責: これは法人（事業年度を持つマイクロ法人を想定）向けの、法人税・消費税の
// 中間申告・中間納付の要否・期日・概算額を計算する参考ツールです。個別の税務相談・
// 助言ではなく、正式な税額計算でもありません。実際の要否・金額は必ず税務署から
// 送付される「予定申告のお知らせ」「納付書」、または税理士等の専門家にご確認ください。
// 個人事業主の消費税中間申告（暦年ベースの別ルール）には対応していません。
// ------------------------------------------------------------------

export type InterimObligationKind = "corporateTax" | "consumptionTax";

export type InterimUrgency = "urgent" | "warning" | "normal";

// 法人税: 前期確定法人税額がこの金額を超える場合に中間申告・中間納付が必要
// （超えない場合は不要。ちょうど20万円は「超える」に該当しないため不要）。
const CORPORATE_TAX_INTERIM_THRESHOLD = 200_000;

// 消費税: 前期確定消費税額（地方消費税を除く国税部分）がこの金額を超えると
// 中間申告・中間納付が必要になる最初の区分（年1回）。
const CONSUMPTION_TAX_ANNUAL_INTERIM_THRESHOLD = 480_000;

// 消費税: この金額を超えると、年1回ではなく年3回（〜4,800万円）・年11回（4,800万円超）の
// より頻繁な中間納付区分になる。本パスではこれらの区分の期日・金額計算には対応していない。
const CONSUMPTION_TAX_ANNUAL_INTERIM_UPPER_BOUND = 4_000_000;

const URGENT_THRESHOLD_DAYS = 14;
const WARNING_THRESHOLD_DAYS = 45;

export interface CorporateTaxInterimSummary {
  required: boolean;
  thresholdAmount: number;
  priorYearCorporateTax: number;
}

export type ConsumptionTaxInterimTier = "none" | "annual" | "moreFrequent";

export interface ConsumptionTaxInterimSummary {
  required: boolean;
  tier: ConsumptionTaxInterimTier;
  annualThresholdAmount: number;
  annualUpperBoundAmount: number;
  priorYearConsumptionTax: number;
}

export interface InterimPaymentObligation {
  id: string;
  kind: InterimObligationKind;
  label: string;
  /** ISO形式 "YYYY-MM-DD"。needsManualReviewがtrueの場合はnull（本ツールでは期日を計算していない） */
  dueDate: string | null;
  daysRemaining: number | null;
  urgency: InterimUrgency | null;
  /** 円。needsManualReviewがtrueの場合はnull（本ツールでは金額を計算していない） */
  estimatedAmount: number | null;
  /** trueの場合、消費税の年3回・年11回区分など、本ツールが計算対象としていない区分に該当する */
  needsManualReview: boolean;
  note: string;
}

export interface InterimPaymentResult {
  fiscalYearStartDate: string;
  corporateTax: CorporateTaxInterimSummary;
  consumptionTax: ConsumptionTaxInterimSummary;
  /** 実際に対応が必要な項目のみを期日順に並べた一覧（不要な項目は含まない） */
  obligations: InterimPaymentObligation[];
  assumptions: string[];
}

export interface GetInterimPaymentObligationsInput {
  /** 前期（直前の事業年度）確定法人税額。国税の法人税額のみを想定（地方法人税は含まない） */
  priorYearCorporateTax: number;
  /** 前期確定消費税額。国税部分のみを想定（地方消費税額を除く） */
  priorYearConsumptionTax: number;
  /** 当期（今期）の事業年度開始日 */
  fiscalYearStartDate: Date | string;
  /** 残日数・緊急度計算の基準日。省略時は現在日時 */
  referenceDate?: Date | string;
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
 * カレンダー日付にnか月を加算する。加算後の月に加算前の「日」が存在しない場合
 * （例: 1/31 + 1か月 → 2月31日は存在しない）は、その月の末日に丸める。
 */
function addMonthsClamped(date: CalendarDate, monthsToAdd: number): CalendarDate {
  const totalMonths = (date.month - 1) + monthsToAdd;
  const year = date.year + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(date.day, lastDayOfMonth(year, month));
  return { year, month, day };
}

function subtractOneDay(date: CalendarDate): CalendarDate {
  const utc = makeUTCDate(date);
  const prev = new Date(utc.getTime() - MS_PER_DAY);
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate() };
}

/**
 * 法人税・消費税ともに共通の中間申告期限の考え方（法人税法71条・消費税法42条）:
 * 「事業年度（課税期間）開始の日以後6か月を経過した日から2か月以内」。
 * = 開始日+6か月の地点から、さらに2か月後の前日が期限日となる。
 * （例: 4/1開始の事業年度 → 6か月経過日=10/1 → 期限=11/30）
 * 事業年度開始日が月初でない場合も同じロジックで計算されるが、実務上は
 * 月初開始（4/1決算法人など）が大多数のため、それ以外は参考値として扱うこと。
 */
function computeInterimDueDate(fiscalYearStart: CalendarDate): CalendarDate {
  const sixMonthPoint = addMonthsClamped(fiscalYearStart, 6);
  const twoMonthsLater = addMonthsClamped(sixMonthPoint, 2);
  return subtractOneDay(twoMonthsLater);
}

function classifyUrgency(daysRemaining: number): InterimUrgency {
  if (daysRemaining <= URGENT_THRESHOLD_DAYS) return "urgent";
  if (daysRemaining <= WARNING_THRESHOLD_DAYS) return "warning";
  return "normal";
}

/**
 * 法人税・消費税の中間申告・中間納付の要否・期日・概算額を計算する。
 * あくまで一般的な制度（暦・金額のしきい値）に基づく参考値であり、個別の税務相談ではない。
 */
export function getInterimPaymentObligations(input: GetInterimPaymentObligationsInput): InterimPaymentResult {
  const priorYearCorporateTax = Math.max(0, input.priorYearCorporateTax);
  const priorYearConsumptionTax = Math.max(0, input.priorYearConsumptionTax);

  const fiscalYearStartCalendar = toCalendarDate(input.fiscalYearStartDate);
  const fiscalYearStart = makeUTCDate(fiscalYearStartCalendar);
  const reference = makeUTCDate(toCalendarDate(input.referenceDate ?? new Date()));

  const dueDateCalendar = computeInterimDueDate(fiscalYearStartCalendar);
  const dueDate = makeUTCDate(dueDateCalendar);
  const dueDateIso = formatISODate(dueDate);
  const daysRemaining = daysBetween(reference, dueDate);
  const urgency = classifyUrgency(daysRemaining);

  // --- 法人税 ---
  const corporateTaxRequired = priorYearCorporateTax > CORPORATE_TAX_INTERIM_THRESHOLD;
  const corporateTax: CorporateTaxInterimSummary = {
    required: corporateTaxRequired,
    thresholdAmount: CORPORATE_TAX_INTERIM_THRESHOLD,
    priorYearCorporateTax,
  };

  // --- 消費税 ---
  let consumptionTaxTier: ConsumptionTaxInterimTier = "none";
  if (priorYearConsumptionTax > CONSUMPTION_TAX_ANNUAL_INTERIM_UPPER_BOUND) {
    consumptionTaxTier = "moreFrequent";
  } else if (priorYearConsumptionTax > CONSUMPTION_TAX_ANNUAL_INTERIM_THRESHOLD) {
    consumptionTaxTier = "annual";
  }
  const consumptionTax: ConsumptionTaxInterimSummary = {
    required: consumptionTaxTier !== "none",
    tier: consumptionTaxTier,
    annualThresholdAmount: CONSUMPTION_TAX_ANNUAL_INTERIM_THRESHOLD,
    annualUpperBoundAmount: CONSUMPTION_TAX_ANNUAL_INTERIM_UPPER_BOUND,
    priorYearConsumptionTax,
  };

  const obligations: InterimPaymentObligation[] = [];

  if (corporateTaxRequired) {
    // 簡便化: 中間納付額 = 前期確定法人税額 × (6か月 ÷ 前期の月数)。
    // 前期の事業年度が12か月（短縮事業年度でない）だったと仮定し、6/12=1/2として計算する
    // 「予定申告」方式の概算。中間期の実績に基づき申告する「仮決算による中間申告」は未対応。
    const estimatedAmount = Math.floor(priorYearCorporateTax / 2);
    obligations.push({
      id: "corporate-tax-interim",
      kind: "corporateTax",
      label: "法人税・地方法人税の中間申告・中間納付（概算）",
      dueDate: dueDateIso,
      daysRemaining,
      urgency,
      estimatedAmount,
      needsManualReview: false,
      note: "前期確定法人税額の1/2を予定申告額の概算として表示しています（前期が12か月の事業年度であることを前提）。",
    });
  }

  if (consumptionTaxTier === "annual") {
    // 消費税も法人税と同じ考え方（前期確定税額 × 6/12 = 1/2）で概算する。
    const estimatedAmount = Math.floor(priorYearConsumptionTax / 2);
    obligations.push({
      id: "consumption-tax-interim",
      kind: "consumptionTax",
      label: "消費税・地方消費税の中間申告・中間納付（年1回・概算）",
      dueDate: dueDateIso,
      daysRemaining,
      urgency,
      estimatedAmount,
      needsManualReview: false,
      note: "前期確定消費税額（国税部分）の1/2を年1回区分の中間納付額の概算として表示しています。地方消費税額の按分は含みません。",
    });
  } else if (consumptionTaxTier === "moreFrequent") {
    obligations.push({
      id: "consumption-tax-interim",
      kind: "consumptionTax",
      label: "消費税・地方消費税の中間申告・中間納付（年3回または年11回・要確認）",
      dueDate: null,
      daysRemaining: null,
      urgency: null,
      estimatedAmount: null,
      needsManualReview: true,
      note: "前期確定消費税額が400万円を超えているため、年1回ではなく年3回（400万円超）または年11回（4,800万円超）の、より頻繁な中間納付区分に該当します。本ツールはこの区分の期日・金額を計算していません。税務署からの通知または税理士等にご確認ください。",
    });
  }

  obligations.sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return {
    fiscalYearStartDate: formatISODate(fiscalYearStart),
    corporateTax,
    consumptionTax,
    obligations,
    assumptions: [
      "法人税の中間申告・中間納付は、前期確定法人税額が20万円を超える場合に必要というルールに基づく判定です。地方法人税の中間納付は法人税と同時に行われますが、金額はこの概算に含めていません。",
      "中間納付額（法人税・消費税とも）は、前期の事業年度が12か月であることを前提に、前期確定税額の1/2として概算しています（「予定申告」方式）。中間期の実績に基づいて申告する「仮決算による中間申告」を選択することも可能ですが、本ツールは仮決算方式には対応していません。",
      "消費税の中間納付は、前期確定消費税額（地方消費税を除く国税部分）が48万円超400万円以下の「年1回」区分のみ計算対象としています。400万円超（年3回）・4,800万円超（年11回）の区分に該当する場合は、より頻繁な中間納付が必要ですが、本ツールでは金額・期日を計算していません。",
      "地方消費税額の按分計算は含んでいません（消費税の国税部分のみを前提とした概算です）。",
      "期日は「事業年度開始日以後6か月を経過した日から2か月以内」という暦上の原則的な期限です。土日祝日により実際の期限は前後する場合があります。",
      "本機能は法人（事業年度を持つ法人）向けです。個人事業主の消費税中間申告（暦年ベースの別ルール）には対応していません。",
      "これは一般的な制度に基づく概算であり、個別の税務相談・助言ではありません。実際の中間納付の要否・金額は、税務署から送付される予定申告に関する通知、または税理士等の専門家に必ずご確認ください。",
    ],
  };
}
