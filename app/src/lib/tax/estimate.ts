import { CategorizedTransaction } from "../categorize/engine";
import { applyIndividualLossCarryforward, LossCarryforwardResult, PriorYearLoss } from "./lossCarryforward";

// ------------------------------------------------------------------
// 免責: これは確定申告書の正式な計算ではなく、概算シミュレーションです。
// 実際の申告にあたっては必ずご自身（または税理士）の確認を経てください。
// ------------------------------------------------------------------

const BASIC_DEDUCTION = 480_000; // 基礎控除（合計所得金額2,400万円以下）
const RECONSTRUCTION_SURTAX_RATE = 0.021; // 復興特別所得税＝基準所得税額×2.1%

/** 記帳方法: 複式簿記（貸借対照表を作成） or 簡易簿記（単式簿記） */
export type BookkeepingMethod = "double" | "simple";
/** 申告方法: e-Tax電子申告 / 優良な電子帳簿保存 / 書面提出 */
export type FilingMethod = "eTax" | "electronicBooks" | "paper";

export interface BlueReturnDeductionOptions {
  /** 記帳方法。未指定の場合は複式簿記（"double"）を仮定します（最大控除額を保証するものではありません） */
  bookkeepingMethod?: BookkeepingMethod;
  /** 申告方法。未指定の場合は書面提出（"paper"）を仮定します（65万円の要件を満たすとは仮定しません） */
  filingMethod?: FilingMethod;
}

interface BlueReturnDeductionResult {
  amount: number;
  note: string;
}

/**
 * 青色申告特別控除額を、実際の記帳方法・申告方法に基づいて決定します。
 * - 65万円: 複式簿記 かつ（e-Tax提出 または 優良な電子帳簿保存）、貸借対照表添付
 * - 55万円: 複式簿記だが、書面提出（e-Tax・電子帳簿保存の要件を満たさない）
 * - 10万円: 簡易簿記（申告方法によらず）
 *
 * オプション未指定時は、65万円を一律適用しないよう保守的に「複式簿記・書面提出＝55万円」を既定値とします。
 */
export function resolveBlueReturnDeduction(options?: BlueReturnDeductionOptions): BlueReturnDeductionResult {
  const bookkeepingMethod = options?.bookkeepingMethod ?? "double";
  const filingMethod = options?.filingMethod ?? "paper";

  if (bookkeepingMethod === "simple") {
    return {
      amount: 100_000,
      note: "青色申告特別控除10万円（簡易簿記を選択されているため）を適用しています",
    };
  }

  if (filingMethod === "eTax" || filingMethod === "electronicBooks") {
    return {
      amount: 650_000,
      note:
        filingMethod === "eTax"
          ? "青色申告特別控除65万円（複式簿記・貸借対照表添付・e-Tax提出の要件を満たす前提）を適用しています"
          : "青色申告特別控除65万円（複式簿記・貸借対照表添付・優良な電子帳簿保存の要件を満たす前提）を適用しています",
    };
  }

  return {
    amount: 550_000,
    note: "青色申告特別控除55万円（複式簿記・貸借対照表添付だが、e-Tax提出/優良な電子帳簿保存の要件は満たさない書面提出を仮定）を適用しています",
  };
}

interface IncomeTaxBracket {
  upTo: number; // この金額以下
  rate: number; // %
  deduction: number; // 円
}

// 所得税 速算表（住民税は含まない、国税庁公表の速算表ベース）
const INCOME_TAX_BRACKETS: IncomeTaxBracket[] = [
  { upTo: 1_950_000, rate: 5, deduction: 0 },
  { upTo: 3_300_000, rate: 10, deduction: 97_500 },
  { upTo: 6_950_000, rate: 20, deduction: 427_500 },
  { upTo: 9_000_000, rate: 23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 40, deduction: 2_796_000 },
  { upTo: Infinity, rate: 45, deduction: 4_796_000 },
];

