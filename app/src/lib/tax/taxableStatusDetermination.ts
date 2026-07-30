// ------------------------------------------------------------------
// 消費税課税事業者判定シミュレーター
//
// 当期（判定対象の課税期間）が消費税の「課税事業者」か「免税事業者」かを、
// 一般的な判定ルールに基づいて機械的に判定します。判定に使うのは以下の4つの
// ルールで、いずれか1つでも該当すれば課税事業者になります（該当なしなら免税事業者）。
//
//   (a) 基準期間（原則2年前）の課税売上高が1,000万円を超える（消費税法9条1項）
//   (b) 特定期間（原則前年の上半期6か月）の課税売上高と給与等支払額の“両方”が
//       1,000万円を超える（消費税法9条の2）。課税売上高だけが超えていても、
//       給与等支払額が1,000万円以下であれば、納税者はその判定に代えることができ、
//       免税のままでいられる（=「有利な方を選べる」）。
//   (c) 新設法人の特例：基準期間がない事業年度（設立1期目・2期目）で、その事業年度
//       開始の日における資本金の額又は出資の金額が1,000万円以上（消費税法12条の2）。
//       法人のみに適用され、個人事業主には適用されない。
//   (d) インボイス発行事業者（適格請求書発行事業者）の登録を受けている場合、登録を
//       選択している限りは課税事業者となる（消費税法9条1項ただし書き）。
//
// このモジュールが対象外とする（=「要専門家確認」として扱う）主なケース:
//   - 合併・分割があった場合（消費税法11条・12条、みなし課税事業者の特例）
//   - 特定新規設立法人（消費税法12条の3。資本金1,000万円未満でも、大規模法人に
//     支配されている新設法人は基準期間がなくても課税事業者になり得る）
//   - 高額特定資産の取得、相続による事業承継、その他の個別事情
//
// これは一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・
// 助言（税理士法上の税務相談）には該当しません。
// ------------------------------------------------------------------

/** 基準期間課税売上高の免税判定しきい値（これを「超える」と課税事業者） */
export const BASE_PERIOD_TAXABLE_SALES_THRESHOLD = 10_000_000;
/** 特定期間課税売上高の免税判定しきい値（これを「超える」と課税事業者の要件の一部を満たす） */
export const SPECIFIED_PERIOD_SALES_THRESHOLD = 10_000_000;
/** 特定期間給与等支払額の免税判定しきい値（これを「超える」と課税事業者の要件の一部を満たす） */
export const SPECIFIED_PERIOD_SALARY_THRESHOLD = 10_000_000;
/** 新設法人の特例における資本金しきい値（これ「以上」だと基準期間がなくても課税事業者） */
export const NEW_COMPANY_CAPITAL_THRESHOLD = 10_000_000;

export type EntityType = "individual" | "corporation";

export type TaxableStatus = "taxable" | "exempt";

export type TaxableStatusRuleId = "basePeriod" | "newCompanyCapital" | "specifiedPeriod" | "invoiceRegistration";

export interface TaxableStatusRuleStep {
  ruleId: TaxableStatusRuleId;
  /** 画面表示用のルール名 */
  label: string;
  /** 今回の入力に対して、このルールが判定対象になるか（例：基準期間が無い事業年度では基準期間ルールは対象外） */
  applicable: boolean;
  /** applicable=trueの場合に、このルールが「課税事業者」の結論を導いたか */
  triggered: boolean;
  /** 判定の根拠を説明する文（画面にそのまま表示できる） */
  detail: string;
}

