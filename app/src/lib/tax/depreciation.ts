// ------------------------------------------------------------------
// 固定資産台帳・減価償却費の計算（定額法・定率法）
//
// これは正式な別表十六（法人税）や青色申告決算書の「減価償却費の計算」欄の
// 自動作成ではなく、あくまで下書き作成を補助する概算シミュレーションです。
// 耐用年数は「減価償却資産の耐用年数等に関する省令」の法定耐用年数表を
// このアプリ内に持たず、利用者が資産ごとに直接入力する前提とします
// （資産の種類・構造から法定耐用年数を自動判定する機能は対象外）。
//
// 対応している考え方:
// - 定額法（旧定額法は対象外。2007年度税制改正以降の定額法を前提）
// - 定率法（旧定率法は対象外。2007年度税制改正以降の「200%償却」を前提。
//   asset.method で資産ごとに選択可能。簡略化の内容は下記を参照）
// - 事業供用月数による月割り（1ヶ月未満の端数は1ヶ月に切り上げ）
// - 償却済資産の帳簿価額は1円（備忘価額）まで（2007年度税制改正以降の慣行）
// - 少額減価償却資産の特例（取得価額30万円未満・青色申告者）: 対象資産は
//   取得年度に全額を必要経費・損金に算入できる（月割り計算は行わない）
// - 少額減価償却資産の特例の年間合計300万円上限チェック（validateDeMinimisAnnualCap）。
//   資産横断で判定する必要があるため、単一資産を計算する calculateAssetDepreciation
//   の中では判定できず、別関数として提供する（下記参照）。
//
// 対応していない・簡略化している点（コメントとして明示）:
// - 少額減価償却資産の特例の年間合計300万円上限は validateDeMinimisAnnualCap で
//   判定できるが、この関数を呼び出して結果を確認するかどうかはUI側の責任であり、
//   calculateAssetDepreciation / summarizeDepreciation の中で自動的にはチェックしない。
//   また、上限を超えた場合に「どの資産の特例適用を取り下げて通常の減価償却に
//   切り替えるか」は自動判定・自動修正しない（利用者または税理士等の専門家が
//   最終的に選択する。本アプリは判断材料の提示までにとどめる）。
// - 定率法（declining-balance）は、国税庁の「減価償却資産の耐用年数等に関する
//   省令」別表第七・別表第九・別表第十等が定める、耐用年数ごとに丸められた
//   公式の「償却率」「改定償却率」「保証率」の数値表をこのアプリ内に持たない。
//   代わりに以下の簡略化・仮定を採用している（要注意・自己責任で確認すること）:
//     (a) 償却率は「200% ÷ 耐用年数」の値をそのまま用いる（四捨五入・丸め処理をしない）。
//         耐用年数によっては、公式の別表が示す丸めた償却率（例: 6年 → 0.334）と
//         わずかに異なる場合がある（このアプリでは 6年 → 2/6 = 0.3333…をそのまま使用）。
//     (b) 公式の「保証率」「改定償却率」というテーブル方式の仕組みの代わりに、
//         「その保有年の定率法による償却額が、残存耐用年数で残存帳簿価額
//         （備忘価額1円を除く）を均等償却した場合の金額を下回った時点で、
//         以後は残存耐用年数にわたる均等償却に切り替える」という動的なロジックで
//         代替する（一度切り替えたら定率法には戻らない）。これにより、公式の
//         保証率テーブルがなくても耐用年数の最終年に必ず帳簿価額が1円
//         （備忘価額）まで償却されることを保証しているが、切替えが発生する年度や
//         各年の償却額そのものは、公式の別表による保証率・改定償却率を用いた
//         場合と完全には一致しない可能性がある。
//     (c) 定率法の「保有年」（12ヶ月ごとの区分）は資産の取得日を起点に数える
//         （取得日から12ヶ月ごと）。会社・個人事業の実際の事業年度（決算期）の
//         区切りとは、取得日が事業年度の開始日と一致する場合を除き、厳密には
//         一致しない場合がある（定額法の月割りロジックと異なり、定率法は
//         年ごとの帳簿価額に依存する複利的な計算のため、この簡略化が必要）。
//   これらの簡略化により、公式の別表十六(二)の記載額と本アプリの計算結果が
//   完全に一致することは保証されない。正式な金額は必ず税理士等の専門家に確認すること。
// - 中古資産の耐用年数の見積り（簡便法）には対応していない。
// - 資産の除却・売却（期中の除却による除却損計上等）には対応していない。
// ------------------------------------------------------------------

