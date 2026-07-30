// ------------------------------------------------------------------
// 固定資産台帳・資産ライフサイクルのアラート判定
//
// depreciation.ts の減価償却シミュレーション（calculateAssetDepreciation /
// validateDeMinimisAnnualCap）を土台に、資産一覧を横断して以下の3種類の
// 「気づき」を計算する、あくまで一般的なルールに基づく概算・リマインダーの
// 提供にとどまる（個別具体の税務相談ではない）:
//
//   (a) 償却完了間近: 耐用年数の到達（帳簿価額が備忘価額まで償却完了する見込み）が
//       基準日から一定期間（既定12ヶ月）以内に見込まれる資産
//   (b) 償却完了済み: 基準日時点ですでに帳簿価額が備忘価額（またはそれに近い水準）
//       まで償却が完了している資産（少額減価償却資産の特例により即時償却済みの
//       資産を含む）
//   (c) 少額減価償却資産の特例の年間合計300万円上限への接近・到達
//
// このモジュールは判定のみを行う純粋関数の集まりであり、UIへの表示は
// AssetLifecycleAlertBanner コンポーネント側の責務とする。
//
// 重要（税理士法対応）: ここでの「償却完了間近」「償却完了済み」の判定は、
// depreciation.ts に明記されている簡略化（定率法の簡易ロジック、耐用年数の
// 自動判定なし等）をそのまま引き継ぐ。少額減価償却資産の年間合計300万円上限の
// 判定ロジックそのものは depreciation.ts の validateDeMinimisAnnualCap を
// そのまま利用し、このファイルでは金額のしきい値（300万円）を再実装しない。
// 表示される情報は一般的なルールに基づくリマインダー・概算であり、個別の
// 税務相談には対応していない。正式な判断は必ず利用者（または税理士等の
// 専門家）が行うこと。
// ------------------------------------------------------------------

import {
  Asset,
  AssetDepreciationResult,
  DeMinimisAnnualCapCheck,
  FiscalPeriod,
  calculateAssetDepreciation,
  validateDeMinimisAnnualCap,
} from "./depreciation";

/** 「償却完了間近」とみなす、基準日からの残り月数の既定しきい値（12ヶ月） */
export const DEFAULT_UPCOMING_MONTHS_THRESHOLD = 12;

/** 少額減価償却資産の年間上限に対する使用率が、この割合以上になったら「接近」とみなす既定値（80%） */
export const DEFAULT_DE_MINIMIS_APPROACHING_RATIO = 0.8;

// ---- 日付ユーティリティ（"YYYY-MM-DD" のISO日付文字列のみを扱う。曖昧さを避けるため
// このファイル内でDate.now()やnew Date()（引数なし）は呼ばない。基準日（referenceDate）は
// 必ず呼び出し側が明示的な引数として渡す） ----

function parseIsoDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** referenceDate から monthsAhead ヶ月後の月の月末日を返す（"YYYY-MM-DD"） */
function monthEndAfter(referenceDate: string, monthsAhead: number): string {
  const { y, m } = parseIsoDate(referenceDate);
  const total = y * 12 + (m - 1) + monthsAhead;
  const targetY = Math.floor(total / 12);
  const targetM = (total % 12) + 1;
  return toIsoDate(targetY, targetM, lastDayOfMonth(targetY, targetM));
}

/**
 * 資産1件について、取得日から指定した基準日（asOf）までを1つの対象期間として
 * calculateAssetDepreciation を呼び出し、「基準日時点での累計の状態」を求める。
 * period.start を資産の取得日そのものにすることで、取得前の期間（accumulatedBeforePeriod）が
 * 常にゼロになり、返り値の accumulatedDepreciation / endingBookValue / fullyDepreciated が
 * 「取得from基準日まで」の累計値として素直に得られる（事業年度の区切りに依存しない）。
 */
function statusAsOf(asset: Asset, asOf: string): AssetDepreciationResult {
  return calculateAssetDepreciation(asset, { start: asset.acquisitionDate, end: asOf });
}

// ---- (a) 償却完了間近 ----

