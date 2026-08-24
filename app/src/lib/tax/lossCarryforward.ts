// ------------------------------------------------------------------
// 繰越欠損金 / 純損失の繰越控除（青色申告を前提）。
//
// 免責: これは正式な確定申告書・法人税申告書の計算ではなく、概算シミュレーションです。
// 青色申告の承認を受けていること、および過去に適正に確定申告（純損失の繰越控除の届出／
// 欠損金の繰越）を行っていることを前提とした概算であり、実際の繰越可能額は税務署への
// 提出書類・修正申告の有無等により異なる場合があります。必ずご自身（または税理士）の
// 確認を経てください。
//
// 対応する制度（本モジュールが計算するもの）:
//   - 個人（青色申告）: 所得税法70条 純損失の繰越控除。損失が生じた年の翌年以後3年間、
//     各年分の総所得金額から控除できる。
//   - 法人（青色申告）: 法人税法57条 青色申告書を提出した事業年度の欠損金の繰越控除。
//     平成30年4月1日以後に開始する事業年度に生じた欠損金は10年間繰り越せる
//     （それより前に生じた欠損金は9年）。本アプリは新しい10年ルールのみを前提とする
//     （古い9年ルールの欠損金が残っている利用者は稀と想定し、保守的に扱いたい場合は
//     呼び出し側でpriorLossesの対象年度自体を絞り込むこと）。
//
// このモジュールが対応しないもの（引き続き利用者自身の確認が必要）:
//   - 白色申告（青色申告の承認を受けていない）の場合の純損失の繰越控除（対象は
//     一部の被災損失等に限定され、本モジュールは対象外）。
//   - 欠損金の繰戻しによる還付（法人税法80条、中小法人等が利用できる制度）。
//   - 大法人・大法人の100%子会社等における欠損金控除限度額50%ルールの自動判定
//     （呼び出し側が deductionCapRatio を明示的に指定しない限り、本モジュールは
//     「中小法人等（資本金1億円以下）は上限なし」という前提で計算する。これは
//     corporateEstimate.ts が既に軽減税率の適用対象として置いている前提と同じもの）。
//   - 会社分割・合併等の組織再編に伴う欠損金の引継ぎ制限。
// ------------------------------------------------------------------

/** 個人（青色申告）の純損失繰越控除: 翌年以後3年間 */
export const INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS = 3;

/** 法人（青色申告）の欠損金繰越控除: 平成30年4月1日以後開始事業年度に生じた欠損金は10年間 */
export const CORPORATE_LOSS_CARRYFORWARD_WINDOW_YEARS = 10;

/** 年度ごとに繰り越されている、まだ使用・失効していない欠損金（円） */
export interface PriorYearLoss {
  /** 損失が発生した年度（例: 2023 は「2023年分/期」を表す） */
  fiscalYear: number;
  /** その年度から繰り越されている未使用の損失残額（円、正の値） */
  remainingLoss: number;
}

export type LossCarryforwardUsageStatus = "used" | "partially_used" | "unused" | "expired";

export interface LossCarryforwardYearUsage {
  fiscalYear: number;
  /** 当期の相殺計算前における、その年度分の未使用残額 */
  unusedLossBeforeThisYear: number;
  /** 当期に相殺（控除）に使用した額 */
  usedThisYear: number;
  status: LossCarryforwardUsageStatus;
}

export interface LossCarryforwardResult {
  /** 繰越控除を適用する前の所得金額（個人: 青色申告特別控除後の事業所得相当額、法人: 別表調整前の所得金額） */
  incomeBeforeCarryforward: number;
  /** 当期に控除できた繰越損失の合計額 */
  totalDeduction: number;
  /** 繰越控除適用後の所得金額（0円未満への丸めは呼び出し側の責務） */
  incomeAfterCarryforward: number;
  /** 繰越元年度ごとの使用状況（古い年度から順） */
  usage: LossCarryforwardYearUsage[];
  /** UI表示・ログ用の補足メモ */
  notes: string[];
}

interface ApplyLossCarryforwardOptions {
  /** 概算対象の年度（例: 2026） */
  currentFiscalYear: number;
  /** 繰越控除適用前の所得金額 */
  incomeBeforeCarryforward: number;
  /** 前年以前から繰り越されている未使用の損失一覧（順不同で可） */
  priorLosses: PriorYearLoss[];
  /** 繰越が有効な年数（個人=3年、法人=10年） */
  carryforwardWindowYears: number;
  /** 所得に対する控除限度額の割合（0〜1）。省略時は1（上限なし） */
  deductionCapRatio?: number;
}