/**
 * 減価償却の方法。
 * - "straight-line"（定額法）: 未指定の場合のデフォルト。取得価額 ÷ 耐用年数を毎年均等に償却する。
 * - "declining-balance"（定率法・200%償却）: 期首帳簿価額 × 償却率で計算する。
 *   ファイル冒頭のコメントに記載した簡略化（公式の保証率・改定償却率テーブルを
 *   使わない等）を前提とした概算実装であり、正式な別表の金額とは一致しない場合がある。
 */
export type DepreciationMethod = "straight-line" | "declining-balance";

export interface Asset {
  id: string;
  name: string; // 資産名
  acquisitionDate: string; // 取得年月日（"YYYY-MM-DD"）
  acquisitionCost: number; // 取得価額（円）
  usefulLifeYears: number; // 耐用年数（年、利用者入力。法定耐用年数表は本アプリ非対応）
  /**
   * 少額減価償却資産の特例（取得価額30万円未満の場合に全額即時償却）を
   * 適用するかどうか。資産ごとのフラグ。取得価額が30万円以上の場合は無視される。
   * この特例が適用される場合、method の指定に関わらず特例が優先される。
   */
  immediateExpensing?: boolean;
  /**
   * 減価償却の方法（定額法／定率法）。未指定の場合は "straight-line"（定額法）として計算する。
   */
  method?: DepreciationMethod;
}

export interface FiscalPeriod {
  start: string; // 事業年度・対象期間の開始日（"YYYY-MM-DD"、両端を含む）
  end: string; // 事業年度・対象期間の終了日（"YYYY-MM-DD"、両端を含む）
}

export const IMMEDIATE_EXPENSING_COST_THRESHOLD = 300_000; // 少額減価償却資産の判定基準額（この金額未満）
export const IMMEDIATE_EXPENSING_ANNUAL_CAP = 3_000_000; // 青色申告者の年間合計適用上限（validateDeMinimisAnnualCapで判定可能）

/**
 * 定率法（declining-balance）の償却率の基準となる倍率。2007年度税制改正以降の
 * 「200%償却」を前提とする（旧定率法・250%償却（平成24年3月31日以前取得分）は対象外）。
 * 償却率 = DECLINING_BALANCE_RATE_MULTIPLIER ÷ 耐用年数（丸め処理はしない簡略値。
 * ファイル冒頭のコメント参照）。
 */
export const DECLINING_BALANCE_RATE_MULTIPLIER = 2;

export interface AssetDepreciationResult {
  asset: Asset;
  /** この計算で採用した減価償却方法（少額減価償却資産の特例が適用された場合でも、asset.methodの指定値をそのまま反映する） */
  method: DepreciationMethod;
  /** 当期（対象期間）中の事業供用月数（1ヶ月未満切り上げ、耐用年数到達分は含まない） */
  monthsInService: number;
  /** 期首帳簿価額 */
  openingBookValue: number;
  /** 当期償却額 */
  currentYearDepreciation: number;
  /** 期末減価償却累計額（取得から対象期間末までの累計） */
  accumulatedDepreciation: number;
  /** 期末帳簿価額 */
  endingBookValue: number;
  /** 少額減価償却資産の特例が適用されたか */
  immediateExpensingApplied: boolean;
  /** 備忘価額（1円）まで償却が完了しているか */
  fullyDepreciated: boolean;
  notes: string[];
}

export interface DepreciationSummary {
  fiscalPeriod: FiscalPeriod;
  results: AssetDepreciationResult[];
  totalCurrentYearDepreciation: number;
  totalAccumulatedDepreciation: number;
  totalEndingBookValue: number;
}

/** "YYYY-MM-DD" → 年*12+(月-1) の通し月インデックス（日付比較はISO文字列の辞書順で行う） */
function monthIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return year * 12 + (month - 1);
}

/**
 * 定率法（200%償却、簡略化版）における償却率。200% ÷ 耐用年数の値をそのまま用いる
 * （国税庁の耐用年数省令別表が定める丸めた公式の償却率とは異なる場合がある。
 * ファイル冒頭のコメント参照）。
 */
