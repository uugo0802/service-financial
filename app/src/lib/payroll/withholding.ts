// ------------------------------------------------------------------
// 免責: これはマイクロ法人の一人代表（役員）が自身に支払う毎月の役員報酬・給与に
// ついて、給与所得の源泉徴収税額の「目安」を機械的に計算する概算シミュレーションです。
//
// 国税庁が公表する「給与所得の源泉徴収税額表（月額表）」の甲欄（扶養控除等申告書を
// 提出している場合）は、実際には「その月の社会保険料等控除後の給与等の金額」を
// 1,000円刻みの数百行に区分し、さらに扶養親族等の数（0人〜7人、8人以上は別途加算）
// ごとに列を分けた、非常に細かい早見表です。
//
// このモジュールはその表を丸ごと埋め込む代わりに、
//   1) 社会保険料等控除後の金額から、扶養親族等の数に応じた概算控除額を差し引き、
//   2) 実際の月額表がおおむね右肩上がりの累進構造になっていることに着目し、
//      国税庁が高額な給与・賞与等に対する源泉徴収税額の算出で実際に用いている
//      速算式の税率（5.105%・10.21%・20.42%・30.63%・40.84%・45.945%）を用いた
//      区分ごとの速算式（≒所得税の速算表と同じ形式）で近似する
// という「ブラケット近似式」で概算値を算出します。1,000円刻みの実際の表とは
// 端数が生じるため、正式な源泉徴収額・年末調整・法定調書の作成には必ず
// 国税庁公表の最新の「給与所得の源泉徴収税額表」を参照してください
// （https://www.nta.go.jp/ 「源泉徴収税額表」で検索）。
//
// このツールは税額計算の下書き・参考値を示すのみであり、税理士法上の
// 税務代理・税務書類の作成・個別具体的な税務相談には該当しません。
// ------------------------------------------------------------------

/**
 * 復興特別所得税について:
 * 給与所得に対する源泉徴収（月額表・日額表・賞与に対する源泉徴収税額表のいずれも）は、
 * 国税庁が公表する税額表・税率自体にすでに復興特別所得税（所得税額×2.1%）が
 * 織り込まれています（表に記載の税額をそのまま徴収すればよく、別途2.1%を
 * 上乗せして計算する必要はありません）。そのため、以下の速算表の税率は
 * 「所得税率×1.021」で復興特別所得税を織り込み済みの値とし、本モジュールの
 * 出力する withholdingTax にも復興特別所得税を別建てで加算していません
 * （二重計上を避けるため）。
 */
const RECONSTRUCTION_SURTAX_NOTE =
  "源泉徴収税額表（月額表）の税率にはあらかじめ復興特別所得税（所得税額×2.1%）が織り込まれているため、本ツールが表示する源泉徴収税額に復興特別所得税を別途上乗せする必要はありません（二重計上防止のため、本ツールの税率も復興特別所得税込みの数値を使用しています）";

/** 甲欄（扶養控除等申告書を提出している）で源泉徴収税額が発生し始める、社会保険料等控除後の金額のおおよその下限 */
const MIN_TAXABLE_BASE = 88_000;

/**
 * 扶養親族等1人あたりの概算控除額（月額）。
 * 実際の月額表は扶養親族等の数が1人増えるごとに、税額表の「行」がずれる形で
 * 控除効果が反映されますが、その効果は概ね扶養控除（所得税、38万円/年）を
 * 12ヶ月で割った金額（約31,667円/月）を課税ベースから差し引くのと近い挙動になります。
 * 本モジュールではこれを32,000円/月として近似します（配偶者控除等の細かい区分の
 * 違いは考慮しません）。
 */
const PER_DEPENDENT_MONTHLY_DEDUCTION = 32_000;

interface WithholdingBracket {
  /** この金額以下の場合に適用される区分（社会保険料等控除後の金額から扶養控除相当額を差し引いた後の金額、円） */
  upTo: number;
  /** 税率（%）。復興特別所得税を織り込み済み（例: 所得税率10% → 10.21%） */
  rate: number;
  /** 速算表の控除額（円）。tax = base * rate/100 - deduction */
  deduction: number;
}

// 国税庁公表の高額給与等に対する源泉徴収税額の速算式で使われる折込税率
// （5.105%・10.21%・20.42%・30.63%・40.84%・45.945%）を流用し、区分の境界で
// 税額が連続するように控除額（deduction）を逆算した近似速算表。
// 「月額表」そのものの1,000円刻みの区分・境界値ではないため、実額とは
// 数百円〜数千円程度のずれが生じ得る概算値です。
const WITHHOLDING_BRACKETS: WithholdingBracket[] = [
  { upTo: MIN_TAXABLE_BASE, rate: 0, deduction: 0 },
  { upTo: 300_000, rate: 5.105, deduction: 4_492.4 },
  { upTo: 550_000, rate: 10.21, deduction: 19_807.4 },
  { upTo: 1_000_000, rate: 20.42, deduction: 75_962.4 },
  { upTo: 2_000_000, rate: 30.63, deduction: 178_062.4 },
  { upTo: 3_500_000, rate: 40.84, deduction: 382_262.4 },
  { upTo: Infinity, rate: 45.945, deduction: 560_937.4 },
];

