/**
 * 料金プランの定義データ。
 *
 * docs/business-plan.md §8「料金モデル（仮）」に基づく暫定プラン。
 * 同ドキュメントでも「例（要検証）」「価格戦略は競合調査後に確定」と明記されている通り、
 * ここに定義する金額は最終確定額ではなく、変更の可能性がある試算値として扱うこと。
 * UI側（pricing/page.tsx）でも「仮の料金」である旨を必ず表示する。
 */

export interface PricingPlan {
  /** プランの一意識別子（URLやテストでの参照に使う安定した英字キー） */
  id: string;
  /** 表示用プラン名（日本語） */
  name: string;
  /** 想定ターゲット層の説明 */
  targetSegment: string;
  /** 月額料金（税抜・円）。「〜/月」の起点価格として表示する */
  monthlyPriceFrom: number;
  /** プランに含まれる機能・提供内容の一覧 */
  features: string[];
  /** プラン固有の補足注記（任意） */
  note?: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "freelance",
    name: "フリーランスプラン",
    targetSegment: "フリーランス・個人事業主（所得税確定申告・インボイス対応）",
    monthlyPriceFrom: 980,
    features: [
      "銀行・カード明細のCSV取り込みとAI自動仕訳",
      "所得税確定申告書・青色申告決算書の下書き自動生成",
      "e-Tax送信手順ガイド（送信操作はご自身の権限で実施）",
      "売上・経費推移のダッシュボード表示",
    ],
    note: "確定申告シーズンのみのスポット利用プランも検討中です。",
  },
  {
    id: "micro-corp",
    name: "マイクロ法人プラン",
    targetSegment: "マイクロ法人（一人社長など、法人税・消費税・年末調整/源泉が必要な事業者）",
    monthlyPriceFrom: 2980,
    features: [
      "銀行・カード明細のCSV取り込みとAI自動仕訳",
      "消費税・法人税の概算試算（申告書全体の自動生成はPhase 1では対象外）",
      "決算書関連（貸借対照表・損益計算書等）の下書き作成",
      "eLTAX送信手順ガイド（送信操作はご自身の権限で実施）",
      "提携税理士への紹介導線（個別相談は別料金）",
    ],
    note: "将来的に法人税申告書のフル自動生成（別表対応）を拡張予定です。",
  },
];

/** 比較訴求用：税理士顧問料の一般的なレンジ（business-plan.md §8 に基づく） */
export const TAX_ACCOUNTANT_MONTHLY_FEE_RANGE = {
  minYen: 20_000,
  maxYen: 50_000,
} as const;