function decliningBalanceRate(usefulLifeYears: number): number {
  return DECLINING_BALANCE_RATE_MULTIPLIER / usefulLifeYears;
}

/**
 * 浮動小数点の丸め誤差（例: 432000 * 0.4 が 172799.999999998 のような値になる）を
 * 吸収するための、ごくわずかな余裕を持たせた円単位の切り捨て。
 */
function floorYen(amount: number): number {
  return Math.floor(amount + 1e-6);
}

/**
 * 定率法（200%償却、簡略化版）で、取得から指定した経過月数（elapsedMonths）が
 * 経過した時点までの減価償却累計額を計算する。
 *
 * 資産の保有期間を取得日から12ヶ月ごとの「保有年」に区切り、保有年ごとに
 * （期首帳簿価額 × 償却率）で当年の償却額を求める（12ヶ月未満しか経過していない
 * 保有年は月割りで比例計算する）。国税庁の公式な「保証率・改定償却率」テーブルは
 * 使わず、代わりに「その保有年の定率法による償却額が、残存保有年数で残存帳簿価額
 * （備忘価額1円を除く）を均等償却した場合の金額を下回った時点で、以後は残存保有年数
 * にわたる均等償却（定額法的な扱い）に切り替える」という動的なロジックで代替する
 * （一度切り替えたら定率法には戻らない）。この方式により、耐用年数の最終保有年には
 * 必ず帳簿価額が1円（備忘価額）まで償却される（毎年、残存帳簿価額を残存年数で
 * 再計算し直すため、丸め誤差が翌年以降に自動的に補正される）。
 *
 * 簡略化のため、この関数は資産の取得日を起点とした12ヶ月区分（保有年）で計算しており、
 * 呼び出し側の対象期間（事業年度）の開始日・終了日そのものとは、取得日が事業年度の
 * 開始日と一致する場合を除き、区分の境目が厳密には一致しない場合がある。
 */
function decliningBalanceAccumulatedForElapsedMonths(
  cost: number,
  rate: number,
  elapsedMonths: number,
  usefulLifeMonths: number,
  minBookValue: number
): number {
  const targetMonths = Math.max(0, Math.min(elapsedMonths, usefulLifeMonths));

  let bookValue = cost;
  let accumulated = 0;
  let processedMonths = 0;
  let switchedToStraightLine = false;

  while (processedMonths < targetMonths && bookValue > minBookValue) {
    const monthsRemainingToProcess = targetMonths - processedMonths;
    const monthsInThisBlock = Math.min(12, monthsRemainingToProcess);
    const remainingOwnershipYearsIncludingThis = Math.ceil((usefulLifeMonths - processedMonths) / 12);

    let annualAmount: number;
    if (switchedToStraightLine) {
      annualAmount = (bookValue - minBookValue) / remainingOwnershipYearsIncludingThis;
    } else {
      const decliningAnnual = bookValue * rate;
      const straightLineIfSwitchedNow = (bookValue - minBookValue) / remainingOwnershipYearsIncludingThis;
      if (decliningAnnual < straightLineIfSwitchedNow) {
        switchedToStraightLine = true;
        annualAmount = straightLineIfSwitchedNow;
      } else {
        annualAmount = decliningAnnual;
      }
    }

    let blockDepreciation = floorYen((annualAmount * monthsInThisBlock) / 12);
    blockDepreciation = Math.max(0, Math.min(blockDepreciation, bookValue - minBookValue));

    accumulated += blockDepreciation;
    bookValue -= blockDepreciation;
    processedMonths += monthsInThisBlock;
  }

  return accumulated;
}

/**
 * 単一資産について、指定した対象期間（事業年度）の減価償却額・帳簿価額を計算する。
 *
 * 定額法: 年間償却額 = 取得価額 ÷ 耐用年数。取得からの経過月数（1ヶ月未満切り上げ）を
 * 基準に、対象期間の期首時点までの累計償却額と期末時点までの累計償却額を求め、
 * その差分を当期償却額とする（複数年度にまたがっても常に整合する設計）。
 * 定率法: asset.method が "declining-balance" の場合に適用（簡略化版。上記
 * decliningBalanceAccumulatedForElapsedMonths のコメント、およびファイル冒頭の
 * コメント参照）。
 * いずれの方法でも、帳簿価額は1円（備忘価額）を下回らないようにする。
 */
