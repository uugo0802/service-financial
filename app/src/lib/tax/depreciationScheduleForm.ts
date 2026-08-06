import {
  Asset,
  AssetDepreciationResult,
  FiscalPeriod,
  calculateAssetDepreciation,
} from "./depreciation";

// ------------------------------------------------------------------
// 別表十六（一）減価償却資産の償却額の計算に関する明細書（定額法）の下書き生成。
//
// これは正式な別表十六（一）そのものではなく、あくまで法人税申告書の添付書類
// 作成を補助する下書き・シミュレーションです。国税庁の様式・記載要領に定める
// 全ての欄・全ての例外処理を再現しているわけではありません。実際の提出前には、
// 必ずご自身（または税理士等の専門家）が内容を確認してください。
//
// このモジュールは depreciation.ts が計算した結果（calculateAssetDepreciation）を
// 別表の行・列構成にマッピングするだけで、減価償却額そのものの計算ロジックは
// 一切再実装しない（計算はすべて depreciation.ts に委譲する）。
//
// 対象範囲・簡略化している点（コメントとして明示）:
// - このモジュールが生成するのは「定額法」の資産のみを対象とする別表十六（一）に
//   相当する明細である。asset.method が "declining-balance"（定率法）の資産は、
//   本来は別の様式「別表十六（二）減価償却資産の償却額の計算に関する明細書
//   （定率法）」に記載すべきものであり、このモジュールでは対象外とする
//   （別表十六（二）の生成は本パスのスコープ外。excludedDecliningBalanceAssets に
//   除外した資産の一覧を返すので、呼び出し側で別途案内すること）。
// - 少額減価償却資産の特例（取得価額30万円未満・全額即時償却）が適用された資産は、
//   本来は「別表十六（七）少額減価償却資産の取得価額の損金算入の特例に関する
//   明細書」に記載すべきものであり、別表十六（一）の対象外である。このモジュールも
//   同様に、特例が適用された資産（AssetDepreciationResult.immediateExpensingApplied
//   が true の資産）を除外し、excludedImmediateExpensingAssets に一覧を返す
//   （別表十六（七）の生成自体は本パスのスコープ外）。
// - 「種類」「構造」「細目」「事業の用に供した年月」など、正式な様式では取得年月日と
//   別に入力する欄がある。depreciation.ts の Asset は資産の種類・構造・細目を持たず、
//   事業供用開始日も取得年月日と別管理していないため、このモジュールでは
//   asset.name を「種類・名称」欄に、asset.acquisitionDate を「取得年月」欄と
//   「事業供用年月」欄の両方に転記する（取得月と事業供用開始月が異なる資産には
//   対応していない）。
// - 「圧縮記帳による積立金計上額」「割増償却額」「増加償却」等、正式な様式にある
//   欄は本アプリが対応する情報を保持していないため省略している（該当なしの前提）。
//   そのため「差引取得価額」は常に「取得価額」と同額、「本年分の償却費」は常に
//   「本年分の普通償却限度額」と同額（限度額いっぱいまで償却する前提）として扱う。
// - 定額法の償却率は、depreciation.ts と同じく「1 ÷ 耐用年数」の値をそのまま用いる。
//   国税庁の耐用年数省令別表八が定める、耐用年数ごとに丸められた公式の償却率
//   （例: 4年 → 0.250）とは、丸め処理をしない分わずかに異なる場合がある。
// ------------------------------------------------------------------

export const DEPRECIATION_SCHEDULE_FORM_LABEL = "別表十六（一）";
export const DEPRECIATION_SCHEDULE_FORM_TITLE =
  "減価償却資産の償却額の計算に関する明細書（定額法）";