export interface UpcomingFullDepreciationAlert {
  asset: Asset;
  /** 基準日（referenceDate）時点での期末帳簿価額（概算） */
  currentBookValue: number;
  /** 償却完了（備忘価額到達）が見込まれる年月の概算（"YYYY-MM"） */
  estimatedCompletionMonth: string;
  /** 基準日から償却完了見込み月までの残り月数の概算（0はその月中に完了見込み） */
  monthsRemaining: number;
}

/**
 * 耐用年数の到達（帳簿価額が備忘価額まで償却完了する見込み）が、基準日（referenceDate）から
 * monthsAhead ヶ月以内に見込まれる資産の一覧を返す（残り月数が短い順）。
 *
 * - 基準日時点で未取得（取得年月日が基準日より後）の資産は対象外とする。
 * - 基準日時点ですでに償却完了済みの資産は、この一覧ではなく findFullyDepreciatedAssets の対象とする。
 * - 少額減価償却資産の特例が適用された資産（取得年度に全額即時償却）は、取得年度から
 *   ずっと「償却完了済み」であり、緩やかに完了に近づいていく資産ではないため対象外とする
 *   （findFullyDepreciatedAssets 側で捕捉される）。
 * - 完了見込み月は、depreciation.ts の calculateAssetDepreciation を月単位で繰り返し呼び出して
 *   探索する（定額法・定率法いずれの簡略化ロジックもそのまま利用し、このファイルでは
 *   償却額の計算式そのものを再実装しない）。
 */
export function findAssetsNearingFullDepreciation(
  assets: Asset[],
  referenceDate: string,
  monthsAhead: number = DEFAULT_UPCOMING_MONTHS_THRESHOLD
): UpcomingFullDepreciationAlert[] {
  const alerts: UpcomingFullDepreciationAlert[] = [];

  for (const asset of assets) {
    if (asset.acquisitionCost <= 0) continue; // 取得価額0円の資産は備忘価額の概念がなく対象外
    if (asset.acquisitionDate > referenceDate) continue; // 基準日時点で未取得

    const currentStatus = statusAsOf(asset, referenceDate);
    if (currentStatus.immediateExpensingApplied) continue; // 即時償却済み(完了済み側で扱う)
    if (currentStatus.fullyDepreciated) continue; // すでに完了済み(完了済み側で扱う)

    let monthsRemaining: number | null = null;
    for (let m = 0; m <= monthsAhead; m++) {
      const periodEnd = monthEndAfter(referenceDate, m);
      const status = calculateAssetDepreciation(asset, { start: asset.acquisitionDate, end: periodEnd });
      if (status.fullyDepreciated) {
        monthsRemaining = m;
        break;
      }
    }

    if (monthsRemaining !== null) {
      alerts.push({
        asset,
        currentBookValue: currentStatus.endingBookValue,
        estimatedCompletionMonth: monthEndAfter(referenceDate, monthsRemaining).slice(0, 7),
        monthsRemaining,
      });
    }
  }

  return alerts.sort((a, b) => a.monthsRemaining - b.monthsRemaining);
}

// ---- (b) 償却完了済み ----

export interface FullyDepreciatedAssetAlert {
  asset: Asset;
  /** 基準日時点での期末帳簿価額（通常は備忘価額1円、少額減価償却資産の特例適用済みの場合は0円） */
  bookValue: number;
  /** 基準日時点での減価償却累計額 */
  accumulatedDepreciation: number;
  /** 少額減価償却資産の特例により（月割りなしで）即時償却済みかどうか */
  immediateExpensingApplied: boolean;
}

/**
 * 基準日（referenceDate）時点で、すでに帳簿価額が備忘価額（またはそれに相当する水準。
 * 少額減価償却資産の特例適用済みの場合は0円）まで償却が完了している資産の一覧を返す。
 * 基準日時点で未取得の資産は対象外とする。
 */
export function findFullyDepreciatedAssets(assets: Asset[], referenceDate: string): FullyDepreciatedAssetAlert[] {
  const alerts: FullyDepreciatedAssetAlert[] = [];

  for (const asset of assets) {
    if (asset.acquisitionDate > referenceDate) continue; // 基準日時点で未取得

    const status = statusAsOf(asset, referenceDate);
    if (status.fullyDepreciated) {
      alerts.push({
        asset,
        bookValue: status.endingBookValue,
        accumulatedDepreciation: status.accumulatedDepreciation,
        immediateExpensingApplied: status.immediateExpensingApplied,
      });
    }
  }

  return alerts;
}

