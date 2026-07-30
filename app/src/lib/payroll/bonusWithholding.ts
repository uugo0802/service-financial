// ------------------------------------------------------------------
// 免責: これはマイクロ法人の一人代表（役員）が自身に支払う賞与（ボーナス）に
// ついて、給与所得の源泉徴収税額の「目安」を機械的に計算する概算シミュレーションです。
//
// 国税庁が公表する「賞与に対する源泉徴収税額の算出率の表」は、実際には
//   - 甲欄（扶養控除等申告書を提出している場合）は「前月の給与等の金額（社会保険料等
//     控除後）」を数十行に区分し、
//   - さらに扶養親族等の数（0人〜7人、8人以上は別途加算）ごとに列を分けたうえで、
//   - 各セルに「その月の賞与額（社会保険料等控除後）に乗じる率（%）」を定めた
// 非常に細かい早見表であり、withholding.ts（月額表の近似）とは異なり
// 「税額 = 賞与の課税ベース × 率」という乗率のみの式（控除額を差し引かない）である
// 点が特徴です。
//
// このモジュールはその表を丸ごと埋め込む代わりに、
//   1) 前月の給与等の金額（社会保険料等控除後）から、扶養親族等の数に応じた
//      概算控除額（withholding.tsと同じPER_DEPENDENT_MONTHLY_DEDUCTIONの考え方）を
//      差し引き、
//   2) その調整後の前月給与額を、withholding.tsの月額表近似で使っている速算表の
//      区分（5.105%・10.21%・20.42%・30.63%・40.84%・45.945%）に当てはめて
//      「前月の給与水準に応じた税率」を決定し、
//   3) その税率を賞与の課税ベース（賞与額 − 賞与にかかる社会保険料等）に
//      そのまま乗じる（控除額は差し引かない、実際の算出率表と同じ「乗率のみ」の構造）
// という「ブラケット近似式」で概算値を算出します。
//
// 実際の算出率表の行区分（前月給与の細かい金額幅）とは異なる区分を用いているため、
// 実額とは数百円〜数千円程度、場合によってはそれ以上のずれが生じ得る概算値です。
// 正式な源泉徴収額の算出には必ず国税庁公表の最新の「賞与に対する源泉徴収税額の
// 算出率の表」を参照してください（https://www.nta.go.jp/ 「源泉徴収税額表」で検索）。
//
// また、以下のケースは国税庁の実際の取扱いでは「算出率の表」とは別の特別な
// 計算方法（前月の給与がない場合の計算方法、前月の給与の10倍を超える賞与の
// 計算方法など）が定められていますが、本モジュールはそれらの特別な計算方法を
// 実装していません（通常のケースと同じ近似式をそのまま適用し、その旨を
// assumptionsに警告として含めます）。該当するケースでは必ず国税庁公表の資料を
// ご確認ください。
//
// このツールは税額計算の下書き・参考値を示すのみであり、税理士法上の
// 税務代理・税務書類の作成・個別具体的な税務相談には該当しません。
// ------------------------------------------------------------------

/**
 * 復興特別所得税について（withholding.tsと同じ扱い）:
 * 賞与に対する源泉徴収税額表（算出率の表）の税率にも、あらかじめ復興特別所得税
 * （所得税額×2.1%）が織り込まれています。本モジュールが使用する税率
 * （5.105%等）もすでに復興特別所得税込みの値であり、withholdingTaxに対して
 * 別途2.1%を上乗せする必要はありません（二重計上防止）。
 */
const RECONSTRUCTION_SURTAX_NOTE =
  "賞与に対する源泉徴収税額表（算出率の表）の税率にはあらかじめ復興特別所得税（所得税額×2.1%）が織り込まれているため、本ツールが表示する源泉徴収税額に復興特別所得税を別途上乗せする必要はありません（二重計上防止のため、本ツールの税率も復興特別所得税込みの数値を使用しています）";

/**
 * 扶養親族等1人あたりの概算控除額（月額）。withholding.tsのPER_DEPENDENT_MONTHLY_DEDUCTIONと
 * 同じ近似値を用い、前月の給与等の金額から扶養親族等の数に応じた金額を差し引いたうえで
 * 税率区分（下記BONUS_RATE_BRACKETS）を判定します。
 */
const PER_DEPENDENT_MONTHLY_DEDUCTION = 32_000;