export function calculateAssetDepreciation(asset: Asset, period: FiscalPeriod): AssetDepreciationResult {
  const cost = Math.max(0, asset.acquisitionCost);
  const notes: string[] = [];

  const method: DepreciationMethod = asset.method === "declining-balance" ? "declining-balance" : "straight-line";

  const rawUsefulLifeYears = Math.floor(asset.usefulLifeYears);
  const usefulLifeYears = rawUsefulLifeYears > 0 ? rawUsefulLifeYears : 1;
  if (rawUsefulLifeYears <= 0) {
    notes.push("耐用年数は1年以上を入力してください。1年として計算しています。");
  }

  const minBookValue = cost > 0 ? 1 : 0; // 備忘価額1円（取得価額が0円の場合は0円のまま）

  const wantsImmediateExpensing = asset.immediateExpensing === true;
  const eligibleForImmediateExpensing = wantsImmediateExpensing && cost > 0 && cost < IMMEDIATE_EXPENSING_COST_THRESHOLD;
  if (wantsImmediateExpensing && !eligibleForImmediateExpensing && cost > 0) {
    notes.push(
      `取得価額が${IMMEDIATE_EXPENSING_COST_THRESHOLD.toLocaleString("ja-JP")}円以上のため、少額減価償却資産の特例は適用されません。通常の${
        method === "declining-balance" ? "定率法" : "定額法"
      }で計算しています。`
    );
  }

  if (eligibleForImmediateExpensing) {
    notes.push(
      `少額減価償却資産の特例（取得価額30万円未満）により取得年度に全額を経費・損金算入しています。青色申告者はこの特例について年間合計${IMMEDIATE_EXPENSING_ANNUAL_CAP.toLocaleString(
        "ja-JP"
      )}円までという上限があります。この関数（calculateAssetDepreciation）は単一資産のみを見るため上限判定はできません。資産横断での判定には validateDeMinimisAnnualCap を使用してください。`
    );
    const notYetAcquired = asset.acquisitionDate > period.end;
    const isAcquisitionPeriod = !notYetAcquired && asset.acquisitionDate >= period.start;

    if (notYetAcquired) {
      return {
        asset,
        method,
        monthsInService: 0,
        openingBookValue: cost,
        currentYearDepreciation: 0,
        accumulatedDepreciation: 0,
        endingBookValue: cost,
        immediateExpensingApplied: false,
        fullyDepreciated: false,
        notes,
      };
    }

    if (isAcquisitionPeriod) {
      return {
        asset,
        method,
        monthsInService: 1,
        openingBookValue: cost,
        currentYearDepreciation: cost,
        accumulatedDepreciation: cost,
        endingBookValue: 0,
        immediateExpensingApplied: true,
        fullyDepreciated: true,
        notes,
      };
    }

    // 取得年度より後の期間 → 既に前期以前に全額償却済み
    return {
      asset,
      method,
      monthsInService: 0,
      openingBookValue: 0,
      currentYearDepreciation: 0,
      accumulatedDepreciation: cost,
      endingBookValue: 0,
      immediateExpensingApplied: true,
      fullyDepreciated: true,
      notes,
    };
  }

  // ---- 通常の減価償却（定額法 or 定率法、月割り） ----
  const acquisitionMonthIdx = monthIndex(asset.acquisitionDate);
  const periodStartMonthIdx = monthIndex(period.start);
  const periodEndMonthIdx = monthIndex(period.end);

  const elapsedAtPeriodEnd =
    asset.acquisitionDate <= period.end ? Math.max(0, periodEndMonthIdx - acquisitionMonthIdx + 1) : 0;
  const elapsedBeforePeriod =
    asset.acquisitionDate < period.start ? Math.max(0, periodStartMonthIdx - acquisitionMonthIdx) : 0;

  const totalUsefulLifeMonths = usefulLifeYears * 12;
  const elapsedBeforePeriodCapped = Math.min(elapsedBeforePeriod, totalUsefulLifeMonths);
  const elapsedAtPeriodEndCapped = Math.min(elapsedAtPeriodEnd, totalUsefulLifeMonths);

  const monthsInService = Math.max(0, elapsedAtPeriodEndCapped - elapsedBeforePeriodCapped);
  const maxAccumulated = Math.max(0, cost - minBookValue);

  let accumulatedBeforePeriod: number;
  let accumulatedAtPeriodEnd: number;

  if (method === "declining-balance") {
    const rate = decliningBalanceRate(usefulLifeYears);
    accumulatedBeforePeriod = Math.min(
      decliningBalanceAccumulatedForElapsedMonths(cost, rate, elapsedBeforePeriodCapped, totalUsefulLifeMonths, minBookValue),
      maxAccumulated
    );
    accumulatedAtPeriodEnd = Math.min(
      decliningBalanceAccumulatedForElapsedMonths(cost, rate, elapsedAtPeriodEndCapped, totalUsefulLifeMonths, minBookValue),
      maxAccumulated
    );
    notes.push(
      "定率法（200%償却）は簡略化した実装で計算しています。国税庁の公式な償却率表（耐用年数省令別表）は使用せず、償却率は200%を耐用年数で除した値をそのまま用い、公式の保証率・改定償却率による定額法への切替えの代わりに、残存耐用年数で均等償却した場合の金額を下回った時点で切り替える簡略ロジックを使用しています。詳細はdepreciation.tsファイル冒頭のコメントを参照し、正式な金額は税理士等の専門家にご確認ください。"
    );
  } else {
    const monthlyRate = cost / usefulLifeYears / 12;
    accumulatedBeforePeriod = Math.min(Math.floor(monthlyRate * elapsedBeforePeriodCapped), maxAccumulated);
    accumulatedAtPeriodEnd = Math.min(Math.floor(monthlyRate * elapsedAtPeriodEndCapped), maxAccumulated);
  }

  const currentYearDepreciation = Math.max(0, accumulatedAtPeriodEnd - accumulatedBeforePeriod);
  const openingBookValue = cost - accumulatedBeforePeriod;
  const endingBookValue = cost - accumulatedAtPeriodEnd;

  return {
    asset,
    method,
    monthsInService,
    openingBookValue,
    currentYearDepreciation,
    accumulatedDepreciation: accumulatedAtPeriodEnd,
    endingBookValue,
    immediateExpensingApplied: false,
    fullyDepreciated: cost > 0 && endingBookValue <= minBookValue && accumulatedAtPeriodEnd > 0,
    notes,
  };
}