/**
 * 所得税の速算表（国税庁公表ベース、住民税は含まない）を用いて、課税所得金額から
 * 所得税額と適用される限界税率を計算する。
 *
 * 事業所得のみの概算（estimateForIndividual）に加え、給与所得と合算した総合課税の
 * 概算（sideIncomeEstimate.ts、副業/給与所得+事業所得の合算課税）からも再利用するため
 * exportしている。速算表そのものの重複実装を避ける目的の追加であり、既存の計算結果・
 * 既存のexportには一切影響しない。
 */
export function calcIncomeTax(taxableIncome: number): { tax: number; rate: number } {
  if (taxableIncome <= 0) return { tax: 0, rate: 0 };
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo)!;
  const tax = Math.floor(Math.max(0, taxableIncome * (bracket.rate / 100) - bracket.deduction));
  return { tax, rate: bracket.rate };
}

/**
 * 税込金額から消費税額を抜き出す（総額表示前提）。
 * 消費税額の端数処理は円未満切り捨てが原則のため、Math.round ではなく Math.floor を用いる。
 */
function extractTax(amountInclusive: number, ratePercent: number): number {
  return Math.floor((amountInclusive * ratePercent) / (100 + ratePercent));
}

const SOCIAL_INSURANCE_ACCOUNT = "社会保険料(個人)";
const LIFE_INSURANCE_ACCOUNT = "生命保険料(個人)";

/**
 * 青色申告の純損失繰越控除（所得税法70条、翌年以後3年間）を適用するためのオプション入力。
 * 省略した場合、繰越控除は一切考慮されません（従来どおりの挙動）。
 */
export interface IndividualLossCarryforwardInput {
  /** 概算対象の年度（例: 2026）。繰越期限（3年）の判定に使用します */
  currentFiscalYear: number;
  /** 前年以前から繰り越されている未使用の純損失一覧（例: yearArchive.ts の記録から算出） */
  priorLosses: PriorYearLoss[];
}

// ------------------------------------------------------------------
// 生命保険料控除・地震保険料控除・寄附金控除・医療費控除・小規模企業共済等掛金控除
//
// これらは所得税法上の「所得控除」のうち、従来このファイルが未対応だった5項目。
// いずれもitemizedDeductionOptions（第4引数）で明示的に入力された場合にのみ計算し、
// 未入力の場合は一切考慮しない（＝lossCarryforwardOptionsと同じ、既存呼び出し元に
// 影響を与えない後方互換パターン）。
//
// 端数処理: 各計算式の途中で1円未満の端数が生じる場合、本ツールでは控除額を
// 過大に見積もらないよう保守的にMath.floor（切り捨て）を採用する。実務上は
// 切り上げとされる場合があるため、正確な金額は必ずご自身（または税理士）で確認すること。
// ------------------------------------------------------------------

const LIFE_INSURANCE_CATEGORY_CAP = 40_000; // 新制度：区分ごとの上限
const LIFE_INSURANCE_TOTAL_CAP = 120_000; // 新制度：3区分合計の上限
const EARTHQUAKE_INSURANCE_CAP = 50_000; // 地震保険料控除の上限（簡易計算・経過措置の旧長期損害保険料は非対応）
const MEDICAL_EXPENSE_DEDUCTION_CAP = 2_000_000; // 医療費控除の上限
const MEDICAL_EXPENSE_FLOOR_CAP = 100_000; // 医療費控除の足切り額の上限（10万円）
const MEDICAL_EXPENSE_INCOME_RATE = 0.05; // 足切り額の代替基準（総所得金額等の5%）
const DONATION_DEDUCTION_INCOME_RATE = 0.4; // 寄附金控除の上限（総所得金額等の40%）
const DONATION_DEDUCTION_FLOOR = 2_000; // 寄附金控除の足切り額（2,000円）

/**
 * 生命保険料控除（新制度＝2012年1月1日以後に締結した保険契約等）の区分別入力。
 *
 * 【重要な限定事項】2011年12月31日以前に締結した契約（旧制度）は、新制度とは
 * 上限額・区分（一般/個人年金の2区分のみ、上限各5万円・合計10万円）が異なるため、
 * このツールでは対応していません。旧制度の契約がある場合、この入力欄には
 * 反映せず、ご自身（または税理士）で別途確認してください。
 */
