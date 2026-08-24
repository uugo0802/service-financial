// ------------------------------------------------------------------
// ふるさと納税（自己負担2,000円）年間寄附上限額シミュレーター
//
// ふるさと納税は、任意の地方自治体に寄附をすると、寄附額のうち2,000円を超える部分が
// 所得税の還付・翌年度住民税の控除（寄附金税額控除の「特例分」を含む）として戻ってくる
// 制度（地方税法37条の2・所得税法78条等）。ただし「特例分」には住民税所得割額の20%と
// いう上限があるため、この上限を超えて寄附すると、超過部分については自己負担が
// 2,000円を超えてしまう。このモジュールは、その「自己負担が2,000円のままで済む
// 年間寄附額の目安（上限）」を、総務省が公表している簡易計算式を用いて概算する。
//
// 出典・計算式（総務省 ふるさと納税ポータルサイト「寄附金控除額の計算シミュレーション」
// 等で公表されている簡易式）:
//   住民税の特例控除額 = (寄附金額 − 2,000円) × (90% − 所得税の限界税率 × 1.021)
//   → 特例控除額が住民税所得割額の20%とちょうど一致する寄附金額を逆算すると、
//     寄附上限額 ≈ 住民税所得割額 × 20% ÷ (90% − 所得税率 × 1.021) + 2,000円
//   （所得税率×1.021は、復興特別所得税を含めた実効の所得税率）
// https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html
//
// このモジュールは、以下の点で「概算」であることに留意する（詳細は本文中のコメントと
// assumptions/disclaimerを参照）:
//   1. 住民税所得割額は入力していただく前提の値ではなく、所得税の課税所得金額から
//      標準税率10%・調整控除の概算を用いて推計する（実際の住民税決定通知書の金額とは
//      ずれる可能性がある）。
//   2. 所得税率は、寄附金控除適用「前」の課税所得金額に対応する限界税率をそのまま用いる
//      （寄附金控除により課税所得がブラケットを跨いで下がるごく僅かなケースは考慮しない）。
//   3. 配偶者控除・扶養控除の「人的控除差」調整控除のみを近似的にモデル化し、障害者控除・
//      寡婦控除・ひとり親控除等、その他の人的控除の差は考慮しない。
//   4. 総所得金額等の90%を超える寄附（所得税の寄附金控除の40%上限が別途あるため、
//      現実的にはまず到達しない極端なケース）は考慮しない。
//
// 【重要・法人について】 このシミュレーターは個人住民税・所得税を前提とした「ふるさと
// 納税（個人版・自己負担2,000円の特例控除）」制度のみを対象とする。マイクロ法人が
// 地方自治体等に寄附する場合は、法人税法上の寄附金の損金算入限度額の計算（一般の寄附金・
// 特定公益増進法人等向け寄附金等の区分ごとの損金算入枠）に従うのが原則であり、個人版の
// ような「自己負担2,000円で完了する」特例控除の仕組みは存在しない（ふるさと納税
// 「企業版」は対象が地方公共団体の认定事业に限られる別制度で、本ツールの対象外）。
// entityType="corporation" の場合は計算自体を行わず、isApplicable=false として
// その旨を明示する。
//
// このツールは一般的な制度・税率に基づく簡易シミュレーションであり、税理士法第2条に
// いう個別具体的な税務相談・助言には該当しない（詳細は FURUSATO_NOZEI_SIMULATOR_DISCLAIMER
// を参照）。
// ------------------------------------------------------------------

/** ふるさと納税の自己負担額（特例控除枠内であれば、寄附額の多寡によらず一律この金額） */
export const FURUSATO_NOZEI_SELF_PAY_AMOUNT = 2_000;

/** 住民税の特例控除額の上限とされる、住民税所得割額に対する割合（20%） */
export const SPECIAL_DEDUCTION_LIMIT_RATE = 0.2;

/** 住民税所得割額の概算に用いる標準税率（道府県民税4%＋市町村民税6%相当、政令指定都市は内訳が異なる） */
export const RESIDENT_TAX_INCOME_LEVY_RATE = 0.1;

/** 復興特別所得税を加味した実効所得税率を求めるための係数（基準所得税額×2.1%） */
export const RECONSTRUCTION_SURTAX_MULTIPLIER = 1.021;