/** 別表十六（一）の1資産あたりの行。列名は正式な様式の項目名に沿っている。 */
export interface DepreciationScheduleRow {
  assetId: string;
  /** 種類・名称（正式な様式の「種類」「構造」「細目」欄に相当。asset.nameをそのまま転記） */
  assetName: string;
  /** 取得年月日（正式な様式は「取得年月」だが、日単位の情報を保持しているためそのまま表示する） */
  acquisitionDate: string;
  /** 事業の用に供した年月日。asset.acquisitionDateをそのまま転記する（別管理未対応。上記コメント参照） */
  serviceStartDate: string;
  /** 耐用年数（年） */
  usefulLifeYears: number;
  /** 取得価額（円） */
  acquisitionCost: number;
  /** 差引取得価額（円）。圧縮記帳による積立金計上額を考慮しないため、取得価額と同額 */
  netAcquisitionCost: number;
  /** 償却の基礎になる金額（円）。定額法は取得価額（帳簿価額ではない）が基礎になるため、差引取得価額と同額 */
  depreciationBase: number;
  /** 償却方法（このモジュールの対象は定額法のみ） */
  depreciationMethod: "straight-line";
  /** 定額法の償却率（1 ÷ 耐用年数。国税庁の公式な丸め済み償却率表とは異なる場合がある） */
  depreciationRate: number;
  /** 当期事業供用月数（1ヶ月未満切り上げ。depreciation.tsのmonthsInServiceをそのまま転記） */
  monthsInService: number;
  /** 期首帳簿価額（円） */
  openingBookValue: number;
  /** 本年分の普通償却限度額（円）。割増償却は対象外のため、本年分の償却限度額と同額 */
  ordinaryDepreciationLimit: number;
  /** 本年分の償却費（円）。償却限度額いっぱいまで償却する前提のため、上記と同額 */
  currentYearDepreciationExpense: number;
  /** 期末減価償却累計額（円） */
  accumulatedDepreciation: number;
  /** 差引期末帳簿価額（円） */
  endingBookValue: number;
  /** 摘要（depreciation.tsのnotesおよび備忘価額到達等の補足） */
  remarks: string[];
}

export interface DepreciationScheduleTotals {
  acquisitionCostTotal: number;
  netAcquisitionCostTotal: number;
  depreciationBaseTotal: number;
  ordinaryDepreciationLimitTotal: number;
  currentYearDepreciationExpenseTotal: number;
  accumulatedDepreciationTotal: number;
  endingBookValueTotal: number;
}

export interface DepreciationScheduleForm {
  fiscalPeriod: FiscalPeriod;
  formLabel: typeof DEPRECIATION_SCHEDULE_FORM_LABEL;
  formTitle: typeof DEPRECIATION_SCHEDULE_FORM_TITLE;
  /** 定額法資産の明細行（別表十六（一）の本体） */
  rows: DepreciationScheduleRow[];
  /** rowsの合計行 */
  totals: DepreciationScheduleTotals;
  /** 定率法（asset.method === "declining-balance"）のため対象外とした資産（別表十六（二）の対象。本パスのスコープ外） */
  excludedDecliningBalanceAssets: Asset[];
  /** 少額減価償却資産の特例が適用されたため対象外とした資産（別表十六（七）の対象。本パスのスコープ外） */
  excludedImmediateExpensingAssets: Asset[];
  /** この下書きに関する注記（免責事項・除外資産の案内等） */
  notes: string[];
}

const RATE_ROUNDING_NOTE =
  "定額法の償却率は「1÷耐用年数」の値をそのまま用いています。国税庁の耐用年数省令別表八が定める、耐用年数ごとに丸められた公式の償却率とはわずかに異なる場合があります。";

function buildRow(asset: Asset, result: AssetDepreciationResult): DepreciationScheduleRow {
  const usefulLifeYears = Math.max(1, Math.floor(asset.usefulLifeYears) || 1);
  const acquisitionCost = Math.max(0, asset.acquisitionCost);
  const depreciationRate = usefulLifeYears > 0 ? 1 / usefulLifeYears : 0;

  const remarks: string[] = [...result.notes];
  if (result.fullyDepreciated) {
    remarks.push("備忘価額（1円）まで償却済みです。");
  }

  return {
    assetId: asset.id,
    assetName: asset.name,
    acquisitionDate: asset.acquisitionDate,
    serviceStartDate: asset.acquisitionDate,
    usefulLifeYears,
    acquisitionCost,
    netAcquisitionCost: acquisitionCost,
    depreciationBase: acquisitionCost,
    depreciationMethod: "straight-line",
    depreciationRate,
    monthsInService: result.monthsInService,
    openingBookValue: result.openingBookValue,
    ordinaryDepreciationLimit: result.currentYearDepreciation,
    currentYearDepreciationExpense: result.currentYearDepreciation,
    accumulatedDepreciation: result.accumulatedDepreciation,
    endingBookValue: result.endingBookValue,
    remarks,
  };
}

