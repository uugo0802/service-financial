import { TrendPoint } from "@/lib/tax/salesTrend";

// ------------------------------------------------------------------
// 他業種パートナー（投資・保険・ローン・不動産）への送客機能。
// advisorReferral/referralForm.ts（提携税理士への送客）と同じパターンを踏襲する。
//
// 重要（法的ポジション）:
// 本サービスは投資助言・保険募集・貸金業・宅建業のいずれの登録・免許も保有しない。
// ここで扱うのは「提携先の紹介・送客」のみであり、個別の商品推奨や助言は行わない。
// 文言・UIは必ず「情報提供・送客のみ」「契約・相談内容は提携先に確認」を明示すること。
// ------------------------------------------------------------------

export type PartnerCategoryId = "investment" | "insurance" | "loan" | "realestate";

export interface PartnerCategoryDefinition {
  id: PartnerCategoryId;
  label: string;
  /** バナー・一覧で使う短い紹介文 */
  shortDescription: string;
  /** どんな状況のユーザーに表示されるか（詳細ページでの説明用） */
  triggerHint: string;
}

// 表示順はここでの定義順に統一する（バナー・詳細ページ・フォームの選択肢すべて）
export const PARTNER_CATEGORIES: readonly PartnerCategoryDefinition[] = [
  {
    id: "investment",
    label: "投資",
    shortDescription: "事業の余剰資金の運用先について、提携先の情報提供を受けられます。",
    triggerHint: "黒字が継続し、一定水準以上の利益が出ている場合に表示されます。",
  },
  {
    id: "insurance",
    label: "保険",
    shortDescription: "事業保障・節税目的の保険商品について、提携先の情報提供を受けられます。",
    triggerHint: "黒字が継続している場合に表示されます。",
  },
  {
    id: "loan",
    label: "ローン",
    shortDescription: "事業拡大に伴う資金調達（融資）について、提携先の情報提供を受けられます。",
    triggerHint: "売上が前年から大きく伸びている場合に表示されます。",
  },
  {
    id: "realestate",
    label: "不動産",
    shortDescription: "事業用・資産管理用の不動産について、提携先の情報提供を受けられます。",
    triggerHint: "黒字が継続し、特に高い利益水準が出ている場合に表示されます。",
  },
] as const;

export function getPartnerCategory(id: PartnerCategoryId): PartnerCategoryDefinition {
  const category = PARTNER_CATEGORIES.find((c) => c.id === id);
  if (!category) {
    throw new Error(`unknown partner category id: ${id}`);
  }
  return category;
}

// ------------------------------------------------------------------
// 財務状況に基づく表示カテゴリの判定ロジック
// ------------------------------------------------------------------

/** 「黒字継続」とみなすために必要な直近連続年数 */
export const CONTINUOUS_PROFIT_MIN_YEARS = 2;
/** 投資カテゴリを表示する、直近年の平均利益のしきい値（円） */
export const INVESTMENT_MIN_AVG_PROFIT = 1_000_000;
/** 不動産カテゴリを表示する、直近年の平均利益のしきい値（円） */
export const REALESTATE_MIN_AVG_PROFIT = 5_000_000;
/** ローンカテゴリを表示する、前年比の売上成長率のしきい値 */
export const LOAN_MIN_REVENUE_GROWTH_RATE = 0.2;

function isAscendingByKey(points: readonly TrendPoint[]): boolean {
  for (let i = 1; i < points.length; i++) {
    if (points[i].key < points[i - 1].key) return false;
  }
  return true;
}

/**
 * 年次の売上・損益推移（`buildYearlyTrend` の出力、key昇順を想定）から、
 * ユーザーに表示すべきパートナーカテゴリを判定する。
 *
 * 判定基準（要件: 「黒字継続・一定利益水準など」に基づく客観的な条件のみを用いる。
 * 個別の商品推奨・投資助言には当たらない、表示要否の判定に限定する）:
 * - 保険: 直近 `CONTINUOUS_PROFIT_MIN_YEARS` 年連続で黒字
 * - 投資: 上記に加え、直近年の平均利益が `INVESTMENT_MIN_AVG_PROFIT` 以上
 * - 不動産: 上記に加え、直近年の平均利益が `REALESTATE_MIN_AVG_PROFIT` 以上
 * - ローン: 直近年の売上が前年から `LOAN_MIN_REVENUE_GROWTH_RATE` 以上成長（資金需要の高まりの目安）
 */
