// ------------------------------------------------------------------
// 固定資産台帳・減価償却費の計算（定額法）
//
// これは正式な別表十六（法人税）や青色申告決算書の「減価償却費の計算」欄の
// 自動作成ではなく、あくまで下書き作成を補助する概算シミュレーションです。
// 耐用年数は「減価償却資産の耐用年数等に関する省令」の法定耐用年数表を
// このアプリ内に持たず、利用者が資産ごとに直接入力する前提とします
// （資産の種類・構造から法定耐用年数を自動判定する機能は対象外）。
//
// 対応している考え方:
// - 定額法（旧定率法・定率法は対象外。2007年度税制改正以降の定額法を前提）
// - 事業供用月数による月割り（1ヶ月未満の端数は1ヶ月に切り上げ）
// - 償却済資産の帳簿価額は1円（備忘価額）まで（2007年度税制改正以降の慣行）
// - 少額減価償却資産の特例（取得価額30万円未満・青色申告者）: 対象資産は
//   取得年度に全額を必要経費・損金に算入できる（月割り計算は行わない）
//
// 対応していない・簡略化している点（コメントとして明示）:
// - 少額減価償却資産の特例には年間合計300万円までという上限があるが、
//   このアプリでは資産横断の年間合計チェックは行っていない（利用者が
//   別途確認する必要がある）。
// - 中古資産の耐用年数の見積り（簡便法）には対応していない。
// - 資産の除却・売却（期中の除却による除却損計上等）には対応していない。
// ------------------------------------------------------------------

export interface Asset {
  id: string;
  name: string; // 資産名
  acquisitionDate: string; // 取得年月日（"YYYY-MM-DD"）
  acquisitionCost: number; // 取得価額（円）
  usefulLifeYears: number; // 耐用年数（年、利用者入力。法定耐用年数表は本アプリ非対応）
  /**
   * 少額減価償却資産の特例（取得価額30万円未満の場合に全額即時償却）を
   * 適用するかどうか。資産ごとのフラグ。取得価額が30万円以上の場合は無視される。
   */
  immediateExpensing?: boolean;
}

export interface FiscalPeriod {
  start: string; // 事業年度・対象期間の開始日（"YYYY-MM-DD"、両端を含む）
  end: string; // 事業年度・対象期間の終了日（"YYYY-MM-DD"、両端を含む）
}

export const IMMEDIATE_EXPENSING_COST_THRESHOLD = 300_000; // 少額減価償却資産の判定基準額（この金額未満）
export const IMMEDIATE_EXPENSING_ANNUAL_CAP = 3_000_000; // 青色申告者の年間合計適用上限（未使用・利用者が別途確認）

export interface AssetDepreciationResult {
  asset: Asset;
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
 * 単一資産について、指定した対象期間（事業年度）の減価償却額・帳簿価額を計算する。
 *
 * 定額法: 年間償却額 = 取得価額 ÷ 耐用年数。取得からの経過月数（1ヶ月未満切り上げ）を
 * 基準に、対象期間の期首時点までの累計償却額と期末時点までの累計償却額を求め、
 * その差分を当期償却額とする（複数年度にまたがっても常に整合する設計）。
 * 帳簿価額は1円（備忘価額）を下回らないようにする。
 */
export function calculateAssetDepreciation(asset: Asset, period: FiscalPeriod): AssetDepreciationResult {
  const cost = Math.max(0, asset.acquisitionCost);
  const notes: string[] = [];

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
      `取得価額が${IMMEDIATE_EXPENSING_COST_THRESHOLD.toLocaleString("ja-JP")}円以上のため、少額減価償却資産の特例は適用されません。通常の定額法で計算しています。`
    );
  }

  if (eligibleForImmediateExpensing) {
    notes.push(
      "少額減価償却資産の特例（取得価額30万円未満）により取得年度に全額を経費・損金算入しています。青色申告者は年間合計300万円までという上限があります（このアプリでは資産横断の合計チェックは行っていません）。"
    );
    const notYetAcquired = asset.acquisitionDate > period.end;
    const isAcquisitionPeriod = !notYetAcquired && asset.acquisitionDate >= period.start;

    if (notYetAcquired) {
      return {
        asset,
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

  // ---- 通常の定額法（月割り） ----
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

  const monthlyRate = cost / usefulLifeYears / 12;
  const maxAccumulated = Math.max(0, cost - minBookValue);

  const accumulatedBeforePeriod = Math.min(Math.floor(monthlyRate * elapsedBeforePeriodCapped), maxAccumulated);
  const accumulatedAtPeriodEnd = Math.min(Math.floor(monthlyRate * elapsedAtPeriodEndCapped), maxAccumulated);

  const currentYearDepreciation = Math.max(0, accumulatedAtPeriodEnd - accumulatedBeforePeriod);
  const openingBookValue = cost - accumulatedBeforePeriod;
  const endingBookValue = cost - accumulatedAtPeriodEnd;

  return {
    asset,
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
