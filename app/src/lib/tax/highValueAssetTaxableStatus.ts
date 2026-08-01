// ------------------------------------------------------------------
// 高額特定資産の取得による課税事業者強制期間シミュレーター（消費税法12条の4）
//
// 課税事業者（一般課税で申告している事業者）が、税抜き取得価額1,000万円以上の
// 「高額特定資産」を取得した場合、その取得の日の属する課税期間（取得期間）及び
// その後2つの課税期間（取得期間の初日から3年を経過する日の属する課税期間まで）
// においては、
//   - 事業者免税点制度（消費税法9条1項、基準期間の課税売上高が1,000万円以下でも
//     免税事業者になれる制度）は適用されない（消費税法12条の4第1項）
//   - 簡易課税制度（消費税法37条）の選択も制限される（同条3項3号等）
// という特例です。本モジュールは、この特例の「取得価額が1,000万円以上か」「該当
// する場合の強制期間はいつからいつまでか」という機械的な部分だけを判定します。
//
// このモジュールが対象外とする（=「要専門家確認」として扱う）主なケース:
//   - 自己建設高額特定資産（建設等に要した費用の累計額が1,000万円以上となった
//     場合の特例。取得時期・判定の起点が通常の購入と異なる）
//   - 高額特定資産に該当する棚卸資産についての調整措置（消費税法36条関連）
//   - 調整対象固定資産に係る仕入税額控除の調整（消費税法33条〜35条）
//   - 課税期間が1年に満たない事業年度（短期事業年度）がある場合の期間計算の調整
//   - 取得時に既に簡易課税制度の適用を受けていた場合等、個別の適用関係
//
// これは一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・
// 助言（税理士法上の税務相談）には該当しません。
// ------------------------------------------------------------------

/** 高額特定資産に該当するかどうかの、税抜き取得価額のしきい値（これ「以上」で該当） */
export const HIGH_VALUE_ASSET_PRICE_THRESHOLD = 10_000_000;

/** 強制される課税期間の数（取得期間そのもの＋その後2課税期間＝合計3課税期間） */
export const MANDATORY_TAXABLE_PERIOD_COUNT = 3;

/**
 * 課税期間（事業年度・確定申告期間）の開始日・終了日。
 * 日付はいずれも "YYYY-MM-DD" 形式のカレンダー日（ローカル日付、タイムゾーンなし）。
 */
export interface TaxPeriod {
  /** 課税期間の開始日（YYYY-MM-DD） */
  startDate: string;
  /** 課税期間の終了日（YYYY-MM-DD） */
  endDate: string;
  /** 画面表示用のラベル（例："第3期"「2026年分」）。任意 */
  label?: string;
}

/** 課税事業者期間中に行われた資産取得1件分の入力。 */
export interface AssetAcquisition {
  /** 資産の取得日（YYYY-MM-DD） */
  acquisitionDate: string;
  /** 取得価額（税抜き、円）。一の取引単位での金額を入力する想定 */
  taxExcludedPrice: number;
  /** 画面表示用の資産名・摘要。任意 */
  description?: string;
}

export interface HighValueAssetTaxableStatusInput {
  /**
   * 判定に必要な、連続した課税期間の一覧（開始日の前後関係は問わず、内部で
   * 開始日の昇順に並び替える）。取得日を含む課税期間から数えて、その後2課税期間
   * 分までのデータが揃っていないと、強制期間の全体を計算できない点に注意。
   */
  taxPeriods: TaxPeriod[];
  /** 課税事業者（一般課税）であった期間中に行われた資産取得の一覧 */
  acquisitions: AssetAcquisition[];
}

/** 資産取得1件ごとの評価結果。 */
export interface HighValueAssetAcquisitionEvaluation {
  acquisition: AssetAcquisition;
  /** 取得価額（税抜き）が1,000万円以上で、高額特定資産の取得に該当するか */
  meetsThreshold: boolean;
  /** 取得日が属すると特定できた課税期間。特定できない場合はnull */
  acquisitionPeriod: TaxPeriod | null;
  /**
   * この取得により強制される課税期間の一覧（取得期間＋その後2課税期間、最大3件）。
   * 該当しない場合、または取得期間を特定できない場合はnull。
   * taxPeriodsに取得期間より後のデータが不足している場合は、判明している分のみが入る
   * （その旨はnotesに記載される）。
   */
  mandatoryTaxablePeriods: TaxPeriod[] | null;
  /** 画面にそのまま表示できる説明・注記 */
  notes: string[];
}

