import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 「消費税及び地方消費税の申告書」（第一表・一般用）の欄番号に沿った概算計算。
// 標準税率10%＝国税7.8％＋地方消費税2.2％、軽減税率8%＝国税6.24％＋地方消費税1.76％
// という内訳で、国税庁の様式にある番号（①②④⑦⑨⑱⑳㉖など）に対応させている。
// 簡易課税・中間納付・貸倒れ等は考慮していない概算です。
// ------------------------------------------------------------------

const NATIONAL_STANDARD = 7.8; // +地方消費税2.2%で合計10%
const NATIONAL_REDUCED = 6.24; // +地方消費税1.76%で合計8%

function round1000Down(n: number): number {
  return Math.floor(n / 1000) * 1000;
}
function round100Down(n: number): number {
  return Math.floor(n / 100) * 100;
}

/**
 * 税込金額から「税率のうち国税部分」「地方消費税部分」を分けて抜き出す。
 * 消費税額の計算は円未満切り捨て（国税庁の税額計算における端数処理の原則）のため、
 * Math.round ではなく Math.floor を用いる。四捨五入すると、切り捨てを前提とする
 * round1000Down/round100Down との整合が取れず、①課税標準額や⑨差引税額といった
 * 後続の欄が本来の額より過大に計算されてしまう。
 */
function splitTax(amountInclusive: number, combinedRate: number, nationalRate: number) {
  const totalTax = Math.floor((amountInclusive * combinedRate) / (100 + combinedRate));
  const national = Math.floor((totalTax * nationalRate) / combinedRate);
  const local = totalTax - national;
  return { totalTax, national, local };
}

export interface ConsumptionTaxForm {
  // ①課税標準額（税抜き、1,000円未満切り捨て）
  taxStandardBase: number;
  // ②消費税額（課税標準額に対する消費税額＝国税部分）
  taxOnSales: number;
  // ④控除対象仕入税額（仕入に係る消費税額の国税部分）
  deductibleInputTax: number;
  // ⑦控除税額小計（＝④、他の控除項目は未対応）
  deductionSubtotal: number;
  // ⑨差引税額（②-⑦、100円未満切り捨て、マイナスの場合は還付）
  nationalTaxDue: number;
  // ⑱地方消費税の課税標準となる消費税額（＝⑨）
  localTaxBase: number;
  // ⑳（㉒）納付譲渡割額（地方消費税額、⑱×22/78、100円未満切り捨て）
  localTaxDue: number;
  // ㉖消費税及び地方消費税の合計（納付）税額
  totalDue: number;
  isLikelyExempt: boolean;
}

interface SalesAndGeneralPurchaseTax {
  taxStandardBase: number;
  taxOnSales: number;
  generalDeductibleInputTax: number;
  totalIncome: number;
}

/** 売上に係る消費税額（②）と、原則課税の場合の実額仕入税額控除を集計する共通部分 */
function computeSalesAndGeneralPurchaseTax(rows: CategorizedTransaction[]): SalesAndGeneralPurchaseTax {
  // 借入金の実行・出資の払込み等（excludeFromIncome）は課税売上高ではないため、免税判定の
  // 基準となる totalIncome から除外する（②消費税額・①課税標準額は taxCategory で別途絞り
  // 込んでいるため、こちらは元々借入・出資の影響を受けない）。
  const income = rows.filter((r) => r.amount > 0 && !r.excludeFromIncome);
  const expense = rows.filter((r) => r.amount < 0 && !r.personalDeductionOnly);

  let salesNational = 0;
  let salesTaxableBase = 0;
  for (const r of income) {
    if (r.taxCategory === "課税売上10%") {
      const { totalTax, national } = splitTax(r.amount, 10, NATIONAL_STANDARD);
      salesNational += national;
      salesTaxableBase += r.amount - totalTax;
    }
  }

  let purchaseNational = 0;
  for (const r of expense) {
    const abs = Math.abs(r.amount);
    if (r.taxCategory === "課税仕入10%") {
      purchaseNational += splitTax(abs, 10, NATIONAL_STANDARD).national;
    } else if (r.taxCategory === "課税仕入8%(軽減)") {
      purchaseNational += splitTax(abs, 8, NATIONAL_REDUCED).national;
    }
  }

  return {
    taxStandardBase: round1000Down(salesTaxableBase),
    taxOnSales: salesNational,
    generalDeductibleInputTax: purchaseNational,
    totalIncome: income.reduce((s, r) => s + r.amount, 0),
  };
}