/** 甲欄で賞与の源泉徴収税率が発生し始める、前月の給与等の金額（社会保険料等控除後・扶養調整後）のおおよその下限 */
const MIN_TAXABLE_PREVIOUS_MONTH_BASE = 68_000;

interface BonusRateBracket {
  /** この金額以下の「調整後・前月の給与等の金額」に適用される税率区分の上限（円） */
  upTo: number;
  /** 賞与の課税ベースに乗じる税率（%）。復興特別所得税を織り込み済み */
  rate: number;
}

// withholding.ts の月額表近似で用いている速算式の税率（5.105%・10.21%・20.42%・
// 30.63%・40.84%・45.945%）を流用し、「前月の給与等の金額（調整後）」の水準に応じて
// 賞与に適用する税率を決定する近似ブラケット。実際の算出率表のように控除額を
// 差し引く速算式ではなく、決定した税率を賞与の課税ベースにそのまま乗じる
// （実際の算出率表と同じ「乗率のみ」の構造）。
const BONUS_RATE_BRACKETS: BonusRateBracket[] = [
  { upTo: MIN_TAXABLE_PREVIOUS_MONTH_BASE, rate: 0 },
  { upTo: 300_000, rate: 5.105 },
  { upTo: 550_000, rate: 10.21 },
  { upTo: 1_000_000, rate: 20.42 },
  { upTo: 2_000_000, rate: 30.63 },
  { upTo: 3_500_000, rate: 40.84 },
  { upTo: Infinity, rate: 45.945 },
];

/**
 * 賞与額が前月の給与等の金額の何倍を超えると、国税庁の実際の取扱いでは
 * 「前月の給与の10倍を超える場合の計算方法」という別の特別な計算方法が
 * 適用されるかの目安（本モジュールは未実装。警告表示のためだけに使用）。
 */
const HIGH_RATIO_WARNING_MULTIPLE = 10;

export interface BonusWithholdingInput {
  /** 賞与（ボーナス）の総支給額（円） */
  bonusGrossAmount: number;
  /** その賞与から控除する健康保険・厚生年金保険料等（社会保険料）の合計額（円） */
  bonusInsurancePremium: number;
  /** 前月の給与等の金額（社会保険料等控除後、円）。算出率の表の行を決定する基準額 */
  previousMonthSalaryAfterInsurance: number;
  /** 扶養親族等の数（甲欄。0以上の整数） */
  dependentCount: number;
}