/**
 * 繰越欠損金・純損失の繰越控除の共通ロジック。
 *
 * - 繰越元年度が古いものから順（FIFO）に控除する（先に期限切れになる古い損失から
 *   使い切るのが納税者に有利であり、かつ実務上の一般的な取り扱いに沿う）。
 * - currentFiscalYear - loss.fiscalYear が 1〜carryforwardWindowYears の範囲内にある
 *   ものだけが当期の控除対象（範囲外は "expired" として控除せず除外）。
 * - loss.fiscalYear が currentFiscalYear 以降（同年・未来）のエントリは不正な入力として
 *   無視し、notesに記録する。
 */
function applyLossCarryforwardCore(options: ApplyLossCarryforwardOptions): LossCarryforwardResult {
  const { currentFiscalYear, incomeBeforeCarryforward, priorLosses, carryforwardWindowYears } = options;
  const deductionCapRatio = options.deductionCapRatio ?? 1;

  const notes: string[] = [];

  const sorted = priorLosses
    .filter((loss) => {
      if (loss.remainingLoss <= 0) return false;
      const age = currentFiscalYear - loss.fiscalYear;
      if (age < 1) {
        notes.push(
          `繰越元年度(${loss.fiscalYear})が対象年度(${currentFiscalYear})以降のため、入力エラーとして無視しました`
        );
        return false;
      }
      return true;
    })
    .sort((a, b) => a.fiscalYear - b.fiscalYear); // 古い年度から順（FIFO）

  // 控除限度額。マイナスの所得に対しては控除の余地がないため0円に丸める
  // （当期自体が赤字の場合、その赤字を新たな繰越欠損金として計上する処理は
  // このモジュールのスコープ外＝呼び出し側の責務）。
  const deductionCap = Math.max(0, Math.floor(incomeBeforeCarryforward * deductionCapRatio));
  let remainingBudget = deductionCap;
  let totalDeduction = 0;

  const usage: LossCarryforwardYearUsage[] = sorted.map((loss) => {
    const age = currentFiscalYear - loss.fiscalYear;
    const expired = age > carryforwardWindowYears;

    if (expired) {
      return {
        fiscalYear: loss.fiscalYear,
        unusedLossBeforeThisYear: loss.remainingLoss,
        usedThisYear: 0,
        status: "expired" as const,
      };
    }

    const used = Math.min(loss.remainingLoss, remainingBudget);
    remainingBudget -= used;
    totalDeduction += used;

    const status: LossCarryforwardUsageStatus =
      used === 0 ? "unused" : used < loss.remainingLoss ? "partially_used" : "used";

    return {
      fiscalYear: loss.fiscalYear,
      unusedLossBeforeThisYear: loss.remainingLoss,
      usedThisYear: used,
      status,
    };
  });

  if (usage.some((u) => u.status === "expired")) {
    notes.push(
      `繰越期限（${carryforwardWindowYears}年）を超えたため控除できなかった年度があります: ` +
        usage
          .filter((u) => u.status === "expired")
          .map((u) => `${u.fiscalYear}年度`)
          .join("、")
    );
  }
  if (deductionCapRatio < 1) {
    notes.push(`控除限度額は所得金額の${Math.round(deductionCapRatio * 100)}%までとして計算しています`);
  }

  return {
    incomeBeforeCarryforward,
    totalDeduction,
    incomeAfterCarryforward: incomeBeforeCarryforward - totalDeduction,
    usage,
    notes,
  };
}

/**
 * 個人（青色申告）の純損失繰越控除を適用する。
 *
 * 所得税法70条により、控除に所得比例の上限はない（法人のような50%上限規定は個人には
 * 存在しない）ため、常に deductionCapRatio = 1（上限なし）で計算する。
 *
 * @param currentFiscalYear 概算対象の年度
 * @param incomeBeforeCarryforward 繰越控除適用前の所得金額（事業所得＝収入-必要経費-青色申告特別控除後の額を想定）
 * @param priorLosses 前年以前から繰り越されている未使用の純損失一覧
 */
export function applyIndividualLossCarryforward(
  currentFiscalYear: number,
  incomeBeforeCarryforward: number,
  priorLosses: PriorYearLoss[] = []
): LossCarryforwardResult {
  return applyLossCarryforwardCore({
    currentFiscalYear,
    incomeBeforeCarryforward,
    priorLosses,
    carryforwardWindowYears: INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS,
    deductionCapRatio: 1,
  });
}

export interface CorporateLossCarryforwardOptions {
  /**
   * 所得金額に対する欠損金控除限度額の割合（0〜1）。省略時は1（上限なし）。
   *
   * 中小法人等（各事業年度終了の時において資本金の額が1億円以下である普通法人で、
   * 資本金5億円以上の大法人による完全支配関係がないもの等）は欠損金の控除限度額の
   * 定めがなく、所得金額の100%まで控除できる（法人税法57条11項）。大法人は所得の
   * 50%が上限。corporateEstimate.tsは既に「資本金1億円以下の中小法人」を前提に
   * 軽減税率等を計算しているため、本モジュールも同じ前提を踏襲し既定値は1（上限なし）
   * とする。資本金1億円超などで50%上限の適用が必要なケースのみ、呼び出し側が明示的に
   * 0.5等を指定すること。
   */
  deductionCapRatio?: number;
}

