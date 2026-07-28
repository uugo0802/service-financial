import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 家事按分（個人事業主向け）
//
// 自宅家賃・水道光熱費・通信費など「事業用と私用が混在する経費」について、
// ユーザーが設定した按分率（面積比・使用時間比など）を取引金額に適用し、
// 「事業経費として計上できる金額」と「家事関連費（経費対象外）」を計算する。
//
// 免責: docs/cto-tech-architecture.md 3.1章の通り、家事按分の「妥当な按分率」の
// 判断はLLM/ルールベースでも難易度が高く、税理士法上も個別具体の税務相談には
// 踏み込めない領域です。本モジュールは按分率をユーザー自身が入力する前提の
// 「計算」のみを行い、按分率そのものの妥当性判断は一切行いません。
// ------------------------------------------------------------------

/** 家事按分の対象になりやすい代表的な勘定科目（dictionary.ts の科目名と一致させる） */
export const ALLOCATABLE_ACCOUNTS: string[] = ["地代家賃", "水道光熱費", "通信費", "車両費"];

/** 按分率が「税務上グレーになりやすい」とみなす閾値（%）。0%側・100%側それぞれの目安 */
export const EXTREME_LOW_BUSINESS_USE_PERCENT = 5;
export const EXTREME_HIGH_BUSINESS_USE_PERCENT = 95;

/** デフォルトの按分率（ユーザーが未設定の場合のプレースホルダー値。妥当性を保証するものではない） */
export const DEFAULT_BUSINESS_USE_PERCENT = 50;

export const EXTREME_ALLOCATION_CAUTION =
  "按分率が0%または100%に近い設定です。税務署への説明に備え、床面積・使用時間など、その按分率を合理的に説明できる根拠（記録・写真・間取り図など）を残しておくことをおすすめします。なお、個別の按分率が妥当かどうかについては税理士法上の理由により本サービスから助言することはできません。必要に応じて税理士へご相談ください。";

export const ALLOCATION_GENERAL_NOTE =
  "家事按分の計算はユーザーが入力した按分率をそのまま金額に適用した概算です。按分率自体の妥当性（面積比・使用時間比などが税務上合理的か）については判断していません。最終的な按分率の決定と、その根拠資料の保管はご自身の責任で行ってください。";

/** 勘定科目名 → 事業按分率（0〜100の%） */
export type ExpenseAllocationRateMap = Record<string, number>;

export interface AllocationAmounts {
  /** 事業経費として計上できる金額（円、四捨五入） */
  businessAmount: number;
  /** 家事関連費（経費対象外）の金額（円）。totalAmount - businessAmount と一致する */
  personalAmount: number;
}

export interface AllocationResultLine extends AllocationAmounts {
  account: string;
  /** 対象取引の合計額（絶対値、按分前） */
  totalAmount: number;
  /** 適用した事業按分率（0〜100にクランプ済み） */
  businessUsePercent: number;
  /** 集計対象になった取引件数 */
  transactionCount: number;
  /** 按分率が極端（0%/100%に近い）な場合の一般的な注意文言。該当しない場合は undefined */
  caution?: string;
}

export interface ExpenseAllocationSummary {
  lines: AllocationResultLine[];
  totalBusinessAmount: number;
  totalPersonalAmount: number;
  generalNote: string;
}

/** 按分率を 0〜100 の範囲にクランプする（不正値は0扱い） */
export function clampBusinessUsePercent(percent: number): number {
  if (Number.isNaN(percent) || !Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/** 按分率が0%/100%付近の「税務上グレーになりやすい」範囲かどうか */
export function isExtremeAllocation(percent: number): boolean {
  const clamped = clampBusinessUsePercent(percent);
  return clamped <= EXTREME_LOW_BUSINESS_USE_PERCENT || clamped >= EXTREME_HIGH_BUSINESS_USE_PERCENT;
}

/**
 * 取引金額（絶対値・税込想定）に按分率を適用し、事業経費分と家事関連費分に分解する。
 * businessAmount + personalAmount は常に amountAbs と一致する（端数は家事関連費側に寄せる）。
 */
export function allocateAmount(amountAbs: number, businessUsePercent: number): AllocationAmounts {
  const safeAmount = Number.isFinite(amountAbs) ? Math.max(0, amountAbs) : 0;
  const percent = clampBusinessUsePercent(businessUsePercent);
  const businessAmount = Math.round((safeAmount * percent) / 100);
  const personalAmount = safeAmount - businessAmount;
  return { businessAmount, personalAmount };
}

/** 対象科目の初期按分率マップを作成する（UIの初期表示用。値はプレースホルダーであり妥当性は保証しない） */
export function createDefaultAllocationRates(
  accounts: string[] = ALLOCATABLE_ACCOUNTS,
  defaultPercent: number = DEFAULT_BUSINESS_USE_PERCENT
): ExpenseAllocationRateMap {
  return Object.fromEntries(accounts.map((account) => [account, defaultPercent]));
}

/**
 * 取引明細を勘定科目ごとに集計し、按分率マップ（rates）で指定された科目について
 * 事業経費分・家事関連費分を計算する。rates に按分率が設定されていない科目は集計対象外。
 * 収入（amount >= 0）は対象外。
 */
export function summarizeExpenseAllocation(
  transactions: Pick<CategorizedTransaction, "account" | "amount">[],
  rates: ExpenseAllocationRateMap
): ExpenseAllocationSummary {
  const totalsByAccount = new Map<string, { total: number; count: number }>();

  for (const t of transactions) {
    if (t.amount >= 0) continue; // 支出（経費）のみが按分対象
    if (!(t.account in rates)) continue; // 按分率が設定されていない科目は対象外

    const abs = Math.abs(t.amount);
    const entry = totalsByAccount.get(t.account) ?? { total: 0, count: 0 };
    entry.total += abs;
    entry.count += 1;
    totalsByAccount.set(t.account, entry);
  }

  const lines: AllocationResultLine[] = Array.from(totalsByAccount.entries())
    .map(([account, { total, count }]) => {
      const percent = clampBusinessUsePercent(rates[account]);
      const { businessAmount, personalAmount } = allocateAmount(total, percent);
      return {
        account,
        totalAmount: total,
        businessUsePercent: percent,
        businessAmount,
        personalAmount,
        transactionCount: count,
        caution: isExtremeAllocation(percent) ? EXTREME_ALLOCATION_CAUTION : undefined,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const totalBusinessAmount = lines.reduce((sum, l) => sum + l.businessAmount, 0);
  const totalPersonalAmount = lines.reduce((sum, l) => sum + l.personalAmount, 0);

  return {
    lines,
    totalBusinessAmount,
    totalPersonalAmount,
    generalNote: ALLOCATION_GENERAL_NOTE,
  };
}
