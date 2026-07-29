// ------------------------------------------------------------------
// 家事按分（家事関連費按分）の計算
//
// 自宅の一部を事業用に使用している場合、家賃・水道光熱費・通信費など
// 「家事関連費」（家事上と業務上の両方にまたがる支出）については、
// 事業使用割合に応じた金額のみを必要経費に算入できます（所得税基本通達45-2）。
//
// このモジュールは、あくまで「入力された按分基準・比率」に基づく機械的な
// 金額計算（総額 × 事業使用割合、円未満切り捨て）のみを行います。
// 何を「合理的な按分基準」とするか（床面積か使用時間か、比率はどの程度が
// 妥当か等）は事業の実態に応じた納税者ご自身（または税理士等の専門家）の
// 判断事項であり、このツールはその妥当性を判定・助言しません
// （税務代理・個別具体的な税務相談には該当しません）。
// ------------------------------------------------------------------

export const APPORTIONMENT_DISCLAIMER =
  "家事按分の基準（床面積・使用時間など）や比率が事業の実態に照らして合理的かどうかは、納税者ご自身（または税理士等の専門家）の判断事項です。このツールは入力された基準・比率に基づく機械的な計算結果を示すのみであり、税務代理・個別具体的な税務相談には該当しません。";

/** 按分基準。床面積按分（floorArea）／使用時間按分（time） */
export type ApportionmentBasis = "floorArea" | "time";

export interface FloorAreaBasisInput {
  basis: "floorArea";
  /** 事業使用部分の床面積（m²） */
  businessAreaSqm: number;
  /** 住居全体の床面積（m²） */
  totalAreaSqm: number;
}

export interface TimeBasisInput {
  basis: "time";
  /** 1週間あたりの事業使用時間（時間） */
  businessHoursPerWeek: number;
  /** 1週間の総時間。未指定の場合は24時間×7日＝168時間を使用 */
  totalHoursPerWeek?: number;
}

export type ApportionmentBasisInput = FloorAreaBasisInput | TimeBasisInput;

export interface ApportionmentInput {
  /** 按分対象の家事関連費の総額（円）。例：家賃・水道光熱費・通信費 等 */
  totalAmount: number;
  basisInput: ApportionmentBasisInput;
}

export interface ApportionmentResult {
  /** 事業使用割合（%）。0〜100の範囲 */
  businessUseRatioPercent: number;
  /** 必要経費となる金額（円未満切り捨て） */
  deductibleAmount: number;
  /** 按分基準の説明（画面表示用） */
  basisDescription: string;
  disclaimer: string;
}

/** 1週間の総時間（24時間×7日）。時間按分で総時間が未指定の場合の既定値 */
export const DEFAULT_TOTAL_HOURS_PER_WEEK = 24 * 7;

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

function assertRatioPercentInRange(ratioPercent: number): void {
  if (!Number.isFinite(ratioPercent)) {
    throw new Error("事業使用割合は数値で入力してください。");
  }
  if (ratioPercent < 0 || ratioPercent > 100) {
    throw new Error("事業使用割合は0%〜100%の範囲で入力してください。");
  }
}

/** 按分対象の総額に事業使用割合（%）を乗じ、円未満を切り捨てて必要経費額を求める */
function truncateToYen(totalAmount: number, ratioPercent: number): number {
  return Math.floor((totalAmount * ratioPercent) / 100);
}

/**
 * 按分基準の入力（床面積 or 使用時間）から事業使用割合（%）を算出する。
 * 入力値が不正（負数・NaN・総量が0以下・事業使用分が総量を超える等）の場合は例外を投げる。
 */
function resolveBusinessUseRatioPercent(basisInput: ApportionmentBasisInput): {
  ratioPercent: number;
  description: string;
} {
  if (basisInput.basis === "floorArea") {
    const { businessAreaSqm, totalAreaSqm } = basisInput;
    assertFiniteNonNegative(businessAreaSqm, "事業使用床面積");
    assertFiniteNonNegative(totalAreaSqm, "総床面積");
    if (totalAreaSqm <= 0) {
      throw new Error("総床面積は0より大きい数値で入力してください。");
    }
    if (businessAreaSqm > totalAreaSqm) {
      throw new Error("事業使用床面積は総床面積を超えることはできません。");
    }

    const ratioPercent = (businessAreaSqm / totalAreaSqm) * 100;
    return {
      ratioPercent,
      description: `床面積按分：事業使用 ${businessAreaSqm}m² ／ 総床面積 ${totalAreaSqm}m²`,
    };
  }

  const { businessHoursPerWeek } = basisInput;
  const totalHoursPerWeek = basisInput.totalHoursPerWeek ?? DEFAULT_TOTAL_HOURS_PER_WEEK;
  assertFiniteNonNegative(businessHoursPerWeek, "事業使用時間");
  assertFiniteNonNegative(totalHoursPerWeek, "総時間");
  if (totalHoursPerWeek <= 0) {
    throw new Error("総時間は0より大きい数値で入力してください。");
  }
  if (businessHoursPerWeek > totalHoursPerWeek) {
    throw new Error("事業使用時間は総時間を超えることはできません。");
  }

  const ratioPercent = (businessHoursPerWeek / totalHoursPerWeek) * 100;
  return {
    ratioPercent,
    description: `使用時間按分：週あたり事業使用 ${businessHoursPerWeek}時間 ／ 総時間 ${totalHoursPerWeek}時間`,
  };
}

/**
 * 家事関連費の総額と按分基準（床面積 or 使用時間）から、必要経費となる金額を計算する。
 *
 * 円未満は切り捨て（他の税額シミュレーション機能と同様、円未満切り捨ての端数処理に統一）。
 * 事業使用割合は0%〜100%の範囲であることを検証し、範囲外・NaNの場合は例外を投げる。
 */
export function calculateApportionment(input: ApportionmentInput): ApportionmentResult {
  const { totalAmount, basisInput } = input;
  assertFiniteNonNegative(totalAmount, "総額");

  const { ratioPercent, description } = resolveBusinessUseRatioPercent(basisInput);
  assertRatioPercentInRange(ratioPercent);

  return {
    businessUseRatioPercent: ratioPercent,
    deductibleAmount: truncateToYen(totalAmount, ratioPercent),
    basisDescription: description,
    disclaimer: APPORTIONMENT_DISCLAIMER,
  };
}

/**
 * 事業使用割合（%）を直接指定して按分計算するヘルパー。
 * 既に比率（床面積や使用時間から算出済み、あるいは他の合理的な基準による比率）が
 * 分かっている場合に使用する。0〜100の範囲外・NaNの場合は例外を投げる。
 */
export function calculateApportionmentFromRatio(totalAmount: number, ratioPercent: number): ApportionmentResult {
  assertFiniteNonNegative(totalAmount, "総額");
  assertRatioPercentInRange(ratioPercent);

  return {
    businessUseRatioPercent: ratioPercent,
    deductibleAmount: truncateToYen(totalAmount, ratioPercent),
    basisDescription: `指定割合：${ratioPercent}%`,
    disclaimer: APPORTIONMENT_DISCLAIMER,
  };
}