/**
 * 法人（青色申告）の欠損金繰越控除を適用する。
 *
 * @param currentFiscalYear 概算対象の事業年度
 * @param incomeBeforeCarryforward 繰越控除適用前の所得金額（別表調整前、益金-損金の簡易計算額を想定）
 * @param priorLosses 前期以前から繰り越されている未使用の欠損金一覧
 */
export function applyCorporateLossCarryforward(
  currentFiscalYear: number,
  incomeBeforeCarryforward: number,
  priorLosses: PriorYearLoss[] = [],
  options?: CorporateLossCarryforwardOptions
): LossCarryforwardResult {
  return applyLossCarryforwardCore({
    currentFiscalYear,
    incomeBeforeCarryforward,
    priorLosses,
    carryforwardWindowYears: CORPORATE_LOSS_CARRYFORWARD_WINDOW_YEARS,
    deductionCapRatio: options?.deductionCapRatio ?? 1,
  });
}

/** yearArchive等、年度ごとの所得金額（黒字/赤字）の推移から未使用の繰越損失を再構成するための入力1件分 */
export interface FiscalYearIncomeRecord {
  fiscalYear: number;
  /**
   * その年度の所得金額相当額（黒字はプラス、赤字はマイナス）。繰越控除適用前の値を想定。
   * 個人の場合は青色申告特別控除後の事業所得、法人の場合は別表調整前の所得金額（≒
   * yearArchive.ts の revenue - expenses）を渡す運用を想定している。個々の年度の
   * 青色申告特別控除の適用区分・社会保険料控除額等の詳細まではアーカイブに保存されて
   * いないため、このシミュレーションはあくまで概算である点に注意。
   */
  income: number;
}

/**
 * 年度ごとの所得金額の履歴（例: yearArchive.ts の記録）から、asOfFiscalYear時点でまだ
 * 使用・失効していない繰越損失の一覧を再構成する。
 *
 * 履歴を古い年度から順にたどり、黒字の年度では（その時点で有効な）過去の繰越損失を
 * 古い年度から順に相殺し、赤字の年度では新たな繰越損失として積み増す。青色申告者は
 * 純損失の繰越控除を毎年適用することが前提となる制度のため、履歴上の黒字年度では
 * 常に繰越控除を全額（限度額の範囲内で）適用済みだったものとして計算する。
 *
 * @param history fiscalYear昇順である必要はない（内部でソートする）
 * @param asOfFiscalYear この年度時点でまだ有効な（期限内の）繰越損失を返す
 * @param carryforwardWindowYears 個人=INDIVIDUAL_LOSS_CARRYFORWARD_WINDOW_YEARS、法人=CORPORATE_LOSS_CARRYFORWARD_WINDOW_YEARS
 * @param deductionCapRatio 法人で控除限度額の上限割合を考慮する場合に指定（既定1=上限なし）
 */
export function deriveUnusedPriorLosses(
  history: FiscalYearIncomeRecord[],
  asOfFiscalYear: number,
  carryforwardWindowYears: number,
  deductionCapRatio = 1
): PriorYearLoss[] {
  const sorted = [...history].filter((h) => h.fiscalYear < asOfFiscalYear).sort((a, b) => a.fiscalYear - b.fiscalYear);

  let losses: PriorYearLoss[] = [];

  for (const year of sorted) {
    if (year.income > 0) {
      const result = applyLossCarryforwardCore({
        currentFiscalYear: year.fiscalYear,
        incomeBeforeCarryforward: year.income,
        priorLosses: losses,
        carryforwardWindowYears,
        deductionCapRatio,
      });
      losses = result.usage
        .filter((u) => u.status !== "expired")
        .map((u) => ({ fiscalYear: u.fiscalYear, remainingLoss: u.unusedLossBeforeThisYear - u.usedThisYear }))
        .filter((l) => l.remainingLoss > 0);
    } else {
      // 黒字でない年度: 相殺は発生しないが、この年度時点で期限切れになった過去分は落としておく
      losses = losses.filter((l) => year.fiscalYear - l.fiscalYear <= carryforwardWindowYears);
      if (year.income < 0) {
        losses.push({ fiscalYear: year.fiscalYear, remainingLoss: -year.income });
      }
    }
  }

  // asOfFiscalYear時点でまだ期限内（1年以上carryforwardWindowYears年以内）の損失のみを返す
  return losses.filter((l) => {
    const age = asOfFiscalYear - l.fiscalYear;
    return age >= 1 && age <= carryforwardWindowYears;
  });
}