export interface HighValueAssetTaxableStatusResult {
  /** 1件でも高額特定資産の取得（かつ強制期間を計算できたもの）があったか */
  hasHighValueAcquisition: boolean;
  /** 入力された資産取得すべてについての評価結果（入力順） */
  evaluations: HighValueAssetAcquisitionEvaluation[];
  /**
   * 該当する取得が複数ある場合を含め、重複を除いてまとめた強制課税期間の一覧
   * （開始日の昇順）。該当する取得が無い場合は空配列。
   */
  combinedMandatoryTaxablePeriods: TaxPeriod[];
  /**
   * 強制課税期間のうち、最も遅い終了日（この日までは免税事業者・簡易課税制度の
   * 選択ができない、という目安）。該当する取得が無い場合はnull。
   */
  latestMandatoryTaxableEndDate: string | null;
  disclaimer: string;
  assumptions: string[];
}

export const HIGH_VALUE_ASSET_DISCLAIMER =
  "この判定結果は、高額特定資産（税抜き取得価額1,000万円以上の資産）を取得した場合に、取得した課税期間及びその後2課税期間について事業者免税点制度・簡易課税制度の適用が制限される制度（消費税法12条の4）に関する一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。自己建設高額特定資産に関する特例、高額特定資産に該当する棚卸資産についての調整措置、調整対象固定資産に係る仕入税額の調整など、本ツールが考慮していない特例に該当する場合は、実際の判定結果が変わる可能性があります。最終的な判定・申告内容は、必ず税理士等の専門家にご確認ください。";

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertValidDateString(value: string, label: string): void {
  if (typeof value !== "string" || !DATE_STRING_PATTERN.test(value)) {
    throw new Error(`${label}はYYYY-MM-DD形式の日付で入力してください。`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDate =
    asDate.getUTCFullYear() === year && asDate.getUTCMonth() === month - 1 && asDate.getUTCDate() === day;
  if (!isRealCalendarDate) {
    throw new Error(`${label}に実在する日付を入力してください。`);
  }
}

function compareDateStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function periodKey(period: TaxPeriod): string {
  return `${period.startDate}_${period.endDate}`;
}

/**
 * 高額特定資産の取得（消費税法12条の4）による課税事業者強制期間を判定する。
 *
 * 各資産取得について、(1)税抜き取得価額が1,000万円以上かどうか、(2)該当する
 * 場合は取得日が属する課税期間をtaxPeriodsの中から特定し、その課税期間から
 * 数えて3課税期間分（取得期間＋その後2課税期間）を強制課税期間として算出する。
 * 複数の取得がある場合は、それぞれの強制期間を個別に算出したうえで、重複を
 * 除いた統合結果（combinedMandatoryTaxablePeriods）も返す。
 *
 * taxPeriodsに取得期間より後の課税期間データが不足している場合（例えば直近の
 * 課税期間しか入力されていない場合）は、判明している範囲のみを返し、その旨を
 * 各評価結果のnotesに記載する（＝計算不能ではなく、データ追加を促す形にする）。
 */
export function determineHighValueAssetTaxableStatus(
  input: HighValueAssetTaxableStatusInput
): HighValueAssetTaxableStatusResult {
  if (!Array.isArray(input.taxPeriods) || input.taxPeriods.length === 0) {
    throw new Error("課税期間（taxPeriods）を1件以上入力してください。");
  }
  if (!Array.isArray(input.acquisitions)) {
    throw new Error("資産取得の一覧（acquisitions）を配列で入力してください。");
  }

  const taxPeriods = [...input.taxPeriods]
    .map((period, index) => {
      assertValidDateString(period.startDate, `課税期間${index + 1}の開始日`);
      assertValidDateString(period.endDate, `課税期間${index + 1}の終了日`);
      if (period.startDate > period.endDate) {
        throw new Error(`課税期間${index + 1}は、開始日が終了日より後になっています。`);
      }
      return period;
    })
    .sort((a, b) => compareDateStrings(a.startDate, b.startDate));

  const evaluations: HighValueAssetAcquisitionEvaluation[] = input.acquisitions.map((acquisition, index) => {
    assertValidDateString(acquisition.acquisitionDate, `資産${index + 1}の取得日`);
    assertFiniteNonNegative(acquisition.taxExcludedPrice, `資産${index + 1}の取得価額（税抜き）`);

    const meetsThreshold = acquisition.taxExcludedPrice >= HIGH_VALUE_ASSET_PRICE_THRESHOLD;

    if (!meetsThreshold) {
      return {
        acquisition,
        meetsThreshold,
        acquisitionPeriod: null,
        mandatoryTaxablePeriods: null,
        notes: [
          `取得価額（税抜き、${acquisition.taxExcludedPrice.toLocaleString("ja-JP")}円）は1,000万円未満のため、高額特定資産の取得には該当しません。`,
        ],
      };
    }

    const periodIndex = taxPeriods.findIndex(
      (period) => acquisition.acquisitionDate >= period.startDate && acquisition.acquisitionDate <= period.endDate
    );

    if (periodIndex === -1) {
      return {
        acquisition,
        meetsThreshold,
        acquisitionPeriod: null,
        mandatoryTaxablePeriods: null,
        notes: [
          `取得価額（税抜き、${acquisition.taxExcludedPrice.toLocaleString("ja-JP")}円）が1,000万円以上のため高額特定資産の取得に該当しますが、取得日（${acquisition.acquisitionDate}）を含む課税期間がtaxPeriodsの中に見つからないため、強制課税期間を計算できません。取得日を含む課税期間をtaxPeriodsに追加してください。`,
        ],
      };
    }

    const acquisitionPeriod = taxPeriods[periodIndex];
    const mandatoryTaxablePeriods = taxPeriods.slice(periodIndex, periodIndex + MANDATORY_TAXABLE_PERIOD_COUNT);
    const notes: string[] = [
      `取得価額（税抜き、${acquisition.taxExcludedPrice.toLocaleString("ja-JP")}円）が1,000万円以上のため、高額特定資産の取得に該当します。取得した課税期間（${acquisitionPeriod.startDate}〜${acquisitionPeriod.endDate}）及びその後2課税期間は、消費税法12条の4により、事業者免税点制度・簡易課税制度の適用が制限されます（免税事業者になれず、簡易課税も選択できません）。`,
    ];

    if (mandatoryTaxablePeriods.length < MANDATORY_TAXABLE_PERIOD_COUNT) {
      notes.push(
        `taxPeriodsに、取得期間を含めて連続する${MANDATORY_TAXABLE_PERIOD_COUNT}課税期間分のデータが揃っていないため、判明している${mandatoryTaxablePeriods.length}課税期間分のみを算出しています。強制期間の全体を確認するには、取得期間より後の課税期間データを追加してください。`
      );
    }

    return {
      acquisition,
      meetsThreshold,
      acquisitionPeriod,
      mandatoryTaxablePeriods,
      notes,
    };
  });

  const combinedMap = new Map<string, TaxPeriod>();
  for (const evaluation of evaluations) {
    if (!evaluation.mandatoryTaxablePeriods) continue;
    for (const period of evaluation.mandatoryTaxablePeriods) {
      combinedMap.set(periodKey(period), period);
    }
  }
  const combinedMandatoryTaxablePeriods = Array.from(combinedMap.values()).sort((a, b) =>
    compareDateStrings(a.startDate, b.startDate)
  );

  const hasHighValueAcquisition = combinedMandatoryTaxablePeriods.length > 0;
  const latestMandatoryTaxableEndDate = hasHighValueAcquisition
    ? combinedMandatoryTaxablePeriods.reduce(
        (latest, period) => (period.endDate > latest ? period.endDate : latest),
        combinedMandatoryTaxablePeriods[0].endDate
      )
    : null;

  return {
    hasHighValueAcquisition,
    evaluations,
    combinedMandatoryTaxablePeriods,
    latestMandatoryTaxableEndDate,
    disclaimer: HIGH_VALUE_ASSET_DISCLAIMER,
    assumptions: [
      "「高額特定資産」とは、一の取引単位での税抜き取得価額が1,000万円以上の棚卸資産又は調整対象固定資産をいいます（消費税法12条の4、消費税法施行令25条の5）。本ツールは取得価額のみで判定し、資産の種類（棚卸資産か固定資産か）や用途は区別していません。",
      "強制される課税期間は、高額特定資産を取得した課税期間の初日から、その日以後3年を経過する日の属する課税期間までです。課税期間がすべて1年間で連続している標準的なケースでは、これは「取得期間＋その後2課税期間」の合計3課税期間に相当します。短期事業年度などtaxPeriodsの長さが不揃いな場合は、実際の強制期間が本ツールの算出結果と異なる可能性があります。",
      "本ツールは、入力された資産取得がいずれも課税事業者（簡易課税制度の適用を受けていない、いわゆる一般課税）であった課税期間中に行われたことを前提としています。免税事業者や簡易課税事業者であった期間中の取得には、この特例は適用されません。",
      "自己建設高額特定資産（建設等に要した費用の累計額が1,000万円以上となった場合の特例で、取得時期の判定が通常の購入と異なる）、高額特定資産に該当する棚卸資産についての調整措置、調整対象固定資産に係る仕入税額控除の調整など、個別の特例は本ツールの対象外です。",
    ],
  };
}