// ---- (c) 少額減価償却資産の年間上限への接近・到達 ----

export type DeMinimisCapAlertLevel = "ok" | "approaching" | "exceeded";

export interface DeMinimisCapAlert {
  /** "exceeded" = 上限超過（capCheck.capExceeded と同じ）, "approaching" = 上限に接近, "ok" = 問題なし */
  level: DeMinimisCapAlertLevel;
  /** depreciation.ts の validateDeMinimisAnnualCap による判定結果そのもの（しきい値・超過額はここを正とする） */
  capCheck: DeMinimisAnnualCapCheck;
  /** 年間上限に対する使用割合（0〜、上限超過時は1を超える） */
  usedRatio: number;
  /** 年間上限までの残額（円）。上限超過時は0 */
  remainingAmount: number;
}

/**
 * 少額減価償却資産の特例による当期の即時償却額の合計が、年間上限（300万円、
 * depreciation.ts の IMMEDIATE_EXPENSING_ANNUAL_CAP）に接近・到達していないかを判定する。
 *
 * 上限そのものの判定・金額計算は depreciation.ts の validateDeMinimisAnnualCap を
 * そのまま利用し（このファイルでは300万円という金額を再実装しない）、その結果を
 * もとに「接近」（既定では使用割合80%以上）というアラートレベルを追加で判定する。
 */
export function checkDeMinimisCapAlert(
  assets: Asset[],
  period: FiscalPeriod,
  approachingThresholdRatio: number = DEFAULT_DE_MINIMIS_APPROACHING_RATIO
): DeMinimisCapAlert {
  const capCheck = validateDeMinimisAnnualCap(assets, period);
  const usedRatio = capCheck.annualCap > 0 ? capCheck.totalExpensedAmount / capCheck.annualCap : 0;
  const remainingAmount = Math.max(0, capCheck.annualCap - capCheck.totalExpensedAmount);

  const level: DeMinimisCapAlertLevel = capCheck.capExceeded
    ? "exceeded"
    : usedRatio >= approachingThresholdRatio
    ? "approaching"
    : "ok";

  return { level, capCheck, usedRatio, remainingAmount };
}

// ---- まとめて計算する ----

export interface AssetLifecycleAlertsOptions {
  /** 「償却完了間近」とみなす残り月数のしきい値（既定 DEFAULT_UPCOMING_MONTHS_THRESHOLD = 12ヶ月） */
  monthsAhead?: number;
  /** 少額減価償却資産の年間上限に対して「接近」とみなす使用割合のしきい値（既定 DEFAULT_DE_MINIMIS_APPROACHING_RATIO = 0.8） */
  approachingThresholdRatio?: number;
}

export interface AssetLifecycleAlerts {
  nearingFullDepreciation: UpcomingFullDepreciationAlert[];
  fullyDepreciated: FullyDepreciatedAssetAlert[];
  deMinimisCap: DeMinimisCapAlert;
}

/**
 * 資産一覧について、(a) 償却完了間近、(b) 償却完了済み、(c) 少額減価償却資産の
 * 年間上限への接近・到達、の3種類のアラートをまとめて計算する。
 *
 * period は少額減価償却資産の上限チェック（(c)、validateDeMinimisAnnualCap）の対象期間
 * （通常は当期の事業年度）。referenceDate は (a)(b) の基準日（通常は本日）。
 */
export function computeAssetLifecycleAlerts(
  assets: Asset[],
  period: FiscalPeriod,
  referenceDate: string,
  options: AssetLifecycleAlertsOptions = {}
): AssetLifecycleAlerts {
  return {
    nearingFullDepreciation: findAssetsNearingFullDepreciation(assets, referenceDate, options.monthsAhead),
    fullyDepreciated: findFullyDepreciatedAssets(assets, referenceDate),
    deMinimisCap: checkDeMinimisCapAlert(assets, period, options.approachingThresholdRatio),
  };
}
