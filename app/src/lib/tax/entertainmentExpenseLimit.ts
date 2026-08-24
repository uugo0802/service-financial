// ------------------------------------------------------------------
// 法人の交際費等の損金不算入額計算（租税特別措置法61条の4）
//
// 資本金1億円以下の中小法人は、各事業年度の交際費等について、次の(a)(b)のうち
// 有利な方（損金算入額が大きい方）を選択して損金に算入できます。
//   (a) 定額控除限度額: 年800万円まで全額損金算入（超える部分は全額損金不算入）
//   (b) 接待飲食費の50%相当額を損金算入（接待飲食費の内数のみが対象。上限なし）
// このモジュールは、この二択のうち有利な方を機械的に判定し、損金算入額・
// 損金不算入額（別表四での加算対象額）を計算する、corporateEstimate.tsとは独立した
// 参考計算機です（corporateEstimate.tsの計算には組み込みません。結果は利用者が
// 自身の申告検討の中で手動で反映することを想定しています）。
//
// 対応していない・簡略化している点（コメントとして明示）:
// - 資本金1億円超100億円以下の法人（接待飲食費50%枠のみで、定額控除限度額の
//   選択はできない）は対象外です。本モジュールは資本金1億円以下の中小法人のみを
//   前提とします。
// - 1人当たり5,000円以下の飲食費（一定の書類の保存等の要件を満たすもの）は、
//   そもそも交際費等に該当せず全額損金算入できます（措置法61条の4第6項）。
//   本モジュールはこの判定を内部では行わず、入力する totalEntertainmentExpense /
//   entertainmentMealExpense は、いずれもこの5,000円基準による除外を適用した
//   「後」の金額（＝交際費等に該当する金額）を入力する前提とします。
// - 資本金の判定（資本金1億円以下かどうか）自体は本モジュールの対象外です。
//   利用者が自社が中小法人に該当することを確認したうえで利用してください。
// - 接待飲食費に該当するかどうかの判定（社内飲食費の除外要件、書類の保存要件等）
//   自体も本モジュールの対象外です。entertainmentMealExpense には、既に接待飲食費
//   として整理済みの金額を入力してください。
// ------------------------------------------------------------------

/** 定額控除限度額（12か月の事業年度の場合の年額） */
export const FIXED_DEDUCTION_LIMIT_ANNUAL = 8_000_000;

/** 定額控除限度額の月割り計算の基準となる月数（12か月） */
export const FIXED_DEDUCTION_LIMIT_STANDARD_MONTHS = 12;

/** 接待飲食費のうち損金算入できる割合（50%） */
export const ENTERTAINMENT_MEAL_DEDUCTION_RATE = 0.5;

export interface EntertainmentExpenseLimitInput {
  /**
   * 交際費等の合計額（円）。1人当たり5,000円以下の飲食費など、そもそも交際費等に
   * 該当しない金額は含めずに入力してください（ファイル冒頭のコメント参照）。
   */
  totalEntertainmentExpense: number;
  /**
   * 交際費等のうち、接待飲食費（取引先等との飲食その他これに類する行為のために要する
   * 費用で、社内飲食費を除いたもの）に該当する金額（円、totalEntertainmentExpenseの内数）。
   * totalEntertainmentExpense以下である必要があります。
   */
  entertainmentMealExpense: number;
  /**
   * 事業年度の月数。通常は12。1か月未満の端数がある場合は1か月として切り上げてください
   * （本関数内部でも念のため小数を切り上げます。例: 11.2か月 → 12か月として計算）。
   */
  fiscalYearMonths: number;
}

export type EntertainmentExpenseFavorableOption = "fixed_deduction_limit" | "half_of_entertainment_meal_expense";

export interface EntertainmentExpenseLimitResult {
  input: EntertainmentExpenseLimitInput;
  /** 定額控除限度額の計算に用いた、1か月未満切り上げ後の事業年度の月数（上限12） */
  roundedFiscalYearMonths: number;
  /** (a) 定額控除限度額（月割り後、円未満切り捨て）。800万円 × 月数(切り上げ) ÷ 12 */
  fixedDeductionLimit: number;
  /** (a)を採用した場合の損金算入額 = min(totalEntertainmentExpense, fixedDeductionLimit) */
  fixedDeductionDeductibleAmount: number;
  /** (b) 接待飲食費の50%相当額（円未満切り捨て）。上限（キャップ）はありません */
  halfOfEntertainmentMealExpenseAmount: number;
  /** (a)(b)のうち、損金算入額がより大きい（有利な）方 */
  favorableOption: EntertainmentExpenseFavorableOption;
  /** 有利な方を採用した場合の損金算入額 */
  deductibleAmount: number;
  /** 有利な方を採用した場合の損金不算入額（法人税申告書 別表四で所得に加算する金額） */
  nonDeductibleAmount: number;
  notes: string[];
  disclaimer: string;
}

export const ENTERTAINMENT_EXPENSE_LIMIT_DISCLAIMER =
  "この計算結果は、資本金1億円以下の中小法人を前提とした、交際費等の損金不算入額（租税特別措置法61条の4）に関する一般的なルールに基づく簡易シミュレーションであり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。1人当たり5,000円以下の飲食費の判定、接待飲食費の該当性判定、資本金1億円超の法人への適用の可否など、本ツールが考慮していない論点により、実際の金額が変わる可能性があります。最終的な金額・申告内容は、必ず税理士等の専門家にご確認ください。";

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/**
 * 浮動小数点の丸め誤差（例: 8000000 * 6 / 12 が 4000000.0000000005 のような値になる）を
 * 吸収するための、ごくわずかな余裕を持たせた円単位の切り捨て（depreciation.tsのfloorYenと同じ考え方）。
 */
