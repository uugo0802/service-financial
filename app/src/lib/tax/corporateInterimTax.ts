import { CorporateEstimate } from "./corporateEstimate";

// ------------------------------------------------------------------
// 免責: これは法人（マイクロ法人を想定）向けの、事業年度の中間（半年）時点で行う
// 「中間申告」（法人税法71条・72条、地方法人税法16条・17条）の概算ツールです。
// 個別の税務相談・助言ではなく、正式な税額計算でもありません。実際の要否・金額は
// 必ず税務署から送付される「予定申告のお知らせ」「納付書」、または税理士等の
// 専門家にご確認ください。
//
// 中間申告には2つの方式があります:
//   (a) 予定申告方式（前年実績による予定申告）: 前期確定税額の概ね1/2を納める。
//       中間期の実績にかかわらず機械的に計算でき、手間がかからない。
//   (b) 仮決算方式（仮決算による中間申告）: 事業年度開始から6か月間で実際に仮決算を
//       組み、その6か月間の実績に基づいて税額を計算する。前期に比べ今期上半期の
//       業績が大きく落ち込んでいる場合、予定申告方式より納付額を抑えられることがある
//       （ただし前期の税額の年換算より仮決算による税額が多い場合は選べない、赤字でも
//       中間申告自体は必要、消費税は仮決算方式を選べないなど細かい制約があり、本ツールは
//       それらを判定していません）。
// ------------------------------------------------------------------

/**
 * 法人税: 前事業年度の確定法人税額がこの金額を「超える」場合にのみ、当期の中間申告・
 * 中間納付（予定申告方式・仮決算方式のいずれも）が必要になる。ちょうど20万円は
 * 「超える」に該当しないため中間申告は不要（interimPayment.ts と同じ判定基準）。
 * 必ず「元の（半分にする前の）前期確定法人税額」で判定すること。半分にした額を
 * 10万円しきい値と比較するのではない（端数処理（1万円未満切り捨て）の影響で、
 * 「前期税額>20万円」と「前期税額/2の切り捨て>10万円」は常には一致しない）。
 */
export const CORPORATE_TAX_INTERIM_FILING_THRESHOLD = 200_000;

/**
 * 中間申告税額（予定申告方式）の端数処理: 法人税・地方法人税の中間申告税額は、
 * 国税通則法119条1項に基づき原則として1万円未満を切り捨てる。
 */
function roundDownToTenThousandYen(amount: number): number {
  return Math.floor(Math.max(0, amount) / 10_000) * 10_000;
}

/**
 * 消費税の中間納付額（予定申告方式）は円未満を切り捨てる（1万円未満切り捨てのルールは
 * 法人税・地方法人税のみに適用され、消費税には適用されない）。地方消費税額の按分は
 * 含んでいない（国税部分のみの概算、interimPayment.ts と同様の前提）。
 */
function roundDownToYen(amount: number): number {
  return Math.floor(Math.max(0, amount));
}

export interface PriorYearFinalTaxAmounts {
  /** 前事業年度の確定法人税額（国税、地方法人税を含まない） */
  corporateTax: number;
  /** 前事業年度の確定地方法人税額 */
  localCorporateTax: number;
  /**
   * 前事業年度の確定消費税額（国税部分のみ、地方消費税を除く）。省略時は消費税の
   * 中間納付額を計算しない（null で返す）。消費税の中間申告要否には別のしきい値
   * （前期確定消費税額48万円超）があり、本関数はそれを判定していない
   * （必要であれば interimPayment.ts の getInterimPaymentObligations を利用すること）。
   */
  consumptionTax?: number;
}

export interface ProvisionalInterimTaxResult {
  method: "provisional";
  /** 前事業年度の確定法人税額が20万円を超え、中間申告・中間納付が必要かどうか */
  required: boolean;
  thresholdAmount: number;
  priorYearCorporateTax: number;
  priorYearLocalCorporateTax: number;
  priorYearConsumptionTax: number | null;
  /** 中間申告（予定申告方式）による法人税の予定納付額（前期確定額の1/2、1万円未満切り捨て） */
  corporateTaxPrepayment: number;
  /** 同、地方法人税 */
  localCorporateTaxPrepayment: number;
  /** 同、消費税（国税部分）。priorYearConsumptionTax未指定の場合はnull */
  consumptionTaxPrepayment: number | null;
  /** 法人税・地方法人税・消費税（該当する場合）の予定納付額の合計 */
  totalPrepayment: number;
  assumptions: string[];
}

