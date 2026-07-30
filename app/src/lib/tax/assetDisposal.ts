// ------------------------------------------------------------------
// 固定資産の除却・売却（除却損・売却損益の計算）
//
// depreciation.ts の減価償却シミュレーションを前提として、資産を期中に
// 除却（スクラップ・廃棄）または売却した場合の「未償却残高」と
// 「除却損／売却損益」の概算を計算する。正式な決算書・法人税申告書
// 別表十六の「除却・譲渡」欄の自動作成ではなく、あくまで下書き作成を
// 補助する概算シミュレーションである。
//
// 会計上の考え方（簡略化）:
// - 未償却残高（除却・売却直前の帳簿価額） = 取得価額 − 除却・売却直前までの減価償却累計額
// - 除却（売却代金 0円）の場合: 固定資産除却損 = 未償却残高（全額）
// - 売却（売却代金 > 0円）の場合: 固定資産売却損益 = 売却代金 − 未償却残高
//   （プラスなら固定資産売却益、マイナスなら固定資産売却損）
//
// 期中の月割り償却についての重要な簡略化（assumption）:
// - 除却・売却があった月自体の減価償却費は計上せず、「除却・売却の属する月の
//   前月末」までの月割り償却額をもって未償却残高を算定する（保守的な簡便法）。
//   実務上は除却月の期首から除却日までの分を日割り・月割りで追加計上する
//   運用も存在するが、本アプリでは「下書き作成の補助」の範囲にとどめるため、
//   この簡便法を採用する。最終的な処理は必ず利用者（または税理士等の
//   専門家）が確認すること。
// - depreciation.ts の月割りロジック（1ヶ月未満切り上げ・備忘価額1円までの
//   償却）をそのまま再利用しており、耐用年数到達後・少額減価償却資産の
//   特例適用済み資産についても整合する。
// - 除却・売却は資産の取得日から起算するため、対象期間（事業年度）の
//   概念とは独立に計算する（特定の事業年度に紐づけない）。
// ------------------------------------------------------------------

import { Asset, FiscalPeriod, calculateAssetDepreciation } from "./depreciation";

export interface AssetDisposalInput {
  asset: Asset;
  /** 除却・売却年月日（"YYYY-MM-DD"） */
  disposalDate: string;
  /**
   * 除却・売却による受取額（円）。スクラップ・廃棄で対価が発生しない場合は0円。
   * 0円の場合は「除却」、1円以上の場合は「売却」として扱う。
   */
  disposalProceeds: number;
}

/** "retirement" = 除却（スクラップ・廃棄、対価0円）、"sale" = 売却（対価あり） */
export type AssetDisposalCase = "retirement" | "sale";

export interface AssetDisposalResult {
  asset: Asset;
  disposalDate: string;
  /** 0以上に正規化した売却代金（負の値が入力された場合は0円として扱う） */
  disposalProceeds: number;
  /** 未償却残高の算定基準日（除却・売却の属する月の前月末、"YYYY-MM-DD"） */
  cutoffDate: string;
  /** 取得から算定基準日までの償却月数（1ヶ月未満切り上げ、耐用年数到達分は含まない） */
  monthsDepreciatedBeforeDisposal: number;
  /** 算定基準日時点の減価償却累計額 */
  accumulatedDepreciationBeforeDisposal: number;
  /** 未償却残高（除却・売却直前の帳簿価額） */
  bookValueAtDisposal: number;
  /** 除却（対価0円）か売却（対価あり）かの区分 */
  disposalCase: AssetDisposalCase;
  /** 売却代金 − 未償却残高。正なら売却益、負なら売却損／除却損 */
  gainOrLoss: number;
  /** 固定資産売却益が発生しているか（gainOrLoss > 0） */
  isGain: boolean;
  /** 固定資産除却損／売却損が発生しているか（gainOrLoss < 0） */
  isLoss: boolean;
  notes: string[];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "YYYY-MM-DD" → 年*12+(月-1) の通し月インデックス（depreciation.ts の monthIndex と同じ考え方） */
function monthIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return year * 12 + (month - 1);
}