export interface LifeInsurancePremiums {
  /** 一般生命保険料（新制度）の年間払込保険料 */
  general?: number;
  /** 介護医療保険料の年間払込保険料 */
  nursingMedical?: number;
  /** 個人年金保険料（新制度）の年間払込保険料 */
  personalPension?: number;
}

/**
 * 生命保険料控除・地震保険料控除・寄附金控除・医療費控除・小規模企業共済等掛金控除を
 * 適用するためのオプション入力。省略した場合、これら5項目は一切考慮されません
 * （従来どおりの挙動）。各フィールドも個別に省略可能で、省略した項目は0円として扱います。
 */
export interface ItemizedDeductionInput {
  /** 生命保険料控除（新制度のみ対応。区分別の年間払込保険料） */
  lifeInsurancePremiums?: LifeInsurancePremiums;
  /** 地震保険料控除の対象となる年間支払保険料 */
  earthquakeInsurancePremium?: number;
  /**
   * 寄附金控除（ふるさと納税を含む）の対象となる年間寄附金の合計額。
   * ふるさと納税のワンストップ特例や住民税側の控除額（本控除は所得税のみに影響）は
   * この所得税概算の対象外。
   */
  donations?: number;
  /** 医療費控除の対象となる年間医療費の合計額（保険金等による補填前） */
  medicalExpenses?: number;
  /** 医療費控除の計算で医療費から差し引く、保険金等による補填額の合計 */
  medicalExpenseReimbursements?: number;
  /** 小規模企業共済等掛金控除（iDeCo＝個人型確定拠出年金の掛金を含む）の年間掛金合計額 */
  smallBusinessMutualAidContributions?: number;
}

export interface ItemizedDeductionResult {
  lifeInsuranceDeduction: number;
  earthquakeInsuranceDeduction: number;
  donationDeduction: number;
  medicalExpenseDeduction: number;
  smallBusinessMutualAidDeduction: number;
  /** 上記5項目の合計。taxableIncomeの計算でsocialInsuranceDeduction・基礎控除と同じグループで差し引く */
  total: number;
}

/**
 * 生命保険料控除の区分（一般/介護医療/個人年金）ごとの控除額を、新制度の速算表で計算する。
 * 年間払込保険料 ≤2万円: 全額 / ≤4万円: ×1/2+1万円 / ≤8万円: ×1/4+2万円 / それ超: 一律4万円
 */
function calcLifeInsuranceCategoryDeduction(annualPremium: number): number {
  if (annualPremium <= 0) return 0;
  if (annualPremium <= 20_000) return annualPremium;
  if (annualPremium <= 40_000) return Math.floor(annualPremium / 2) + 10_000;
  if (annualPremium <= 80_000) return Math.floor(annualPremium / 4) + 20_000;
  return LIFE_INSURANCE_CATEGORY_CAP;
}

function calcLifeInsuranceDeduction(premiums?: LifeInsurancePremiums): number {
  if (!premiums) return 0;
  const general = calcLifeInsuranceCategoryDeduction(premiums.general ?? 0);
  const nursingMedical = calcLifeInsuranceCategoryDeduction(premiums.nursingMedical ?? 0);
  const personalPension = calcLifeInsuranceCategoryDeduction(premiums.personalPension ?? 0);
  return Math.min(general + nursingMedical + personalPension, LIFE_INSURANCE_TOTAL_CAP);
}

/** 地震保険料控除。年間保険料の全額、上限5万円（ブラケットなしの単純計算） */
function calcEarthquakeInsuranceDeduction(annualPremium: number): number {
  if (annualPremium <= 0) return 0;
  return Math.min(annualPremium, EARTHQUAKE_INSURANCE_CAP);
}

/**
 * 寄附金控除（ふるさと納税を含む）。 (寄附金合計を総所得金額等の40%で頭打ち) − 2,000円。
 * ふるさと納税のワンストップ特例・住民税側の控除は住民税に影響するものであり、
 * ここで計算しているのは所得税側の寄附金控除のみ（この点は呼び出し元の注記でも明示する）。
 */