/**
 * (a) 予定申告方式: 前事業年度の確定税額に基づき、当期の中間申告・中間納付額を概算する。
 * 前期の事業年度が12か月であることを前提に、確定税額の1/2を予定納付額とする。
 */
export function calculateProvisionalInterimTax(input: PriorYearFinalTaxAmounts): ProvisionalInterimTaxResult {
  const priorYearCorporateTax = Math.max(0, input.corporateTax);
  const priorYearLocalCorporateTax = Math.max(0, input.localCorporateTax);
  const priorYearConsumptionTax =
    input.consumptionTax !== undefined ? Math.max(0, input.consumptionTax) : null;

  // 中間申告の要否は「元の」前期確定法人税額で判定する（半分にした額ではない）。
  const required = priorYearCorporateTax > CORPORATE_TAX_INTERIM_FILING_THRESHOLD;

  const corporateTaxPrepayment = required ? roundDownToTenThousandYen(priorYearCorporateTax / 2) : 0;
  const localCorporateTaxPrepayment = required ? roundDownToTenThousandYen(priorYearLocalCorporateTax / 2) : 0;
  // 消費税の中間納付要否は法人税の20万円しきい値（＝required）とは独立した別制度
  // （前期確定消費税額48万円超、上記コメント参照）であり、本関数はその要否判定を行わず
  // 呼び出し側の責務としている。そのため priorYearConsumptionTax が指定されている限り、
  // 法人税側の required（corporateTax>20万円）の真偽にかかわらず半額を機械的に算出する
  // （required で0円に丸めてしまうと、法人税は不要でも消費税は48万円超で中間納付が
  // 必要なケース——多くの小規模法人でまさに起こりうる——で、実際には納付が必要な
  // 消費税中間納付額を0円と誤って表示してしまう）。
  const consumptionTaxPrepayment =
    priorYearConsumptionTax === null ? null : roundDownToYen(priorYearConsumptionTax / 2);

  return {
    method: "provisional",
    required,
    thresholdAmount: CORPORATE_TAX_INTERIM_FILING_THRESHOLD,
    priorYearCorporateTax,
    priorYearLocalCorporateTax,
    priorYearConsumptionTax,
    corporateTaxPrepayment,
    localCorporateTaxPrepayment,
    consumptionTaxPrepayment,
    totalPrepayment: corporateTaxPrepayment + localCorporateTaxPrepayment + (consumptionTaxPrepayment ?? 0),
    assumptions: [
      "中間申告・中間納付の要否は、前事業年度の確定法人税額が20万円を超えるかどうかで判定しています（20万円ちょうどの場合は不要）。前期の事業年度が12か月であることを前提としています。",
      "予定申告方式（前年実績による予定申告）による概算です。前期確定法人税額・地方法人税額それぞれの1/2を、国税通則法上の端数処理ルールに基づき1万円未満切り捨てで算出しています。",
      priorYearConsumptionTax !== null
        ? "消費税（国税部分）の中間納付額は、前期確定消費税額の1/2を円未満切り捨てで概算しています。地方消費税額の按分、および消費税独自の中間申告要否しきい値（前期確定消費税額48万円超）の判定は含んでいません。"
        : "消費税額が入力されていないため、消費税の中間納付額は計算していません。",
      "これは一般的な制度に基づく概算であり、個別の税務相談・助言ではありません。実際の要否・金額は、税務署から送付される予定申告に関する通知、または税理士等の専門家に必ずご確認ください。",
    ],
  };
}

export interface InterimClosingFilingResult {
  method: "interimClosing";
  /** 仮決算（6か月間の実績）に基づく法人税額（corporateEstimate.tsの計算結果をそのまま使用） */
  corporateTax: number;
  /** 同、地方法人税額 */
  localCorporateTax: number;
  /** 同、消費税額（国税部分の納付見込額）。includeConsumptionTax=falseの場合はnull */
  consumptionTaxPayable: number | null;
  /** 法人税・地方法人税・消費税（含める場合）の合計 */
  totalPrepayment: number;
  /** 元になった仮決算の試算結果（参照用にそのまま保持） */
  sourceEstimate: CorporateEstimate;
  assumptions: string[];
}