export interface WithholdingInput {
  /** その月の役員報酬・給与の総支給額（円） */
  monthlyGrossCompensation: number;
  /** 扶養親族等の数（甲欄。0以上の整数。7人を超える入力も可） */
  dependentCount: number;
  /** その月に控除する健康保険・厚生年金保険料等（社会保険料）の合計額（円） */
  insurancePremium: number;
}

export interface WithholdingResult {
  monthlyGrossCompensation: number;
  insurancePremium: number;
  /** 社会保険料等控除後の金額（月額表の甲欄を参照する際の基準額） */
  taxableBase: number;
  dependentCount: number;
  /** 扶養親族等の数に応じて課税ベースから差し引いた概算控除額 */
  dependentDeductionApplied: number;
  /** 源泉徴収税額（月額、円未満切り捨て）。復興特別所得税を織り込み済みで、別途加算はしない */
  withholdingTax: number;
  /** 差引支給額の概算（総支給額 - 社会保険料 - 源泉徴収税額。住民税等その他の控除は考慮しない） */
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

/** 区分ごとの速算式（base * rate/100 - deduction）で源泉徴収税額を計算し、円未満を切り捨てる */
function calcWithholdingTax(adjustedBase: number): number {
  if (adjustedBase <= 0) return 0;
  const bracket = WITHHOLDING_BRACKETS.find((b) => adjustedBase <= b.upTo)!;
  if (bracket.rate === 0) return 0;
  return Math.floor(Math.max(0, (adjustedBase * bracket.rate) / 100 - bracket.deduction));
}

/**
 * 月額の役員報酬・給与から、給与所得の源泉徴収税額（月額表・甲欄）の概算値を計算する。
 *
 * 一人社長のマイクロ法人が毎月自分自身に役員報酬を支払う場合、会社側に
 * 源泉徴収・納付義務が生じる（原則翌月10日までに納付。ただし従業員が常時10人未満の
 * 場合は「源泉所得税の納期の特例」により年2回にまとめて納付可能）。この関数は
 * その月次の源泉徴収額の目安を示すのみで、実際の納付手続き・年末調整の
 * 計算までは行わない。
 *
 * @throws 入力が数値でない、または0未満の場合
 */
export function calculateMonthlyWithholding(input: WithholdingInput): WithholdingResult {
  const { monthlyGrossCompensation, dependentCount, insurancePremium } = input;

  assertFiniteNonNegative(monthlyGrossCompensation, "月額の役員報酬・給与");
  assertFiniteNonNegative(insurancePremium, "社会保険料");
  assertFiniteNonNegative(dependentCount, "扶養親族等の数");
  if (!Number.isInteger(dependentCount)) {
    throw new Error("扶養親族等の数は整数で入力してください。");
  }
  if (insurancePremium > monthlyGrossCompensation) {
    throw new Error("社会保険料は月額の役員報酬・給与の総支給額を超えることはできません。");
  }

  const taxableBase = monthlyGrossCompensation - insurancePremium;
  const requestedDependentDeduction = dependentCount * PER_DEPENDENT_MONTHLY_DEDUCTION;
  const dependentDeductionApplied = Math.min(taxableBase, requestedDependentDeduction);
  const adjustedBase = Math.max(0, taxableBase - dependentDeductionApplied);

  const withholdingTax = calcWithholdingTax(adjustedBase);
  const netPay = monthlyGrossCompensation - insurancePremium - withholdingTax;

  return {
    monthlyGrossCompensation,
    insurancePremium,
    taxableBase,
    dependentCount,
    dependentDeductionApplied,
    withholdingTax,
    netPay,
    assumptions: [
      "国税庁公表の「給与所得の源泉徴収税額表（月額表）」甲欄（扶養控除等申告書を提出している前提）を、1,000円刻みの実表ではなく区分ごとの速算式で近似した概算値です。実額とは数百円〜数千円程度ずれる場合があります",
      RECONSTRUCTION_SURTAX_NOTE,
      `扶養親族等1人あたり月額${PER_DEPENDENT_MONTHLY_DEDUCTION.toLocaleString("ja-JP")}円を課税ベースから差し引く近似を用いています（配偶者控除・障害者控除等の細かい区分の違いは考慮しません）`,
      "社会保険料（健康保険・厚生年金保険料等）は入力された金額をそのまま控除し、標準報酬月額表からの算定は行いません（別途ご自身で算定した金額を入力してください）",
      "住民税の特別徴収・財形貯蓄・その他の給与控除項目は一切考慮していません。差引支給額（netPay）は源泉所得税と社会保険料のみを控除した概算値です",
      "年末調整（各種所得控除の反映・過不足税額の精算）は対象外です。年間の源泉徴収税額を確定させるものではありません",
      "本ツールは源泉徴収税額の目安を示す試算であり、税務代理・税務書類の作成・個別具体的な税務相談には該当しません。実際の源泉徴収・納付にあたっては必ず国税庁公表の最新の税額表をご確認ください",
    ],
  };
}