function calcDonationDeduction(donations: number, totalIncomeBase: number): number {
  if (donations <= 0) return 0;
  const incomeCap = Math.floor(Math.max(0, totalIncomeBase) * DONATION_DEDUCTION_INCOME_RATE);
  const cappedDonations = Math.min(donations, incomeCap);
  return Math.max(0, cappedDonations - DONATION_DEDUCTION_FLOOR);
}

/**
 * 医療費控除（通常の計算式のみ。セルフメディケーション税制（特例）は対象外）。
 * (医療費合計 − 保険金等の補填額) − min(10万円, 総所得金額等の5%)、上限200万円。
 */
function calcMedicalExpenseDeduction(
  medicalExpenses: number,
  reimbursements: number,
  totalIncomeBase: number
): number {
  const net = Math.max(0, medicalExpenses - Math.max(0, reimbursements));
  if (net <= 0) return 0;
  const floorAmount = Math.min(
    MEDICAL_EXPENSE_FLOOR_CAP,
    Math.floor(Math.max(0, totalIncomeBase) * MEDICAL_EXPENSE_INCOME_RATE)
  );
  return Math.max(0, Math.min(net - floorAmount, MEDICAL_EXPENSE_DEDUCTION_CAP));
}

/** 小規模企業共済等掛金控除（iDeCoを含む）。年間掛金の全額が控除額（上限なし） */
function calcSmallBusinessMutualAidDeduction(contributions: number): number {
  return Math.max(0, contributions);
}

/**
 * 5項目の所得控除をまとめて計算する。totalIncomeBaseは寄附金控除の40%上限・
 * 医療費控除の5%基準に使う「総所得金額等」相当額（このファイルでは、純損失繰越控除
 * 適用後・社会保険料控除等を差し引く前の所得金額を渡す）。
 */
function calcItemizedDeductions(
  options: ItemizedDeductionInput | undefined,
  totalIncomeBase: number
): ItemizedDeductionResult | undefined {
  if (!options) return undefined;

  const lifeInsuranceDeduction = calcLifeInsuranceDeduction(options.lifeInsurancePremiums);
  const earthquakeInsuranceDeduction = calcEarthquakeInsuranceDeduction(options.earthquakeInsurancePremium ?? 0);
  const donationDeduction = calcDonationDeduction(options.donations ?? 0, totalIncomeBase);
  const medicalExpenseDeduction = calcMedicalExpenseDeduction(
    options.medicalExpenses ?? 0,
    options.medicalExpenseReimbursements ?? 0,
    totalIncomeBase
  );
  const smallBusinessMutualAidDeduction = calcSmallBusinessMutualAidDeduction(
    options.smallBusinessMutualAidContributions ?? 0
  );

  return {
    lifeInsuranceDeduction,
    earthquakeInsuranceDeduction,
    donationDeduction,
    medicalExpenseDeduction,
    smallBusinessMutualAidDeduction,
    total:
      lifeInsuranceDeduction +
      earthquakeInsuranceDeduction +
      donationDeduction +
      medicalExpenseDeduction +
      smallBusinessMutualAidDeduction,
  };
}

export interface IndividualEstimate {
  totalIncome: number;
  totalExpense: number; // 事業の必要経費のみ（社会保険料・生命保険料等の個人的な支払いは含まない）
  businessProfit: number; // 収入 - 必要経費
  socialInsuranceDeduction: number; // 社会保険料控除（国民健康保険・国民年金など、全額控除）
  lifeInsurancePaidInfo: number; // 生命保険料の年間支払額（参考表示のみ。控除額の上限計算は未対応）
  blueReturnDeduction: number; // 青色申告特別控除額（記帳方法・申告方法に応じて65万/55万/10万円）
  /** 純損失の繰越控除の適用結果。lossCarryforwardOptions未指定の場合はundefined（従来どおり考慮しない） */
  lossCarryforward?: LossCarryforwardResult;
  /**
   * 生命保険料控除・地震保険料控除・寄附金控除・医療費控除・小規模企業共済等掛金控除の適用結果。
   * itemizedDeductionOptions未指定の場合はundefined（従来どおり考慮しない）
   */
  itemizedDeductions?: ItemizedDeductionResult;
  taxableIncome: number; // 事業所得 - 青色控除 - 純損失繰越控除 - 社会保険料控除 - 基礎控除 - (入力があれば)生命保険料控除等5項目
  incomeTax: { tax: number; marginalRate: number };
  reconstructionSurtax: number; // 復興特別所得税（所得税額×2.1%）
  totalIncomeTax: number; // 所得税及び復興特別所得税の額
  consumptionTax: {
    isLikelyExempt: boolean;
    salesTax: number;
    purchaseTax: number;
    payable: number;
  };
  assumptions: string[];
}