function sumRows(rows: DepreciationScheduleRow[]): DepreciationScheduleTotals {
  return {
    acquisitionCostTotal: rows.reduce((s, r) => s + r.acquisitionCost, 0),
    netAcquisitionCostTotal: rows.reduce((s, r) => s + r.netAcquisitionCost, 0),
    depreciationBaseTotal: rows.reduce((s, r) => s + r.depreciationBase, 0),
    ordinaryDepreciationLimitTotal: rows.reduce((s, r) => s + r.ordinaryDepreciationLimit, 0),
    currentYearDepreciationExpenseTotal: rows.reduce((s, r) => s + r.currentYearDepreciationExpense, 0),
    accumulatedDepreciationTotal: rows.reduce((s, r) => s + r.accumulatedDepreciation, 0),
    endingBookValueTotal: rows.reduce((s, r) => s + r.endingBookValue, 0),
  };
}

/**
 * 資産一覧と対象期間（事業年度）から、定額法資産についての別表十六（一）下書きを組み立てる。
 *
 * 資産ごとの減価償却額の計算そのものは depreciation.ts の calculateAssetDepreciation に
 * 委譲し、このモジュールは結果を別表の行・列構成にマッピングするのみ。
 * 定率法資産・少額減価償却資産の特例適用資産は対象外とし、それぞれ
 * excludedDecliningBalanceAssets / excludedImmediateExpensingAssets に振り分ける
 * （ファイル冒頭のコメント参照）。
 */
export function buildDepreciationScheduleForm(assets: Asset[], period: FiscalPeriod): DepreciationScheduleForm {
  const rows: DepreciationScheduleRow[] = [];
  const excludedDecliningBalanceAssets: Asset[] = [];
  const excludedImmediateExpensingAssets: Asset[] = [];

  for (const asset of assets) {
    const result = calculateAssetDepreciation(asset, period);

    if (result.immediateExpensingApplied) {
      excludedImmediateExpensingAssets.push(asset);
      continue;
    }
    if (result.method === "declining-balance") {
      excludedDecliningBalanceAssets.push(asset);
      continue;
    }
    rows.push(buildRow(asset, result));
  }

  const notes: string[] = [
    "本書類は固定資産台帳の登録内容に基づく別表十六（一）（定額法）の下書き・シミュレーションであり、正式に検証された別表そのものではありません。提出前に必ずご自身（または税理士等の専門家）がご確認ください。",
    RATE_ROUNDING_NOTE,
  ];
  if (excludedDecliningBalanceAssets.length > 0) {
    notes.push(
      `定率法を選択している資産（${excludedDecliningBalanceAssets
        .map((a) => a.name)
        .join("、")}）は、本来は別表十六（二）（定率法）に記載すべきものであり、この下書きの対象外としています。別表十六（二）の生成には対応していません。`
    );
  }
  if (excludedImmediateExpensingAssets.length > 0) {
    notes.push(
      `少額減価償却資産の特例が適用された資産（${excludedImmediateExpensingAssets
        .map((a) => a.name)
        .join("、")}）は、本来は別表十六（七）に記載すべきものであり、この下書きの対象外としています。別表十六（七）の生成には対応していません。`
    );
  }

  return {
    fiscalPeriod: period,
    formLabel: DEPRECIATION_SCHEDULE_FORM_LABEL,
    formTitle: DEPRECIATION_SCHEDULE_FORM_TITLE,
    rows,
    totals: sumRows(rows),
    excludedDecliningBalanceAssets,
    excludedImmediateExpensingAssets,
    notes,
  };
}