/**
 * 資産一覧について、指定した対象期間の当期償却額・累計償却額・期末帳簿価額を集計する。
 */
export function summarizeDepreciation(assets: Asset[], period: FiscalPeriod): DepreciationSummary {
  const results = assets.map((asset) => calculateAssetDepreciation(asset, period));
  return {
    fiscalPeriod: period,
    results,
    totalCurrentYearDepreciation: results.reduce((sum, r) => sum + r.currentYearDepreciation, 0),
    totalAccumulatedDepreciation: results.reduce((sum, r) => sum + r.accumulatedDepreciation, 0),
    totalEndingBookValue: results.reduce((sum, r) => sum + r.endingBookValue, 0),
  };
}

/**
 * 少額減価償却資産の特例により、当期（対象期間）に即時償却の対象となった1件の資産と、
 * その即時償却額（円）。validateDeMinimisAnnualCap の結果に含まれる。
 */
export interface DeMinimisAssetExpense {
  asset: Asset;
  /** この資産について、当期に少額減価償却資産の特例により即時償却された金額 */
  expensedAmount: number;
}

/**
 * validateDeMinimisAnnualCap の結果。
 * 上限を超えているかどうかの判定と、超えている場合にどの資産の特例適用を
 * 取り下げるかを利用者が検討するための参考情報（並び順の異なる資産一覧）を含む。
 * このアプリはどの資産を通常の減価償却に切り替えるかを自動決定しない
 * （利用者または税理士等の専門家が最終判断すること）。
 */