/**
 * (b) 仮決算方式: 事業年度開始から6か月間の実績で仮決算を組んだ結果（corporateEstimate.ts の
 * estimateForMicroCorp を、その6か月間の取引データに対して呼び出して得られる CorporateEstimate）
 * を受け取り、中間申告税額として軽くラップするだけの関数。法人税率・軽減税率・地方法人税率などの
 * コアな計算ロジックは一切再実装せず、corporateEstimate.ts の計算結果をそのまま転記する。
 *
 * 呼び出し側の責務: 6か月分の取引データ（CategorizedTransaction[]）を用意し、
 * estimateForMicroCorp(sixMonthRows) を呼び出して仮決算の CorporateEstimate を作成してから、
 * その結果をこの関数に渡すこと。本関数自身は取引データや期間の妥当性を検証しない。
 *
 * 注意: 仮決算方式は、前期の確定法人税額を年換算した金額より仮決算による税額の方が
 * 多い場合は選択できない、消費税は仮決算方式を選べない（予定申告方式のみ）等の制約が
 * あるが、本関数はこれらを判定していない。中間申告自体が必要かどうか
 * （calculateProvisionalInterimTax の required、または前期確定法人税額>20万円）は
 * 呼び出し側で別途確認すること。
 */
export function deriveInterimTaxFromClosing(
  interimEstimate: CorporateEstimate,
  options: { includeConsumptionTax?: boolean } = {}
): InterimClosingFilingResult {
  const includeConsumptionTax = options.includeConsumptionTax ?? true;
  const consumptionTaxPayable = includeConsumptionTax ? Math.max(0, interimEstimate.consumptionTax.payable) : null;

  return {
    method: "interimClosing",
    corporateTax: interimEstimate.corporateTax,
    localCorporateTax: interimEstimate.localCorporateTax,
    consumptionTaxPayable,
    totalPrepayment: interimEstimate.corporateTax + interimEstimate.localCorporateTax + (consumptionTaxPayable ?? 0),
    sourceEstimate: interimEstimate,
    assumptions: [
      "仮決算方式（仮決算による中間申告）による概算です。事業年度開始から6か月間の実際の取引実績に基づく仮決算の試算結果（corporateEstimate.tsのestimateForMicroCorpによる計算）を、そのまま中間申告税額として転記しています。",
      "仮決算方式は、前期確定法人税額を年換算した額より仮決算による税額が多い場合は選択できない、消費税は仮決算方式を選べない（予定申告方式のみ）等の制約がありますが、本ツールはこれらを判定していません。",
      "これは一般的な制度に基づく概算であり、個別の税務相談・助言ではありません。実際の金額は税理士等の専門家に必ずご確認ください。",
    ],
  };
}

export type FavorableInterimMethod = "provisional" | "interimClosing" | "equal";

export interface InterimTaxMethodComparison {
  provisional: ProvisionalInterimTaxResult;
  /** 仮決算方式の試算結果。まだ仮決算を組んでいない場合はnull */
  interimClosing: InterimClosingFilingResult | null;
  provisionalTotal: number;
  /** interimClosingがnullの場合はnull */
  interimClosingTotal: number | null;
  /**
   * どちらの方式が納付額を抑えられるか。interimClosingが未入力の場合はnull。
   * "equal"は両方式の合計納付額が一致する場合。
   */
  favorableMethod: FavorableInterimMethod | null;
  /**
   * 予定申告方式の合計 − 仮決算方式の合計。正の値は仮決算方式の方が
   * その金額だけ納付額が少ないことを示す（負の値は予定申告方式の方が少ない）。
   * interimClosingが未入力の場合はnull。
   */
  savingsFromInterimClosing: number | null;
}

/**
 * 予定申告方式・仮決算方式の予定納付額を並べて比較する。仮決算をまだ組んでいない
 * （interimClosing未入力）場合は、予定申告方式の結果のみを返す。
 */
export function compareInterimTaxMethods(
  provisional: ProvisionalInterimTaxResult,
  interimClosing?: InterimClosingFilingResult
): InterimTaxMethodComparison {
  if (!interimClosing) {
    return {
      provisional,
      interimClosing: null,
      provisionalTotal: provisional.totalPrepayment,
      interimClosingTotal: null,
      favorableMethod: null,
      savingsFromInterimClosing: null,
    };
  }

  const provisionalTotal = provisional.totalPrepayment;
  const interimClosingTotal = interimClosing.totalPrepayment;
  const savingsFromInterimClosing = provisionalTotal - interimClosingTotal;

  let favorableMethod: FavorableInterimMethod;
  if (savingsFromInterimClosing > 0) {
    favorableMethod = "interimClosing";
  } else if (savingsFromInterimClosing < 0) {
    favorableMethod = "provisional";
  } else {
    favorableMethod = "equal";
  }

  return {
    provisional,
    interimClosing,
    provisionalTotal,
    interimClosingTotal,
    favorableMethod,
    savingsFromInterimClosing,
  };
}