/** うるう年を考慮した月の日数（Dateオブジェクト・タイムゾーンに依存しない純粋計算） */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * 指定日が属する月の「前月末」の日付を "YYYY-MM-DD" で返す。
 * 例: "2025-07-10" → "2025-06-30"、"2025-01-15" → "2024-12-31"
 */
function lastDayOfPreviousMonthIso(iso: string): string {
  const idx = monthIndex(iso) - 1;
  const year = Math.floor(idx / 12);
  const month = idx - year * 12 + 1; // 1..12
  const day = daysInMonth(year, month);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * 固定資産の除却・売却による未償却残高・除却損／売却損益を計算する。
 *
 * 未償却残高は、資産の取得日を起点として「除却・売却の属する月の前月末」までを
 * 対象期間として depreciation.ts の定額法ロジックをそのまま利用して算出する
 * （耐用年数到達・少額減価償却資産の特例・1円備忘価額floor等の扱いは
 * calculateAssetDepreciation の実装に準拠し、ここでは重複実装しない）。
 */
export function calculateAssetDisposal(input: AssetDisposalInput): AssetDisposalResult {
  const { asset, disposalDate } = input;
  const notes: string[] = [];

  const disposalProceeds =
    Number.isFinite(input.disposalProceeds) && input.disposalProceeds > 0 ? input.disposalProceeds : 0;
  if (Number.isFinite(input.disposalProceeds) && input.disposalProceeds < 0) {
    notes.push("除却・売却による受取額に負の値が入力されたため、0円（除却）として扱っています。");
  }

  if (disposalDate < asset.acquisitionDate) {
    notes.push(
      "除却・売却年月日が取得年月日より前になっています。入力内容をご確認ください。ここでは取得直後（未償却残高＝取得価額）として計算しています。"
    );
  }

  const cutoffDate = lastDayOfPreviousMonthIso(disposalDate);
  // 資産の取得日を起点に、除却・売却の前月末までを対象期間として月割り償却を計算する。
  // period.start に取得日そのものを使うことで、事業年度（fiscalPeriod）に依存せず
  // 「取得から前月末までの累計」を過不足なく求められる。
  const period: FiscalPeriod = { start: asset.acquisitionDate, end: cutoffDate };
  const depreciation = calculateAssetDepreciation(asset, period);
  notes.push(...depreciation.notes);

  const bookValueAtDisposal = depreciation.endingBookValue;
  const accumulatedDepreciationBeforeDisposal = depreciation.accumulatedDepreciation;
  const monthsDepreciatedBeforeDisposal = depreciation.monthsInService;

  const disposalCase: AssetDisposalCase = disposalProceeds > 0 ? "sale" : "retirement";
  const gainOrLoss = disposalProceeds - bookValueAtDisposal;

  if (disposalCase === "retirement") {
    if (bookValueAtDisposal > 0) {
      notes.push(
        `固定資産除却損として${bookValueAtDisposal.toLocaleString("ja-JP")}円を計上します（未償却残高の全額）。`
      );
    } else {
      notes.push("未償却残高が0円のため、除却損は発生しません。");
    }
  } else {
    if (gainOrLoss > 0) {
      notes.push(`固定資産売却益として${gainOrLoss.toLocaleString("ja-JP")}円を計上します。`);
    } else if (gainOrLoss < 0) {
      notes.push(`固定資産売却損として${Math.abs(gainOrLoss).toLocaleString("ja-JP")}円を計上します。`);
    } else {
      notes.push("売却代金と未償却残高が同額のため、売却損益は発生しません。");
    }
  }

  return {
    asset,
    disposalDate,
    disposalProceeds,
    cutoffDate,
    monthsDepreciatedBeforeDisposal,
    accumulatedDepreciationBeforeDisposal,
    bookValueAtDisposal,
    disposalCase,
    gainOrLoss,
    isGain: gainOrLoss > 0,
    isLoss: gainOrLoss < 0,
    notes,
  };
}