export function buildConsumptionTaxForm(rows: CategorizedTransaction[]): ConsumptionTaxForm {
  const { taxStandardBase, taxOnSales, generalDeductibleInputTax, totalIncome } =
    computeSalesAndGeneralPurchaseTax(rows);

  const deductibleInputTax = generalDeductibleInputTax;
  const deductionSubtotal = deductibleInputTax;
  const nationalTaxDue = Math.max(0, round100Down(taxOnSales - deductionSubtotal));
  const localTaxBase = nationalTaxDue;
  const localTaxDue = Math.max(0, round100Down((localTaxBase * 22) / 78));

  return {
    taxStandardBase,
    taxOnSales,
    deductibleInputTax,
    deductionSubtotal,
    nationalTaxDue,
    localTaxBase,
    localTaxDue,
    totalDue: nationalTaxDue + localTaxDue,
    isLikelyExempt: totalIncome <= 10_000_000,
  };
}

// ------------------------------------------------------------------
// フェーズ2拡張: 簡易課税・2割特例（インボイス経過措置）にも対応した、
// 第一表に加えて第二表（課税標準額等の内訳書）と付表（簡易課税制度用／
// 2割特例）まで含めた下書きデータの生成。
// 上の buildConsumptionTaxForm（原則課税の概算試算のみ）は既存の呼び出し元・
// テストへの後方互換のためそのまま残し、この関数は別関数として追加する。
// 事業を複数区分にまたがって営む場合の按分計算（簡易課税）や、軽減税率の
// 売上（現在の分類辞書に軽減税率売上の区分が存在しない）には対応していない。
// ------------------------------------------------------------------

export type ConsumptionTaxMethod = "general" | "simplified" | "twentyPercentSpecial";

export type SimplifiedBusinessCategory = 1 | 2 | 3 | 4 | 5 | 6;

/** 簡易課税制度のみなし仕入率（事業区分別、国税庁公表の率） */
export const DEEMED_PURCHASE_RATES: Record<SimplifiedBusinessCategory, number> = {
  1: 0.9,
  2: 0.8,
  3: 0.7,
  4: 0.6,
  5: 0.5,
  6: 0.4,
};

export const SIMPLIFIED_BUSINESS_CATEGORY_LABELS: Record<SimplifiedBusinessCategory, string> = {
  1: "第一種事業（卸売業）",
  2: "第二種事業（小売業等）",
  3: "第三種事業（製造業・建設業等）",
  4: "第四種事業（飲食店業等、第一・二・三・五・六種以外）",
  5: "第五種事業（サービス業・運輸通信業・金融保険業等）",
  6: "第六種事業（不動産業）",
};

const DEFAULT_SIMPLIFIED_BUSINESS_CATEGORY: SimplifiedBusinessCategory = 5;

// 2割特例: インボイス発行事業者登録により免税事業者から課税事業者になった者向けの
// 経過措置。みなし仕入率一律80%相当（＝納税額は売上に係る消費税額の2割）。
// 対象期間は令和5年10月1日〜令和8年9月30日を含む課税期間まで。
const TWENTY_PERCENT_SPECIAL_DEEMED_RATE = 0.8;

export interface ConsumptionTaxRateBreakdown {
  taxableBase: number; // 課税資産の譲渡等の対価の額（税抜、当該税率分）
  tax: number; // 消費税額（国税部分、当該税率分）
}

export interface ConsumptionTaxSecondTableForm {
  // 第二表：課税標準額等の内訳書
  standardRate: ConsumptionTaxRateBreakdown; // 税率10%分
  reducedRate: ConsumptionTaxRateBreakdown; // 税率8%（軽減）分
  taxStandardBaseTotal: number; // ⑤ 合計（1,000円未満切り捨て後）
  taxOnSalesTotal: number; // ⑪ 消費税額合計
}