export interface TaxableStatusDeterminationInput {
  /** 個人事業主 or 法人。新設法人の資本金特例（(c)）は法人のみに適用される */
  entityType: EntityType;
  /** 当期の期首時点でインボイス発行事業者（適格請求書発行事業者）として登録済みかどうか */
  isInvoiceRegisteredBusiness: boolean;
  /**
   * 当期に基準期間（原則2年前の課税期間）が存在するか。
   * 法人の設立1期目・2期目は原則として基準期間が存在しないためfalse。
   * 個人事業主は通常常にtrue（開業前の年は課税売上高0として扱う）。
   */
  hasBasePeriod: boolean;
  /** 基準期間の課税売上高（円）。hasBasePeriod=trueの場合は必須 */
  baseYearTaxableSales?: number;
  /**
   * 当期に特定期間（原則前事業年度開始から6か月間）が存在するか。
   * 未指定の場合はtrue（存在する）として扱う。法人の設立1期目には特定期間が存在しないためfalseを指定する。
   */
  hasSpecifiedPeriod?: boolean;
  /** 特定期間の課税売上高（円）。hasSpecifiedPeriod=trueの場合は必須 */
  specifiedPeriodTaxableSales?: number;
  /** 特定期間中に支払った給与等の金額の合計額（円）。hasSpecifiedPeriod=trueの場合は必須 */
  specifiedPeriodSalaryPaid?: number;
  /**
   * 当期の事業年度開始の日における資本金の額又は出資の金額（円）。
   * entityType="corporation" かつ hasBasePeriod=false の場合（新設法人の特例判定）に必須。
   */
  capitalStockAtPeriodStart?: number;
  /** 合併・分割が関係する場合はtrue（本ツールは対象外、要専門家確認としてフラグを立てるのみ） */
  hasMergerOrDemerger?: boolean;
  /** 特定新規設立法人に該当する可能性がある場合はtrue（本ツールは対象外、要専門家確認としてフラグを立てるのみ） */
  isSpecifiedNewlyEstablishedCorporation?: boolean;
}

export interface TaxableStatusDeterminationResult {
  status: TaxableStatus;
  /** 画面表示用の日本語ラベル："課税事業者" | "免税事業者" */
  statusLabel: string;
  /** 課税事業者と判定された場合、その決め手となったルールのID。免税事業者の場合はnull */
  decidingRuleId: TaxableStatusRuleId | null;
  /** 判定ロジックを(a)〜(d)の順に評価した過程（画面にステップ表示できる） */
  steps: TaxableStatusRuleStep[];
  /** 合併・分割、特定新規設立法人など、本ツールが対象外とする事情に該当し、専門家確認が必要な場合はtrue */
  requiresExpertReview: boolean;
  /** requiresExpertReview=trueの場合の理由一覧 */
  outOfScopeReasons: string[];
  disclaimer: string;
  assumptions: string[];
}

export const TAXABLE_STATUS_DISCLAIMER =
  "この判定結果は、消費税の課税事業者・免税事業者に関する一般的なルール（基準期間・特定期間の課税売上高、新設法人の資本金特例、インボイス発行事業者登録の有無）に基づく簡易シミュレーションであり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。合併・分割、特定新規設立法人、高額特定資産の取得、相続による事業承継など、本ツールが考慮していない特例に該当する場合は、実際の判定結果が変わる可能性があります。最終的な判定・申告内容は、必ず税理士等の専門家にご確認ください。";

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

function requireNumber(value: number | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`${label}を入力してください。`);
  }
  assertFiniteNonNegative(value, label);
  return value;
}

/**
 * 消費税の課税事業者・免税事業者を、基準期間・特定期間・新設法人の資本金特例・
 * インボイス発行事業者登録の有無という4つのルールに基づいて判定する。
 *
 * 判定は(a)基準期間 → (b)新設法人の資本金特例（基準期間が無い場合のみ） →
 * (c)特定期間 → (d)インボイス発行事業者登録 の順に評価し、いずれか1つでも
 * 該当（トリガー）すれば課税事業者と判定する。すべて非該当であれば免税事業者。
 *
 * 合併・分割や特定新規設立法人など、このロジックが考慮していない特例に該当する
 * 可能性がある場合は、requiresExpertReview=trueとして結果に含める（判定自体は
 * 上記4ルールのみに基づいて行われるため、それらの特例により実際の結論が
 * 変わる可能性がある点に留意すること）。
 */