/**
 * 所得税の速算表（2024年分以降、5%〜45%の7段階）。
 * 出典: 国税庁タックスアンサー No.2260「所得税の税率」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
 * 本ファイルは他の税務シミュレーターモジュール（pensionSavingsSimulator.ts 等）と同様、
 * estimate.ts に依存しない自己完結モジュールとして実装するため、速算表をここに直接
 * ハードコードしている（税制改正により将来変更される可能性があるため、実際の申告時には
 * 必ず国税庁の最新の発表内容と照合すること）。
 */
export interface IncomeTaxBracket {
  /** この金額（円）以下であればこのブラケットが適用される。最上位はInfinity */
  upTo: number;
  /** 税率（%） */
  ratePercent: number;
  /** 速算控除額（円）。本モジュールでは限界税率の特定にのみ用い、税額自体の計算には使わない */
  deduction: number;
}

export const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, ratePercent: 5, deduction: 0 },
  { upTo: 3_300_000, ratePercent: 10, deduction: 97_500 },
  { upTo: 6_950_000, ratePercent: 20, deduction: 427_500 },
  { upTo: 9_000_000, ratePercent: 23, deduction: 636_000 },
  { upTo: 18_000_000, ratePercent: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, ratePercent: 40, deduction: 2_796_000 },
  { upTo: Infinity, ratePercent: 45, deduction: 4_796_000 },
];

/**
 * 所得税と住民税とで人的控除の金額が異なることによる差額（人的控除差）。
 * 住民税の調整控除・住民税課税所得金額の概算に用いる。いずれも代表的な区分のみを
 * モデル化しており、老人控除対象配偶者・同居老親等など、より控除額が大きい区分は
 * 考慮していない（要専門家確認、assumptionsで明示）。
 *
 * 出典: 総務省・国税庁公表の控除額一覧より（基礎控除: 所得税48万円/住民税43万円、
 * 配偶者控除(一般): 所得税38万円/住民税33万円、一般扶養親族: 所得税38万円/住民税33万円、
 * 特定扶養親族(19〜22歳): 所得税63万円/住民税45万円、老人扶養親族(70歳以上、別居):
 * 所得税48万円/住民税38万円）。
 */
export const PERSONAL_DEDUCTION_GAP = {
  basic: 50_000,
  spouse: 50_000,
  generalDependent: 50_000,
  specifiedDependent: 180_000,
  elderlyDependent: 100_000,
} as const;

/** 調整控除の計算で「合計課税所得金額」とみなすしきい値（円） */
const ADJUSTMENT_DEDUCTION_INCOME_THRESHOLD = 2_000_000;

export const FURUSATO_NOZEI_SIMULATOR_DISCLAIMER =
  "これは総務省が公表している簡易計算式に基づく一般的な制度の試算（シミュレーション）であり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。実際の住民税所得割額は、お住まいの自治体から届く住民税決定通知書（または課税証明書）に記載された金額が正式なものであり、本ツールが概算した金額とは異なる場合があります。また、年の途中の収入変動、ふるさと納税以外の控除の適用状況、ワンストップ特例の適用可否（寄附先が6自治体以上になる場合や、他の理由で確定申告が必要な場合は利用できません）などによっても実際の上限額は変動します。表示された金額は上限の目安であり、実際の寄附額の決定や申告手続きは、必ずご自身の判断で行うか、税理士等の専門家にご確認ください。";

export type FurusatoNozeiEntityType = "individual" | "corporation";

export interface FurusatoNozeiDependentsInput {
  /** 控除対象配偶者（合計所得金額900万円以下の納税者の一般の控除対象配偶者）がいるか */
  hasSpouseDeduction?: boolean;
  /** 一般の扶養親族（16歳以上、特定・老人扶養親族に該当しない人）の人数 */
  generalDependentCount?: number;
  /** 特定扶養親族（19歳以上23歳未満）の人数 */
  specifiedDependentCount?: number;
  /** 老人扶養親族（70歳以上、同居老親等を除く）の人数 */
  elderlyDependentCount?: number;
}

