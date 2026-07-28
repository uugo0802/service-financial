import Link from "next/link";
import { getPartnerCategory, PartnerCategoryId } from "@/lib/partnerReferral/partnerReferral";

interface PartnerReferralBannerProps {
  /**
   * 表示すべきパートナーカテゴリ（`recommendPartnerCategories` の戻り値を想定）。
   * 空配列の場合はバナー自体を表示しない。
   */
  categories: PartnerCategoryId[];
}

/**
 * ダッシュボード等、財務状況を確認できる画面から、
 * ユーザーの状況に応じた他業種パートナー（投資・保険・ローン・不動産）の紹介ページへ誘導するバナー。
 * AdvisorReferralBanner（提携税理士への送客）と同じパターンを踏襲する。
 */
export function PartnerReferralBanner({ categories }: PartnerReferralBannerProps) {
  if (categories.length === 0) return null;

  const labels = categories.map((id) => getPartnerCategory(id).label);

  return (
    <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between print:hidden">
      <div>
        <div className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          あなたの事業状況に合う提携先のご紹介
        </div>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400 leading-relaxed max-w-xl">
          記帳データの傾向から、{labels.join("・")}分野の提携先情報のご案内が可能です。
          これは当社による推奨・助言ではなく、情報提供・送客のみです。契約・相談内容の詳細は提携先にご確認ください。
        </p>
      </div>
      <Link
        href="/partner-referral"
        className="shrink-0 self-start sm:self-center text-sm px-5 py-3 border border-stone-900 dark:border-stone-50 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-50 hover:bg-stone-900 hover:text-white dark:hover:bg-stone-50 dark:hover:text-stone-900 transition-colors whitespace-nowrap"
      >
        提携先の紹介を見る
      </Link>
    </div>
  );
}