export function determineTaxableStatus(input: TaxableStatusDeterminationInput): TaxableStatusDeterminationResult {
  const {
    entityType,
    isInvoiceRegisteredBusiness,
    hasBasePeriod,
    hasMergerOrDemerger = false,
    isSpecifiedNewlyEstablishedCorporation = false,
  } = input;
  const hasSpecifiedPeriod = input.hasSpecifiedPeriod ?? true;

  const steps: TaxableStatusRuleStep[] = [];

  // (a) 基準期間の課税売上高
  let basePeriodTriggered = false;
  if (hasBasePeriod) {
    const baseYearTaxableSales = requireNumber(input.baseYearTaxableSales, "基準期間の課税売上高");
    basePeriodTriggered = baseYearTaxableSales > BASE_PERIOD_TAXABLE_SALES_THRESHOLD;
    steps.push({
      ruleId: "basePeriod",
      label: "基準期間の課税売上高による判定",
      applicable: true,
      triggered: basePeriodTriggered,
      detail: basePeriodTriggered
        ? `基準期間の課税売上高（${baseYearTaxableSales.toLocaleString("ja-JP")}円）が1,000万円を超えているため、課税事業者に該当します。`
        : `基準期間の課税売上高（${baseYearTaxableSales.toLocaleString("ja-JP")}円）は1,000万円を超えていないため、この基準だけでは課税事業者になりません。`,
    });
  } else {
    steps.push({
      ruleId: "basePeriod",
      label: "基準期間の課税売上高による判定",
      applicable: false,
      triggered: false,
      detail: "当期は基準期間が存在しない事業年度（設立1期目・2期目等）のため、この基準は判定対象外です。",
    });
  }

  // (b) 新設法人の資本金特例（基準期間が無い事業年度のみ、法人限定）
  let newCompanyCapitalTriggered = false;
  const newCompanyCapitalApplicable = !hasBasePeriod && entityType === "corporation";
  if (newCompanyCapitalApplicable) {
    const capitalStockAtPeriodStart = requireNumber(
      input.capitalStockAtPeriodStart,
      "事業年度開始の日における資本金の額"
    );
    newCompanyCapitalTriggered = capitalStockAtPeriodStart >= NEW_COMPANY_CAPITAL_THRESHOLD;
    steps.push({
      ruleId: "newCompanyCapital",
      label: "新設法人の資本金特例による判定",
      applicable: true,
      triggered: newCompanyCapitalTriggered,
      detail: newCompanyCapitalTriggered
        ? `基準期間が無い事業年度ですが、事業年度開始の日における資本金の額（${capitalStockAtPeriodStart.toLocaleString("ja-JP")}円）が1,000万円以上のため、新設法人の特例により課税事業者に該当します。`
        : `事業年度開始の日における資本金の額（${capitalStockAtPeriodStart.toLocaleString("ja-JP")}円）は1,000万円未満のため、新設法人の資本金特例には該当しません。`,
    });
  } else {
    steps.push({
      ruleId: "newCompanyCapital",
      label: "新設法人の資本金特例による判定",
      applicable: false,
      triggered: false,
      detail: hasBasePeriod
        ? "基準期間が存在する事業年度のため、新設法人の資本金特例（基準期間が無い事業年度向け）は判定対象外です。"
        : "新設法人の資本金特例は法人のみに適用されるため、個人事業主は判定対象外です。",
    });
  }

  // (c) 特定期間の課税売上高と給与等支払額（両方が1,000万円超の場合のみ課税事業者）
  let specifiedPeriodTriggered = false;
  if (hasSpecifiedPeriod) {
    const specifiedPeriodTaxableSales = requireNumber(input.specifiedPeriodTaxableSales, "特定期間の課税売上高");
    const specifiedPeriodSalaryPaid = requireNumber(input.specifiedPeriodSalaryPaid, "特定期間の給与等支払額");
    const salesExceeds = specifiedPeriodTaxableSales > SPECIFIED_PERIOD_SALES_THRESHOLD;
    const salaryExceeds = specifiedPeriodSalaryPaid > SPECIFIED_PERIOD_SALARY_THRESHOLD;
    specifiedPeriodTriggered = salesExceeds && salaryExceeds;

    let detail: string;
    if (specifiedPeriodTriggered) {
      detail = `特定期間の課税売上高（${specifiedPeriodTaxableSales.toLocaleString("ja-JP")}円）と給与等支払額（${specifiedPeriodSalaryPaid.toLocaleString("ja-JP")}円）がいずれも1,000万円を超えているため、課税事業者に該当します。`;
    } else if (salesExceeds && !salaryExceeds) {
      detail = `特定期間の課税売上高（${specifiedPeriodTaxableSales.toLocaleString("ja-JP")}円）は1,000万円を超えていますが、給与等支払額（${specifiedPeriodSalaryPaid.toLocaleString("ja-JP")}円）は1,000万円を超えていないため、給与等支払額による判定を選択でき、この基準だけでは課税事業者になりません。`;
    } else {
      detail = `特定期間の課税売上高（${specifiedPeriodTaxableSales.toLocaleString("ja-JP")}円）は1,000万円を超えていないため、この基準だけでは課税事業者になりません。`;
    }

    steps.push({
      ruleId: "specifiedPeriod",
      label: "特定期間の課税売上高・給与等支払額による判定",
      applicable: true,
      triggered: specifiedPeriodTriggered,
      detail,
    });
  } else {
    steps.push({
      ruleId: "specifiedPeriod",
      label: "特定期間の課税売上高・給与等支払額による判定",
      applicable: false,
      triggered: false,
      detail: "当期は特定期間が存在しない事業年度（設立1期目等）のため、この基準は判定対象外です。",
    });
  }

  // (d) インボイス発行事業者登録
  const invoiceTriggered = isInvoiceRegisteredBusiness;
  steps.push({
    ruleId: "invoiceRegistration",
    label: "インボイス発行事業者登録の有無による判定",
    applicable: true,
    triggered: invoiceTriggered,
    detail: invoiceTriggered
      ? "インボイス発行事業者（適格請求書発行事業者）として登録済みのため、登録を選択している限り課税事業者に該当します。"
      : "インボイス発行事業者として登録していないため、この基準では課税事業者になりません。",
  });

  const decidingStep = steps.find((s) => s.applicable && s.triggered) ?? null;
  const status: TaxableStatus = decidingStep ? "taxable" : "exempt";

  const outOfScopeReasons: string[] = [];
  if (hasMergerOrDemerger) {
    outOfScopeReasons.push(
      "合併・分割があった場合は、みなし課税事業者の特例（消費税法11条・12条）により、本ツールの判定とは異なる結論になることがあります。要専門家確認。"
    );
  }
  if (isSpecifiedNewlyEstablishedCorporation) {
    outOfScopeReasons.push(
      "特定新規設立法人（消費税法12条の3）に該当する場合、資本金が1,000万円未満でも基準期間が無い事業年度から課税事業者になることがあります。本ツールはこの特例を判定していません。要専門家確認。"
    );
  }

  return {
    status,
    statusLabel: status === "taxable" ? "課税事業者" : "免税事業者",
    decidingRuleId: decidingStep?.ruleId ?? null,
    steps,
    requiresExpertReview: outOfScopeReasons.length > 0,
    outOfScopeReasons,
    disclaimer: TAXABLE_STATUS_DISCLAIMER,
    assumptions: [
      "基準期間は原則として、個人事業主は2年前の年、法人は2期前の事業年度です。基準期間が1年に満たない法人の年換算などの調整は行っていません。",
      "特定期間は原則として、前事業年度開始の日以後6か月の期間（個人事業主は前年1月1日〜6月30日）です。特定期間の課税売上高に代えて給与等支払額で判定する場合、納税者はいずれか有利な方を選択できます（両方が1,000万円を超える場合のみ課税事業者になります）。",
      "新設法人の資本金特例（基準期間が無い事業年度に資本金1,000万円以上で課税事業者）は法人のみに適用されます。",
      "インボイス発行事業者（適格請求書発行事業者）として登録している場合は、登録を選択している限り、他の基準にかかわらず課税事業者になります。",
      "合併・分割、特定新規設立法人、高額特定資産の取得、相続による事業承継等、本ツールが考慮していない特例に該当する場合は、判定結果が変わる可能性があります。",
    ],
  };
}