export function recommendPartnerCategories(yearlyTrend: readonly TrendPoint[]): PartnerCategoryId[] {
  if (yearlyTrend.length === 0) return [];

  // 呼び出し側の実装ミスで降順に渡された場合でも壊れないよう、昇順を保証する
  const sorted = isAscendingByKey(yearlyTrend)
    ? yearlyTrend
    : [...yearlyTrend].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const recentYears = sorted.slice(-CONTINUOUS_PROFIT_MIN_YEARS);
  const continuouslyProfitable =
    recentYears.length >= CONTINUOUS_PROFIT_MIN_YEARS && recentYears.every((p) => p.profit > 0);
  const avgRecentProfit =
    recentYears.length > 0 ? recentYears.reduce((sum, p) => sum + p.profit, 0) / recentYears.length : 0;

  const categories: PartnerCategoryId[] = [];

  if (continuouslyProfitable) {
    categories.push("insurance");
    if (avgRecentProfit >= INVESTMENT_MIN_AVG_PROFIT) {
      categories.push("investment");
    }
  }

  if (sorted.length >= 2) {
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (previous.income > 0) {
      const growthRate = (latest.income - previous.income) / previous.income;
      if (growthRate >= LOAN_MIN_REVENUE_GROWTH_RATE) {
        categories.push("loan");
      }
    }
  }

  if (continuouslyProfitable && avgRecentProfit >= REALESTATE_MIN_AVG_PROFIT) {
    categories.push("realestate");
  }

  // PARTNER_CATEGORIES の表示順に揃える
  const order = new Map(PARTNER_CATEGORIES.map((c, i) => [c.id, i]));
  return categories.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

// ------------------------------------------------------------------
// 送客フォーム（advisorReferral/referralForm.ts のパターンを踏襲）
// ------------------------------------------------------------------

export type EntityType = "individual" | "corp";

export interface PartnerReferralFormValues {
  name: string;
  email: string;
  phone: string;
  entityType: EntityType;
  category: PartnerCategoryId | "";
  message: string;
  consent: boolean;
}

export const EMPTY_PARTNER_REFERRAL_FORM: PartnerReferralFormValues = {
  name: "",
  email: "",
  phone: "",
  entityType: "corp",
  category: "",
  message: "",
  consent: false,
};

export type PartnerReferralFormErrors = Partial<Record<keyof PartnerReferralFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 日本の電話番号（固定・携帯）を緩めに許容: 数字・ハイフンのみ、9〜13桁程度
const PHONE_PATTERN = /^[0-9-]{9,15}$/;

const MESSAGE_MIN_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 2000;
const NAME_MAX_LENGTH = 60;

export function validatePartnerReferralForm(values: PartnerReferralFormValues): PartnerReferralFormErrors {
  const errors: PartnerReferralFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "お名前・法人名を入力してください。";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `お名前・法人名は${NAME_MAX_LENGTH}文字以内で入力してください。`;
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "メールアドレスを入力してください。";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "メールアドレスの形式が正しくありません。";
  }

  const phone = values.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.phone = "電話番号はハイフン区切りの数字で入力してください（任意項目）。";
  }

  if (!values.category) {
    errors.category = "ご興味のあるカテゴリを選択してください。";
  }

  const message = values.message.trim();
  if (!message) {
    errors.message = "ご相談内容の詳細を入力してください。";
  } else if (message.length < MESSAGE_MIN_LENGTH) {
    errors.message = `ご相談内容は${MESSAGE_MIN_LENGTH}文字以上で入力してください（提携先が概要を把握できる程度の情報が必要です）。`;
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = `ご相談内容は${MESSAGE_MAX_LENGTH}文字以内で入力してください。`;
  }

  if (!values.consent) {
    errors.consent = "提携先への情報連携について同意が必要です。";
  }

  return errors;
}

export function isPartnerReferralFormValid(errors: PartnerReferralFormErrors): boolean {
  return Object.keys(errors).length === 0;
}

export interface PartnerReferralSubmission {
  submittedAt: string;
  values: PartnerReferralFormValues;
}

/**
 * バックエンドは未接続のため、送信内容をコンソールに出力するモック実装。
 * 実際の連携先（各提携パートナーへの通知API等）が決まり次第、この関数の中身のみ差し替える想定。
 */
export async function submitPartnerReferralForm(
  values: PartnerReferralFormValues,
): Promise<PartnerReferralSubmission> {
  const submission: PartnerReferralSubmission = {
    submittedAt: new Date().toISOString(),
    values,
  };
  console.info("[partner-referral] submission (mock)", submission);
  return submission;
}