function floorYen(amount: number): number {
  return Math.floor(amount + 1e-6);
}

/**
 * 事業年度の月数を、1か月未満切り上げの整数値にする（depreciation.tsの月割りロジックと同じ考え方）。
 * 浮動小数点の表現誤差（例: 12がわずかに12未満の値として渡ってくるケース）を吸収するため、
 * 切り上げ前にごくわずかな余裕（イプシロン）を差し引く。
 */
function roundUpFiscalYearMonths(fiscalYearMonths: number): number {
  return Math.ceil(fiscalYearMonths - 1e-9);
}

/**
 * 交際費等の損金不算入額を計算する。
 *
 * (a) 定額控除限度額（年800万円、事業年度が12か月未満の場合は月割り・1か月未満切り上げ）と、
 * (b) 接待飲食費の50%相当額（上限なし）を両方計算し、損金算入額がより大きい方（有利な方）を
 * 採用した場合の損金算入額・損金不算入額を返す。同額の場合は(a)定額控除限度額を採用したものとして扱う
 * （どちらを選んでも損金算入額は変わらないため、結果への影響はない）。
 */
export function calculateEntertainmentExpenseLimit(
  input: EntertainmentExpenseLimitInput
): EntertainmentExpenseLimitResult {
  assertFiniteNonNegative(input.totalEntertainmentExpense, "交際費等の合計額");
  assertFiniteNonNegative(input.entertainmentMealExpense, "接待飲食費の額");
  if (input.entertainmentMealExpense > input.totalEntertainmentExpense) {
    throw new Error("接待飲食費の額は、交際費等の合計額以下で入力してください。");
  }
  if (!Number.isFinite(input.fiscalYearMonths) || input.fiscalYearMonths <= 0) {
    throw new Error("事業年度の月数は0より大きい数値で入力してください。");
  }
  if (input.fiscalYearMonths > FIXED_DEDUCTION_LIMIT_STANDARD_MONTHS) {
    throw new Error("事業年度の月数は12以下で入力してください。");
  }

  const roundedFiscalYearMonths = Math.min(
    roundUpFiscalYearMonths(input.fiscalYearMonths),
    FIXED_DEDUCTION_LIMIT_STANDARD_MONTHS
  );

  const fixedDeductionLimit = floorYen(
    (FIXED_DEDUCTION_LIMIT_ANNUAL * roundedFiscalYearMonths) / FIXED_DEDUCTION_LIMIT_STANDARD_MONTHS
  );
  const fixedDeductionDeductibleAmount = Math.min(input.totalEntertainmentExpense, fixedDeductionLimit);

  const halfOfEntertainmentMealExpenseAmount = floorYen(
    input.entertainmentMealExpense * ENTERTAINMENT_MEAL_DEDUCTION_RATE
  );

  const favorableOption: EntertainmentExpenseFavorableOption =
    halfOfEntertainmentMealExpenseAmount > fixedDeductionDeductibleAmount
      ? "half_of_entertainment_meal_expense"
      : "fixed_deduction_limit";

  const deductibleAmount =
    favorableOption === "half_of_entertainment_meal_expense"
      ? halfOfEntertainmentMealExpenseAmount
      : fixedDeductionDeductibleAmount;
  const nonDeductibleAmount = input.totalEntertainmentExpense - deductibleAmount;

  const notes: string[] = [
    roundedFiscalYearMonths === FIXED_DEDUCTION_LIMIT_STANDARD_MONTHS
      ? "事業年度は12か月として計算しています。"
      : `事業年度の月数（${input.fiscalYearMonths}か月）を1か月未満切り上げで${roundedFiscalYearMonths}か月として月割り計算しています。定額控除限度額 = 800万円 × ${roundedFiscalYearMonths}か月 ÷ 12か月 = ${fixedDeductionLimit.toLocaleString(
          "ja-JP"
        )}円。`,
    favorableOption === "half_of_entertainment_meal_expense"
      ? `接待飲食費の50%相当額（${halfOfEntertainmentMealExpenseAmount.toLocaleString(
          "ja-JP"
        )}円）が、定額控除限度額を適用した場合の損金算入額（${fixedDeductionDeductibleAmount.toLocaleString(
          "ja-JP"
        )}円）より大きいため、接待飲食費の50%相当額を採用しています。`
      : `定額控除限度額を適用した場合の損金算入額（${fixedDeductionDeductibleAmount.toLocaleString(
          "ja-JP"
        )}円）が、接待飲食費の50%相当額（${halfOfEntertainmentMealExpenseAmount.toLocaleString(
          "ja-JP"
        )}円）以上のため、定額控除限度額を採用しています。`,
  ];

  return {
    input,
    roundedFiscalYearMonths,
    fixedDeductionLimit,
    fixedDeductionDeductibleAmount,
    halfOfEntertainmentMealExpenseAmount,
    favorableOption,
    deductibleAmount,
    nonDeductibleAmount,
    notes,
    disclaimer: ENTERTAINMENT_EXPENSE_LIMIT_DISCLAIMER,
  };
}