export interface FurusatoNozeiSimulatorInput {
  /** 個人事業主・給与所得者等の個人 or マイクロ法人。法人の場合は個人版の特例控除制度が適用されないため試算を行わない */
  entityType: FurusatoNozeiEntityType;
  /**
   * 所得税の課税所得金額（円）。社会保険料控除・基礎控除・配偶者控除・扶養控除など、
   * 適用可能な所得控除をすべて差し引いた後の金額を入力する（このふるさと納税分の
   * 寄附金控除を適用する前の金額）。entityType="individual" の場合は必須。
   */
  taxableIncome?: number;
  /** 配偶者控除・扶養控除の適用状況（住民税の調整控除の概算に用いる）。省略時はいずれも無しとして扱う */
  dependents?: FurusatoNozeiDependentsInput;
}

export interface FurusatoNozeiSimulatorResult {
  /** entityType="corporation" の場合はfalse。この場合、以下の金額系フィールドはすべて0扱い */
  isApplicable: boolean;
  /** isApplicable=falseの場合の理由（画面にそのまま表示できる） */
  notApplicableReason?: string;
  taxableIncome: number;
  /** 入力された課税所得金額が該当する所得税の限界税率のブラケット */
  marginalIncomeTaxBracket: { ratePercent: number; upTo: number };
  /** 配偶者控除・扶養控除の入力から求めた人的控除差の合計額（基礎控除分5万円を含む） */
  personalDeductionGapTotal: number;
  /** 住民税の課税総所得金額の概算（所得税の課税所得金額 + 人的控除差の合計額） */
  residentTaxTaxableIncomeApprox: number;
  /** 住民税の調整控除額の概算 */
  adjustmentDeductionApprox: number;
  /** 住民税所得割額の概算（= 住民税の課税総所得金額 × 10% − 調整控除の概算、円未満切り捨て） */
  residentTaxIncomeLevyApprox: number;
  /** 自己負担が2,000円のままで済む年間寄附額の上限の目安（円） */
  donationCeiling: number;
  /** 自己負担額（特例控除枠内であれば常にこの金額） */
  selfPayAmount: number;
  disclaimer: string;
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

function assertNonNegativeInteger(value: number, label: string): void {
  assertFiniteNonNegative(value, label);
  if (!Number.isInteger(value)) {
    throw new Error(`${label}は整数で入力してください。`);
  }
}

/** 課税所得が該当する速算表のブラケットを返す（マイナスは0として扱う） */
function findMarginalBracket(taxableIncome: number): IncomeTaxBracket {
  const income = Math.max(0, taxableIncome);
  return INCOME_TAX_BRACKETS.find((b) => income <= b.upTo) ?? INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
}

/**
 * 配偶者控除・扶養控除の適用状況から、人的控除差の合計額（基礎控除分5万円を含む）を求める。
 * 障害者控除・寡婦控除・ひとり親控除等、他の人的控除の差は考慮しない（assumptionsで明示）。
 */
function calcPersonalDeductionGapTotal(dependents?: FurusatoNozeiDependentsInput): number {
  const generalDependentCount = dependents?.generalDependentCount ?? 0;
  const specifiedDependentCount = dependents?.specifiedDependentCount ?? 0;
  const elderlyDependentCount = dependents?.elderlyDependentCount ?? 0;

  assertNonNegativeInteger(generalDependentCount, "一般の扶養親族の人数");
  assertNonNegativeInteger(specifiedDependentCount, "特定扶養親族の人数");
  assertNonNegativeInteger(elderlyDependentCount, "老人扶養親族の人数");

  return (
    PERSONAL_DEDUCTION_GAP.basic +
    (dependents?.hasSpouseDeduction ? PERSONAL_DEDUCTION_GAP.spouse : 0) +
    generalDependentCount * PERSONAL_DEDUCTION_GAP.generalDependent +
    specifiedDependentCount * PERSONAL_DEDUCTION_GAP.specifiedDependent +
    elderlyDependentCount * PERSONAL_DEDUCTION_GAP.elderlyDependent
  );
}

/**
 * 合計課税所得金額が200万円を超える場合の調整控除額の下限（円）。地方税法附則3条の3等に
 * 基づき、計算結果がこの金額を下回るときは一律この金額とする「最低保障額」（多くの
 * 自治体の解説ページで「2,500円未満の場合は2,500円」と説明されている）。
 * 出典例: 東京都主税局・神戸市の個人住民税「調整控除」解説ページ。
 */
const ADJUSTMENT_DEDUCTION_MINIMUM_ABOVE_THRESHOLD = 2_500;

/**
 * 住民税の調整控除額を概算する（地方税法附則3条の3等に基づく制度の簡易近似）。
 * 合計課税所得金額が200万円以下: min(人的控除差の合計額, 合計課税所得金額) × 5%
 * 合計課税所得金額が200万円超: (人的控除差の合計額 − (合計課税所得金額 − 200万円)) × 5%。
 *   ただし、この算式で求めた金額が2,500円未満となる場合（人的控除差が超過額以下で
 *   マイナスになるケースを含む）は、一律2,500円とする（最低保障額）。
 * 実際の制度では高所得者（合計所得2,500万円超等）で基礎控除自体が逓減・消失し調整控除の
 * 扱いも変わるが、本ツールはその極端なケースまでは追わない簡易近似である。
 */
function calcAdjustmentDeductionApprox(residentTaxTaxableIncome: number, personalDeductionGapTotal: number): number {
  if (residentTaxTaxableIncome <= 0 || personalDeductionGapTotal <= 0) return 0;

  if (residentTaxTaxableIncome <= ADJUSTMENT_DEDUCTION_INCOME_THRESHOLD) {
    return Math.floor(Math.min(personalDeductionGapTotal, residentTaxTaxableIncome) * 0.05);
  }

  const excess = residentTaxTaxableIncome - ADJUSTMENT_DEDUCTION_INCOME_THRESHOLD;
  const raw = Math.floor((personalDeductionGapTotal - excess) * 0.05);
  return Math.max(ADJUSTMENT_DEDUCTION_MINIMUM_ABOVE_THRESHOLD, raw);
}

/**
 * ふるさと納税の「自己負担2,000円のままで済む年間寄附上限額」を概算するシミュレーション。
 *
 * entityType="corporation" の場合は、個人版のふるさと納税特例控除制度が適用されないため
 * 計算を行わず、isApplicable=false・notApplicableReasonを設定して返す。
 *
 * entityType="individual" の場合、所得税の課税所得金額（taxableIncome）と配偶者控除・
 * 扶養控除の適用状況（dependents）から、住民税所得割額を概算し、総務省公表の簡易式
 *   寄附上限額 ≈ 住民税所得割額 × 20% ÷ (90% − 所得税率 × 1.021) + 2,000円
 * を用いて年間寄附上限額の目安を算出する。
 */
export function simulateFurusatoNozei(input: FurusatoNozeiSimulatorInput): FurusatoNozeiSimulatorResult {
  const { entityType, dependents } = input;

  if (entityType === "corporation") {
    return {
      isApplicable: false,
      notApplicableReason:
        "ふるさと納税の「自己負担2,000円」の特例控除制度は個人住民税・所得税を前提とした個人向けの制度であり、マイクロ法人（法人）には適用されません。法人が地方自治体等に寄附する場合は、法人税法上の寄附金の損金算入限度額の計算（一般の寄附金・特定公益増進法人等向け寄附金等の区分ごとの損金算入枠）に従うのが原則です。地方公共団体の認定事業に対する「ふるさと納税（企業版）」という別制度もありますが、対象事業が限定されており、本ツールの対象外です。詳細は税理士等の専門家にご確認ください。",
      taxableIncome: 0,
      marginalIncomeTaxBracket: { ratePercent: 0, upTo: 0 },
      personalDeductionGapTotal: 0,
      residentTaxTaxableIncomeApprox: 0,
      adjustmentDeductionApprox: 0,
      residentTaxIncomeLevyApprox: 0,
      donationCeiling: 0,
      selfPayAmount: 0,
      disclaimer: FURUSATO_NOZEI_SIMULATOR_DISCLAIMER,
      assumptions: [
        "entityType（事業形態）が法人のため、個人版ふるさと納税の自己負担2,000円の特例控除制度に基づく試算は行っていません。",
      ],
    };
  }

  const taxableIncome = input.taxableIncome ?? 0;
  assertFiniteNonNegative(taxableIncome, "課税所得金額");

  const personalDeductionGapTotal = calcPersonalDeductionGapTotal(dependents);
  const marginalBracket = findMarginalBracket(taxableIncome);

  // 住民税の課税総所得金額の概算 = 所得税の課税所得金額 + 人的控除差の合計額
  // （所得税と住民税とで、社会保険料控除等の金額は同一だが、基礎控除・配偶者控除・扶養控除
  //   の金額が住民税の方が小さいため、その差額の分だけ住民税の課税所得の方が大きくなる）。
  const residentTaxTaxableIncomeApprox = Math.max(0, taxableIncome + personalDeductionGapTotal);

  const adjustmentDeductionApprox = calcAdjustmentDeductionApprox(
    residentTaxTaxableIncomeApprox,
    personalDeductionGapTotal
  );

  const residentTaxIncomeLevyApprox = Math.max(
    0,
    Math.floor(residentTaxTaxableIncomeApprox * RESIDENT_TAX_INCOME_LEVY_RATE) - adjustmentDeductionApprox
  );

  // 実効所得税率（復興特別所得税を加味）。速算表の税率（%）を小数に変換し、1.021倍する。
  const effectiveIncomeTaxRate = (marginalBracket.ratePercent / 100) * RECONSTRUCTION_SURTAX_MULTIPLIER;
  const denominator = 0.9 - effectiveIncomeTaxRate;

  const donationCeiling = Math.max(
    FURUSATO_NOZEI_SELF_PAY_AMOUNT,
    Math.floor((residentTaxIncomeLevyApprox * SPECIAL_DEDUCTION_LIMIT_RATE) / denominator) +
      FURUSATO_NOZEI_SELF_PAY_AMOUNT
  );

  return {
    isApplicable: true,
    taxableIncome: Math.max(0, taxableIncome),
    marginalIncomeTaxBracket: { ratePercent: marginalBracket.ratePercent, upTo: marginalBracket.upTo },
    personalDeductionGapTotal,
    residentTaxTaxableIncomeApprox,
    adjustmentDeductionApprox,
    residentTaxIncomeLevyApprox,
    donationCeiling,
    selfPayAmount: FURUSATO_NOZEI_SELF_PAY_AMOUNT,
    disclaimer: FURUSATO_NOZEI_SIMULATOR_DISCLAIMER,
    assumptions: [
      "寄附上限額は、総務省が公表している簡易計算式「住民税所得割額 × 20% ÷ (90% − 所得税率 × 1.021) + 2,000円」に基づく概算です。",
      "住民税所得割額は、入力された所得税の課税所得金額に、所得税と住民税の基礎控除・配偶者控除・扶養控除の差額（人的控除差）を加算したうえで標準税率10%（道府県民税4%＋市町村民税6%相当）を掛け、住民税の調整控除の概算を差し引いて推計した値です。実際の住民税決定通知書に記載された住民税所得割額とは異なる場合があります。",
      "人的控除差は、基礎控除（5万円）・一般の配偶者控除（5万円）・一般の扶養親族（1人あたり5万円）・特定扶養親族（1人あたり18万円）・老人扶養親族/別居（1人あたり10万円）のみを考慮しています。同居老親等（1人あたり13万円）、障害者控除、寡婦控除、ひとり親控除等、他の人的控除の差は考慮していません。",
      "所得税率は、寄附金控除を適用する前の課税所得金額に対応する速算表の限界税率をそのまま用いています。寄附金控除適用後に課税所得がブラケットを跨いで下がるごく僅かなケースは考慮していません。",
      "所得税の寄附金控除には別途、総所得金額等の40%という上限がありますが、一般的な家計収入の水準ではこの上限が先に効くことは稀なため、本ツールでは考慮していません。",
      "ワンストップ特例制度（給与所得者等で、寄附先が年間5自治体以内かつ他に確定申告の必要がない場合に利用可）を利用する場合は、所得税分も含めて全額が翌年度の住民税から控除されます。確定申告を行う場合（寄附先が6自治体以上の場合、事業所得者等でそもそも確定申告が必要な場合など）は、所得税の還付と翌年度住民税の控除に分かれて反映されますが、自己負担2,000円を除いた控除の合計額はおおむね同じになるよう制度設計されています。いずれの方式でも、本ツールが示す寄附上限額の目安自体は変わりません。",
      "本ツールは個人（フリーランス・給与所得者等）を対象としています。マイクロ法人（法人）には個人版のふるさと納税の特例控除制度は適用されません。",
    ],
  };
}