export interface BonusWithholdingResult {
  bonusGrossAmount: number;
  bonusInsurancePremium: number;
  /** 賞与の社会保険料等控除後の金額（課税ベース） */
  bonusTaxableBase: number;
  previousMonthSalaryAfterInsurance: number;
  dependentCount: number;
  /** 扶養親族等の数に応じて前月の給与等の金額から差し引いた概算控除額 */
  dependentDeductionApplied: number;
  /** 調整後の前月給与額から決定した、賞与に適用する税率（%） */
  appliedRatePercent: number;
  /** 源泉徴収税額（賞与、円未満切り捨て）。復興特別所得税を織り込み済みで、別途加算はしない */
  withholdingTax: number;
  /** 差引支給額の概算（賞与総支給額 - 社会保険料 - 源泉徴収税額） */
  netPay: number;
  assumptions: string[];
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/** 調整後の前月給与額から、賞与に適用する税率（%）を決定する */
function resolveBonusRatePercent(adjustedPreviousMonthBase: number): number {
  if (adjustedPreviousMonthBase <= 0) return 0;
  const bracket = BONUS_RATE_BRACKETS.find((b) => adjustedPreviousMonthBase <= b.upTo)!;
  return bracket.rate;
}

/**
 * 賞与（ボーナス）の総支給額から、給与所得の源泉徴収税額（賞与に対する源泉徴収税額表・
 * 甲欄）の概算値を計算する。
 *
 * 一人社長のマイクロ法人が自分自身に賞与を支払う場合も、通常の役員報酬・給与と同様に
 * 会社側に源泉徴収・納付義務が生じる。この関数はその賞与分の源泉徴収額の目安を
 * 示すのみで、月々の役員報酬（withholding.ts）とは別に計算・納付が必要である。
 *
 * @throws 入力が数値でない、0未満、または社会保険料が賞与総支給額を超える場合
 */
export function calculateBonusWithholding(input: BonusWithholdingInput): BonusWithholdingResult {
  const { bonusGrossAmount, bonusInsurancePremium, previousMonthSalaryAfterInsurance, dependentCount } = input;

  assertFiniteNonNegative(bonusGrossAmount, "賞与の総支給額");
  assertFiniteNonNegative(bonusInsurancePremium, "賞与にかかる社会保険料");
  assertFiniteNonNegative(previousMonthSalaryAfterInsurance, "前月の給与等の金額");
  assertFiniteNonNegative(dependentCount, "扶養親族等の数");
  if (!Number.isInteger(dependentCount)) {
    throw new Error("扶養親族等の数は整数で入力してください。");
  }
  if (bonusInsurancePremium > bonusGrossAmount) {
    throw new Error("社会保険料は賞与の総支給額を超えることはできません。");
  }

  const bonusTaxableBase = bonusGrossAmount - bonusInsurancePremium;
  const requestedDependentDeduction = dependentCount * PER_DEPENDENT_MONTHLY_DEDUCTION;
  const dependentDeductionApplied = Math.min(previousMonthSalaryAfterInsurance, requestedDependentDeduction);
  const adjustedPreviousMonthBase = Math.max(
    0,
    previousMonthSalaryAfterInsurance - dependentDeductionApplied
  );

  const appliedRatePercent = resolveBonusRatePercent(adjustedPreviousMonthBase);
  const withholdingTax = Math.floor(Math.max(0, (bonusTaxableBase * appliedRatePercent) / 100));
  const netPay = bonusGrossAmount - bonusInsurancePremium - withholdingTax;

  const assumptions: string[] = [
    "国税庁公表の「賞与に対する源泉徴収税額の算出率の表」甲欄（扶養控除等申告書を提出している前提）を、実際の細かい行区分ではなく、前月の給与等の金額の水準に応じた区分ごとの税率で近似した概算値です。実額とは数百円〜数千円程度、場合によってはそれ以上ずれることがあります",
    RECONSTRUCTION_SURTAX_NOTE,
    `扶養親族等1人あたり月額${PER_DEPENDENT_MONTHLY_DEDUCTION.toLocaleString("ja-JP")}円を前月の給与等の金額から差し引く近似を用いて税率区分を判定しています（配偶者控除等の細かい区分の違いは考慮しません）`,
    "社会保険料（健康保険・厚生年金保険料等）は入力された金額をそのまま控除し、標準報酬月額表・標準賞与額からの算定は行いません（別途ご自身で算定した金額を入力してください）",
    "「前月の給与がない場合の計算方法」「賞与の金額が前月の給与等の金額の10倍を超える場合の計算方法」など、国税庁が定める特別な計算方法には対応していません。通常のケースと同じ近似式をそのまま適用しているため、これらのケースに該当する場合は特に実額とのずれが大きくなる可能性があります",
    "年末調整（各種所得控除の反映・年間の過不足税額の精算）は対象外です。この賞与分の源泉徴収額を含めた年間の精算はyearEndAdjustment.tsのモジュールで別途概算してください",
    "本ツールは源泉徴収税額の目安を示す試算であり、税務代理・税務書類の作成・個別具体的な税務相談には該当しません。実際の源泉徴収・納付にあたっては必ず国税庁公表の最新の算出率の表をご確認ください",
  ];

  if (
    previousMonthSalaryAfterInsurance > 0 &&
    bonusTaxableBase > previousMonthSalaryAfterInsurance * HIGH_RATIO_WARNING_MULTIPLE
  ) {
    assumptions.push(
      `賞与の課税ベースが前月の給与等の金額の${HIGH_RATIO_WARNING_MULTIPLE}倍を超えています。国税庁の実際の取扱いでは、このようなケースは「前月の給与の10倍を超える場合の計算方法」という別の特別な計算式が適用されますが、本モジュールでは未対応です。実額とのずれが大きくなる可能性が高いため、必ず国税庁公表の資料をご確認ください`
    );
  }
  if (previousMonthSalaryAfterInsurance === 0) {
    assumptions.push(
      "前月の給与等の金額が0円（前月に給与の支払いがない）として計算しています。国税庁の実際の取扱いでは「前月の給与がない場合の計算方法」という別の特別な計算式が定められていますが、本モジュールでは未対応です。必ず国税庁公表の資料をご確認ください"
    );
  }

  return {
    bonusGrossAmount,
    bonusInsurancePremium,
    bonusTaxableBase,
    previousMonthSalaryAfterInsurance,
    dependentCount,
    dependentDeductionApplied,
    appliedRatePercent,
    withholdingTax,
    netPay,
    assumptions,
  };
}