export interface SimplifiedTaxationAppendix {
  // 付表（簡易課税制度用）：事業区分・みなし仕入率による控除対象仕入税額の計算
  businessCategory: SimplifiedBusinessCategory;
  businessCategoryLabel: string;
  deemedPurchaseRate: number;
  deductibleInputTax: number;
}

export interface TwentyPercentSpecialAppendix {
  // 2割特例による控除対象仕入税額の計算（インボイス関連経過措置）
  deemedPurchaseRate: number;
  deductibleInputTax: number;
}

export interface ConsumptionTaxOptions {
  method?: ConsumptionTaxMethod; // 既定は "general"（原則課税）
  // method: "simplified" の場合の事業区分。省略時は第五種（サービス業等）を仮定。
  simplifiedBusinessCategory?: SimplifiedBusinessCategory;
}

export interface ConsumptionTaxReturnForm extends ConsumptionTaxForm {
  method: ConsumptionTaxMethod;
  secondTable: ConsumptionTaxSecondTableForm;
  simplifiedAppendix?: SimplifiedTaxationAppendix;
  twentyPercentSpecialAppendix?: TwentyPercentSpecialAppendix;
}

export function buildConsumptionTaxReturnForm(
  rows: CategorizedTransaction[],
  options: ConsumptionTaxOptions = {}
): ConsumptionTaxReturnForm {
  const method = options.method ?? "general";
  const { taxStandardBase, taxOnSales, generalDeductibleInputTax, totalIncome } =
    computeSalesAndGeneralPurchaseTax(rows);

  // 現状の分類辞書には軽減税率対象の売上区分（課税売上8%）が存在しないため、
  // 軽減税率分の課税標準額・消費税額は常に0円になる。
  const secondTable: ConsumptionTaxSecondTableForm = {
    standardRate: { taxableBase: taxStandardBase, tax: taxOnSales },
    reducedRate: { taxableBase: 0, tax: 0 },
    taxStandardBaseTotal: taxStandardBase,
    taxOnSalesTotal: taxOnSales,
  };

  let deductibleInputTax = generalDeductibleInputTax;
  let simplifiedAppendix: SimplifiedTaxationAppendix | undefined;
  let twentyPercentSpecialAppendix: TwentyPercentSpecialAppendix | undefined;

  if (method === "simplified") {
    const businessCategory = options.simplifiedBusinessCategory ?? DEFAULT_SIMPLIFIED_BUSINESS_CATEGORY;
    const deemedPurchaseRate = DEEMED_PURCHASE_RATES[businessCategory];
    deductibleInputTax = Math.floor(taxOnSales * deemedPurchaseRate);
    simplifiedAppendix = {
      businessCategory,
      businessCategoryLabel: SIMPLIFIED_BUSINESS_CATEGORY_LABELS[businessCategory],
      deemedPurchaseRate,
      deductibleInputTax,
    };
  } else if (method === "twentyPercentSpecial") {
    deductibleInputTax = Math.floor(taxOnSales * TWENTY_PERCENT_SPECIAL_DEEMED_RATE);
    twentyPercentSpecialAppendix = {
      deemedPurchaseRate: TWENTY_PERCENT_SPECIAL_DEEMED_RATE,
      deductibleInputTax,
    };
  }

  const deductionSubtotal = deductibleInputTax;
  const nationalTaxDue = Math.max(0, round100Down(taxOnSales - deductionSubtotal));
  const localTaxBase = nationalTaxDue;
  const localTaxDue = Math.max(0, round100Down((localTaxBase * 22) / 78));

  return {
    taxStandardBase,
    taxOnSales,
    deductibleInputTax,
    deductionSubtotal,
    nationalTaxDue,
    localTaxBase,
    localTaxDue,
    totalDue: nationalTaxDue + localTaxDue,
    isLikelyExempt: totalIncome <= 10_000_000,
    method,
    secondTable,
    simplifiedAppendix,
    twentyPercentSpecialAppendix,
  };
}
