// ------------------------------------------------------------------
// 免責: これは個人事業主（フリーランス）向けの所得税の「予定納税」の要否・期日・概算額を
// 計算する参考ツールです。個別の税務相談・助言ではなく、正式な税額計算でもありません。
// 実際の要否・金額は必ず税務署から送付される「予定納税額の通知書」、または税理士等の
// 専門家にご確認ください。
//
// マイクロ法人（事業年度を持つ法人）の中間申告・中間納付とは別の制度です。
// 法人向けの計算は ./interimPayment.ts を参照してください（このファイルとは無関係・独立です）。
// ------------------------------------------------------------------

export type EstimatedTaxUrgency = "urgent" | "warning" | "normal";

// 所得税法104条: 予定納税基準額（≒前年の確定申告に基づく所得税額 - 源泉徴収税額）が
// この金額を超える場合に、予定納税の義務が生じる。
// （中間申告・中間納付の判定 interimPayment.ts と同様、ちょうどこの金額の場合は
// 「超える」に該当しないため対象外として扱う）
const OBLIGATION_THRESHOLD = 150_000;

const URGENT_THRESHOLD_DAYS = 14;
const WARNING_THRESHOLD_DAYS = 45;

export interface EstimatedTaxInstallment {
  id: "first" | "second";
  label: string;
  /** ISO形式 "YYYY-MM-DD"（納付期間の初日） */
  periodStart: string;
  /** ISO形式 "YYYY-MM-DD"（納付期間の末日 = 納期限） */
  periodEnd: string;
  /** 円。予定納税基準額の3分の1相当額（1,000円未満切り捨て） */
  amount: number;
  daysRemaining: number;
  urgency: EstimatedTaxUrgency;
}

export interface IndividualEstimatedTaxResult {
  /** 予定納税の対象年（例: 2026 なら「2026年分」の予定納税） */
  taxYear: number;
  /** 予定納税基準額（前年の確定申告に基づく所得税額 - 前年の源泉徴収税額。マイナスは0に補正） */
  obligationBaseAmount: number;
  /** 予定納税基準額が計算に使われた際の元の入力値（参考表示用） */
  priorYearConfirmedIncomeTax: number;
  priorYearWithholdingTax: number;
  required: boolean;
  thresholdAmount: number;
  /** 対象外の場合は空配列 */
  installments: EstimatedTaxInstallment[];
  /** 第1期・第2期の合計額（対象外の場合は0） */
  totalInstallmentAmount: number;
  assumptions: string[];
}