export interface DeMinimisAnnualCapCheck {
  fiscalPeriod: FiscalPeriod;
  /** 当期に少額減価償却資産の特例を適用した資産の一覧（入力された資産の順序のまま） */
  applicableAssets: DeMinimisAssetExpense[];
  /** 少額減価償却資産の特例による当期の即時償却額の合計 */
  totalExpensedAmount: number;
  /** 青色申告者の年間合計適用上限（IMMEDIATE_EXPENSING_ANNUAL_CAP と同じ、300万円） */
  annualCap: number;
  /** 年間合計が上限を超えているか */
  capExceeded: boolean;
  /** 上限を超えた金額（超えていない場合は0） */
  excessAmount: number;
  /**
   * 上限を超えた場合、通常の減価償却への切り替えを検討する参考順序（1)。
   * 取得年月日が新しい資産ほど先頭に来る（一般に「後から取得した資産から
   * 特例の適用を見直す」という考え方に基づく並び順の一例だが、これは
   * あくまで参考情報であり、本アプリが自動的に選択・確定するものではない）。
   */
  assetsByAcquisitionDateDesc: DeMinimisAssetExpense[];
  /**
   * 上限を超えた場合の参考順序（2)。即時償却額が大きい資産ほど先頭に来る
   * （「金額の大きい資産から見直すと少ない件数の変更で上限内に収まりやすい」
   * という考え方に基づく並び順の一例。同様に参考情報にとどまる）。
   */
  assetsByExpensedAmountDesc: DeMinimisAssetExpense[];
  notes: string[];
}

/**
 * 少額減価償却資産の特例（取得価額30万円未満・青色申告者）について、資産横断で
 * 当期の即時償却額の合計が年間上限（300万円）を超えていないかを検証する。
 *
 * calculateAssetDepreciation は資産1件ごとに計算するため、このチェックは
 * 別関数として提供する（ファイル冒頭のコメント参照）。上限を超えている場合でも、
 * このアプリはどの資産の特例適用を取り下げて通常の減価償却（定額法・定率法）に
 * 切り替えるかを自動的には決定・修正しない。excessAmount（超過額）と、判断材料
 * となる並び順の異なる資産一覧を返すので、利用者（または税理士等の専門家）が
 * 対象資産を選んだうえで、当該資産の asset.immediateExpensing を false に変更し、
 * 再計算すること。
 */
export function validateDeMinimisAnnualCap(assets: Asset[], period: FiscalPeriod): DeMinimisAnnualCapCheck {
  const applicableAssets: DeMinimisAssetExpense[] = [];

  for (const asset of assets) {
    if (asset.immediateExpensing !== true) continue;
    const result = calculateAssetDepreciation(asset, period);
    if (result.immediateExpensingApplied && result.currentYearDepreciation > 0) {
      applicableAssets.push({ asset, expensedAmount: result.currentYearDepreciation });
    }
  }

  const totalExpensedAmount = applicableAssets.reduce((sum, a) => sum + a.expensedAmount, 0);
  const capExceeded = totalExpensedAmount > IMMEDIATE_EXPENSING_ANNUAL_CAP;
  const excessAmount = capExceeded ? totalExpensedAmount - IMMEDIATE_EXPENSING_ANNUAL_CAP : 0;

  const assetsByAcquisitionDateDesc = [...applicableAssets].sort((a, b) =>
    b.asset.acquisitionDate.localeCompare(a.asset.acquisitionDate)
  );
  const assetsByExpensedAmountDesc = [...applicableAssets].sort((a, b) => b.expensedAmount - a.expensedAmount);

  const notes: string[] = [];
  if (capExceeded) {
    notes.push(
      `少額減価償却資産の特例による当期の即時償却額の合計が${totalExpensedAmount.toLocaleString(
        "ja-JP"
      )}円となり、青色申告者の年間上限${IMMEDIATE_EXPENSING_ANNUAL_CAP.toLocaleString(
        "ja-JP"
      )}円を${excessAmount.toLocaleString("ja-JP")}円超えています。上限を超える部分については、いずれかの資産について特例の適用を取りやめ、通常の減価償却（定額法・定率法）に切り替える必要があります。本アプリはどの資産を切り替えるかを自動決定しません。利用者（または税理士等の専門家）が対象資産を選択してください。`
    );
  }

  return {
    fiscalPeriod: period,
    applicableAssets,
    totalExpensedAmount,
    annualCap: IMMEDIATE_EXPENSING_ANNUAL_CAP,
    capExceeded,
    excessAmount,
    assetsByAcquisitionDateDesc,
    assetsByExpensedAmountDesc,
    notes,
  };
}