export function estimateForIndividual(
  rows: CategorizedTransaction[],
  options?: BlueReturnDeductionOptions,
  lossCarryforwardOptions?: IndividualLossCarryforwardInput,
  itemizedDeductionOptions?: ItemizedDeductionInput
): IndividualEstimate {
  const { amount: blueReturnDeduction, note: blueReturnDeductionNote } = resolveBlueReturnDeduction(options);

  const income = rows.filter((r) => r.amount > 0);
  const allExpense = rows.filter((r) => r.amount < 0);
  const businessExpense = allExpense.filter((r) => !r.personalDeductionOnly);

  // 借入金の実行・出資の払込み等（excludeFromIncome）は負債・純資産の増加であり、事業の
  // 収入金額ではないため、収入合計・事業所得・免税判定のいずれからも除外する。
  const businessIncome = income.filter((r) => !r.excludeFromIncome);
  const totalIncome = businessIncome.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = businessExpense.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const businessProfit = totalIncome - totalExpense;

  const socialInsuranceDeduction = allExpense
    .filter((r) => r.account === SOCIAL_INSURANCE_ACCOUNT)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const lifeInsurancePaidInfo = allExpense
    .filter((r) => r.account === LIFE_INSURANCE_ACCOUNT)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);

  // 事業所得（収入 - 必要経費 - 青色申告特別控除）。純損失の繰越控除は、この事業所得
  // （総所得金額相当額）に対して適用し、その後で社会保険料控除・基礎控除等の他の
  // 所得控除を差し引くのが正しい順序（所得税の計算構造上、繰越控除は所得控除より前）。
  const businessIncomeAfterBlueDeduction = businessProfit - blueReturnDeduction;
  const lossCarryforward = lossCarryforwardOptions
    ? applyIndividualLossCarryforward(
        lossCarryforwardOptions.currentFiscalYear,
        businessIncomeAfterBlueDeduction,
        lossCarryforwardOptions.priorLosses
      )
    : undefined;
  // lossCarryforwardOptions未指定時はlossCarryforwardがundefinedとなり、
  // incomeAfterLossCarryforwardはbusinessIncomeAfterBlueDeductionとそのまま等しくなる
  // （繰越控除がなかった従来の計算式と完全に同一の値・同一の演算になる）。
  const incomeAfterLossCarryforward = lossCarryforward
    ? lossCarryforward.incomeAfterCarryforward
    : businessIncomeAfterBlueDeduction;

  // 生命保険料控除・地震保険料控除・寄附金控除・医療費控除・小規模企業共済等掛金控除は、
  // 社会保険料控除・基礎控除と同じ「所得控除」のグループに属し、純損失繰越控除適用後の
  // 所得金額（incomeAfterLossCarryforward）から差し引く（下のtaxableIncomeの式を参照）。
  // 寄附金控除の40%上限・医療費控除の5%基準は「総所得金額等」相当額を基準とするため、
  // 同じincomeAfterLossCarryforward（0未満は0扱い）を渡す。itemizedDeductionOptions未指定時は
  // itemizedDeductionsがundefinedとなり、下のtotalは0扱いになるため、従来の計算式と完全に
  // 同一の値・同一の演算になる。
  const itemizedDeductions = calcItemizedDeductions(
    itemizedDeductionOptions,
    Math.max(0, incomeAfterLossCarryforward)
  );

  const taxableIncome = Math.max(
    0,
    Math.floor(
      (incomeAfterLossCarryforward -
        socialInsuranceDeduction -
        (itemizedDeductions?.total ?? 0) -
        BASIC_DEDUCTION) /
        1000
    ) * 1000
  );
  const { tax, rate } = calcIncomeTax(taxableIncome);
  const reconstructionSurtax = Math.floor(tax * RECONSTRUCTION_SURTAX_RATE);

  // excludeFromIncome（借入金の実行・出資の払込み等）は事業の売上ではないため、
  // taxCategoryの値に関わらず消費税の課税売上高からも除外する。ルールベース辞書では
  // excludeFromIncomeな科目は常にtaxCategory「対象外」になるため通常は影響しないが、
  // AI分類（aiEscalate.ts）はaccount名からexcludeFromIncomeを再引当てする一方でtaxCategory自体は
  // LLMの出力をそのまま使うため、両者が食い違う結果（account="借入金"だがtaxCategory="課税売上10%"等）
  // を返す可能性がある。businessIncome（excludeFromIncomeを除外済み）を使うことで、
  // そのような食い違いがあっても借入金・出資を課税売上として扱わないようにする。
  //
  // 消費税額は取引ごとに端数処理してから合算するのではなく、税率区分ごとに税込金額を
  // まず合計し、その合計額に対して1回だけ端数処理（円未満切り捨て）する（consumptionTaxForm.ts の
  // 「割戻し計算」と同じ考え方）。取引ごとに端数処理してから合算すると、個々の端数処理誤差が
  // 積み重なり、本来の税額からずれてしまう（例: 105円・115円の売上2件は取引ごとの切り捨てだと
  // 9円+10円=19円になるが、合計220円を1回だけ切り捨てると正しくは20円になる）。
  const salesInclusive10 = businessIncome
    .filter((r) => r.taxCategory === "課税売上10%")
    .reduce((sum, r) => sum + r.amount, 0);
  const salesTax10 = extractTax(salesInclusive10, 10);

  const purchaseInclusive10 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入10%")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax10 = extractTax(purchaseInclusive10, 10);
  const purchaseInclusive8 = businessExpense
    .filter((r) => r.taxCategory === "課税仕入8%(軽減)")
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const purchaseTax8 = extractTax(purchaseInclusive8, 8);

  const isLikelyExempt = totalIncome <= 10_000_000;

  return {
    totalIncome,
    totalExpense,
    businessProfit,
    socialInsuranceDeduction,
    lifeInsurancePaidInfo,
    blueReturnDeduction,
    lossCarryforward,
    itemizedDeductions,
    taxableIncome,
    incomeTax: { tax, marginalRate: rate },
    reconstructionSurtax,
    totalIncomeTax: tax + reconstructionSurtax,
    consumptionTax: {
      isLikelyExempt,
      salesTax: salesTax10,
      purchaseTax: purchaseTax10 + purchaseTax8,
      payable: Math.max(0, salesTax10 - (purchaseTax10 + purchaseTax8)),
    },
    assumptions: [
      blueReturnDeductionNote,
      // itemizedDeductionOptions省略時（従来どおりの呼び出し）は、この2行を含め本配列全体が
      // 変更前と完全に同一のテキスト・同一の並びになる（後方互換性の確認は
      // estimate.test.ts の「新オプション省略時に変更前と完全に一致する」テストを参照）。
      itemizedDeductionOptions
        ? "社会保険料控除（国民健康保険・国民年金等の全額）と基礎控除48万円は必ず考慮します。生命保険料控除・地震保険料控除・寄附金控除（ふるさと納税を含む）・医療費控除・小規模企業共済等掛金控除（iDeCoを含む）は、入力があればあわせて概算に加味します。扶養控除・配偶者控除等その他の所得控除は含みません"
        : "社会保険料控除（国民健康保険・国民年金等の全額）と基礎控除48万円のみ考慮し、生命保険料控除・扶養控除等の他の所得控除は含みません",
      itemizedDeductionOptions
        ? "取引データから検出した生命保険料の支払額（lifeInsurancePaidInfo）は参考表示のみです。生命保険料控除額へ反映するには、区分別（一般・介護医療・個人年金）の年間払込保険料を入力してください"
        : "生命保険料の支払いは参考表示のみで、生命保険料控除額（上限あり）の自動計算は行っていません",
      ...(itemizedDeductions
        ? [
            itemizedDeductions.lifeInsuranceDeduction > 0
              ? `生命保険料控除として${itemizedDeductions.lifeInsuranceDeduction.toLocaleString("ja-JP")}円を所得から控除しています（新制度＝2012年1月1日以後に締結した契約の一般・介護医療・個人年金の3区分に基づく概算、合計上限12万円）。2011年12月31日以前に締結した契約（旧制度、区分・上限が異なる）は含まれていないため、該当する契約がある場合は控除額を過小に見積もっている可能性があります。必ずご自身（または税理士）で確認してください`
              : "生命保険料控除は考慮していません（区分別の年間払込保険料が入力されていないため）。なお本ツールは新制度（2012年以降の契約）のみに対応しており、2011年以前の契約（旧制度）には対応していません",
            itemizedDeductions.earthquakeInsuranceDeduction > 0
              ? `地震保険料控除として${itemizedDeductions.earthquakeInsuranceDeduction.toLocaleString("ja-JP")}円を所得から控除しています（年間支払保険料の全額、上限5万円）`
              : "地震保険料控除は考慮していません（年間支払保険料が入力されていないため）",
            itemizedDeductions.donationDeduction > 0
              ? `寄附金控除（ふるさと納税を含む）として${itemizedDeductions.donationDeduction.toLocaleString("ja-JP")}円を所得から控除しています（寄附金合計額から2,000円を差し引き、総所得金額等の40%を上限とした概算）。ふるさと納税のワンストップ特例や住民税側の控除額は住民税に影響するものであり、この所得税概算には反映されていません`
              : "寄附金控除（ふるさと納税を含む）は考慮していません（年間寄附金合計額が入力されていないため）",
            itemizedDeductions.medicalExpenseDeduction > 0
              ? `医療費控除として${itemizedDeductions.medicalExpenseDeduction.toLocaleString("ja-JP")}円を所得から控除しています（医療費合計から保険金等の補填額と、10万円または総所得金額等の5%のいずれか低い方を差し引いた概算、上限200万円）。セルフメディケーション税制（特例）による計算は行っていません`
              : "医療費控除は考慮していません（医療費合計額が入力されていないため）。なお本ツールは通常の医療費控除のみに対応しており、セルフメディケーション税制（特例）には対応していません",
            itemizedDeductions.smallBusinessMutualAidDeduction > 0
              ? `小規模企業共済等掛金控除（iDeCoを含む）として${itemizedDeductions.smallBusinessMutualAidDeduction.toLocaleString("ja-JP")}円を所得から控除しています（年間掛金の全額、上限なし）`
              : "小規模企業共済等掛金控除（iDeCoを含む）は考慮していません（年間掛金合計額が入力されていないため）",
          ]
        : []),
      "消費税は金額を税込として扱い、税率から逆算した概算です（簡易課税は考慮していません）",
      "課税売上高が1,000万円以下の場合、基準期間の実績次第で免税事業者となる可能性があります",
      "住民税・事業税は含まれていません",
      lossCarryforward
        ? `青色申告の純損失の繰越控除（翌年以後3年間）として${lossCarryforward.totalDeduction.toLocaleString("ja-JP")}円を所得から控除しています。入力された前年以前の繰越損失額に基づく概算であり、期限切れ・控除額の最終確認は必ずご自身（または税理士）で行ってください${
            lossCarryforward.notes.length > 0 ? "。" + lossCarryforward.notes.join("。") : ""
          }`
        : "青色申告の純損失の繰越控除（前年以前3年間の赤字の繰越）は考慮していません。過去に赤字（純損失）があり繰越控除の適用を受けたい場合は、繰越損失データを入力してください",
    ],
  };
}