export interface GetIndividualEstimatedTaxInput {
  /** 前年分の確定申告に基づく所得税額（復興特別所得税を含めるかは運用次第だが、本ツールでは
   * 入力された金額をそのまま予定納税基準額の計算に用いる） */
  priorYearConfirmedIncomeTax: number;
  /** 前年分の源泉徴収税額 */
  priorYearWithholdingTax: number;
  /** 予定納税の対象年（例: 2026 なら 2026年7/11月に納付する「2026年分」の予定納税） */
  taxYear: number;
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

function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function classifyUrgency(daysRemaining: number): EstimatedTaxUrgency {
  if (daysRemaining <= URGENT_THRESHOLD_DAYS) return "urgent";
  if (daysRemaining <= WARNING_THRESHOLD_DAYS) return "warning";
  return "normal";
}

/**
 * 予定納税基準額の3分の1相当額を計算する。
 * 国税は1,000円未満の端数を切り捨てるのが原則のため（他のlib/tax/*.tsの課税所得金額の
 * 端数処理 [estimate.ts] と同じ考え方）、Math.round ではなく Math.floor を1,000円単位で用いる。
 */
function computeInstallmentAmount(obligationBaseAmount: number): number {
  return Math.floor(obligationBaseAmount / 3 / 1000) * 1000;
}

function buildInstallment(
  id: "first" | "second",
  label: string,
  period: { start: CalendarDate; end: CalendarDate },
  amount: number,
  reference: Date
): EstimatedTaxInstallment {
  const periodEndDate = makeUTCDate(period.end);
  const daysRemaining = daysBetween(reference, periodEndDate);
  return {
    id,
    label,
    periodStart: formatISODate(makeUTCDate(period.start)),
    periodEnd: formatISODate(periodEndDate),
    amount,
    daysRemaining,
    urgency: classifyUrgency(daysRemaining),
  };
}

/**
 * 個人事業主（フリーランス）向け所得税の予定納税の要否・期日・概算額を計算する。
 *
 * 制度の概要（所得税法104条・105条）:
 * - 予定納税基準額（原則として前年の確定申告に基づく所得税額から源泉徴収税額を差し引いた金額）が
 *   15万円を超える場合、その年の第1期（7/1〜7/31）・第2期（11/1〜11/30）に、それぞれ
 *   予定納税基準額の3分の1に相当する金額を予定納税として納付する義務が生じる。
 * - 納め過ぎ・不足分は、翌年3月の確定申告（本来の確定申告）で精算される
 *   （予定納税額は最終的な所得税額の前払いであり、それ自体が申告ではない）。
 * - このツールは「前年の確定申告に基づく所得税額」と「前年の源泉徴収税額」からの機械的な概算にすぎない。
 *   実際には税務署が計算した「予定納税基準額」に基づき、毎年6月頃に「予定納税額の通知書」が
 *   送付される。通知書の金額とこのツールの概算額が異なる場合は、通知書の金額が優先される。
 */
export function getIndividualEstimatedTaxObligations(
  input: GetIndividualEstimatedTaxInput
): IndividualEstimatedTaxResult {
  const priorYearConfirmedIncomeTax = Math.max(0, input.priorYearConfirmedIncomeTax);
  const priorYearWithholdingTax = Math.max(0, input.priorYearWithholdingTax);
  const obligationBaseAmount = Math.max(0, priorYearConfirmedIncomeTax - priorYearWithholdingTax);

  const reference = makeUTCDate(toCalendarDate(input.referenceDate ?? new Date()));

  const required = obligationBaseAmount > OBLIGATION_THRESHOLD;

  const installments: EstimatedTaxInstallment[] = [];
  if (required) {
    const amount = computeInstallmentAmount(obligationBaseAmount);
    installments.push(
      buildInstallment(
        "first",
        "予定納税 第1期分",
        { start: { year: input.taxYear, month: 7, day: 1 }, end: { year: input.taxYear, month: 7, day: 31 } },
        amount,
        reference
      ),
      buildInstallment(
        "second",
        "予定納税 第2期分",
        { start: { year: input.taxYear, month: 11, day: 1 }, end: { year: input.taxYear, month: 11, day: 30 } },
        amount,
        reference
      )
    );
  }

  const totalInstallmentAmount = installments.reduce((sum, i) => sum + i.amount, 0);

  return {
    taxYear: input.taxYear,
    obligationBaseAmount,
    priorYearConfirmedIncomeTax,
    priorYearWithholdingTax,
    required,
    thresholdAmount: OBLIGATION_THRESHOLD,
    installments,
    totalInstallmentAmount,
    assumptions: [
      "予定納税基準額は「前年の確定申告に基づく所得税額 − 前年の源泉徴収税額」として概算しています（所得税法104条）。実際の予定納税基準額は、譲渡所得・一時所得など一部の所得を除いて税務署が計算するため、この概算と一致しない場合があります。",
      "予定納税基準額がちょうど15万円の場合は「超える」に該当しないため対象外としています（15万円を超える場合に義務が生じます）。",
      "第1期分・第2期分は、それぞれ予定納税基準額の3分の1相当額（1,000円未満切り捨て）として概算しています。実際の金額は、毎年6月頃に税務署から送付される「予定納税額の通知書」の金額が優先されます。",
      "予定納税額は最終的な所得税額の前払いです。過不足は翌年3月の確定申告（本来の確定申告）で精算されます。予定納税そのものは確定申告ではありません。",
      "その年の所得が前年より大幅に減少する見込みなどの場合、税務署に「予定納税額の減額申請書」を提出することで、納付額を減らせる場合があります（提出期限は第1期・第2期分あわせてなら7月1日〜7月15日ごろ、第2期分のみなら11月1日〜11月15日ごろが目安です）。本ツールは減額申請の要否判定・金額計算には対応していません。制度の詳細は国税庁ウェブサイトまたは税務署にご確認ください。",
      "期日は7月31日・11月30日という暦上の原則的な期限です。土日祝日により実際の期限は前後する場合があります。",
      "これは一般的な制度に基づく概算であり、個別の税務相談・助言ではありません。実際の要否・金額・期日は、必ず税務署から送付される通知書、または国税庁・税理士等の専門家にご確認ください。",
    ],
  };
}
