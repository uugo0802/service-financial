import type { PricingPlan } from "../pricing/plans";
import { PrintableField, selectPrintVisibleFields } from "../export/printLayout";

// ------------------------------------------------------------------
// テナントの現在のサブスクリプション状態と、過去の請求（領収書）履歴を扱う純粋関数群。
//
// 決済ゲートウェイ（Stripe等）とのライブ連携は本スコープ外（本アプリはAPIキー等を持たない）。
// src/lib/invoice/receivables.ts と同様、既にテナント自身の請求記録ストアに保存されている
// 「過去の記録」（ChargeRecord[]）を入力として受け取り、画面表示用に加工するだけの
// 純粋関数として実装する。ライブなAPI呼び出しは一切行わない。
//
// プラン名・月額料金そのものの正データは src/lib/pricing/plans.ts の PRICING_PLANS。
// このモジュールは料金プランを再定義せず、呼び出し側（settings/billing/page.tsx）から
// PRICING_PLANS を渡してもらい、プランIDからの表示名解決にのみ利用する。
//
// 印刷／PDF保存レイアウトのフィールド組み立ては、src/lib/invoice/invoicePrintLayout.ts /
// src/lib/export/printLayout.ts と同じ「PrintableField + selectPrintVisibleFields」の
// パターンに揃え、新規PDFライブラリへの依存は増やさない
// （docs/cto-tech-architecture.md 2章の低ランニングコスト方針に準拠）。
// ------------------------------------------------------------------

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/** 画面表示用のステータスラベル。文言はここを唯一の出典とする。 */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "無料トライアル中",
  active: "契約中",
  past_due: "お支払いに問題があります",
  canceled: "解約済み",
};

export interface Subscription {
  tenantId: string;
  /** src/lib/pricing/plans.ts の PricingPlan.id と対応するプランID */
  planId: string;
  status: SubscriptionStatus;
  /** 現在の請求期間の開始日（ISO日付文字列 "YYYY-MM-DD"） */
  currentPeriodStart: string;
  /** 現在の請求期間の終了日（ISO日付文字列）。契約中/トライアル中はこの日が次回請求日にあたる */
  currentPeriodEnd: string;
}

export interface ChargeRecord {
  /** テナントの請求記録ストアにおける一意なID */
  id: string;
  /** 請求（決済）日（ISO日付文字列） */
  date: string;
  /** 請求金額（円、税込）。無料トライアル期間中の請求は0円になり得る */
  amount: number;
  /** 請求対象プランのID（当時のプラン。後でプランが変更されても過去の記録は変わらない） */
  planId: string;
  /** 請求時点のプラン表示名のスナップショット（pricing/plans.ts側でプラン名が変わっても過去領収書の表示は変えない） */
  planName: string;
  /** 領収書番号 */
  receiptNumber: string;
}

export interface ReceiptHistoryEntry extends ChargeRecord {
  /** 表示用の日付ラベル（例: "2026年7月31日"） */
  dateLabel: string;
  /** 0円請求（無料トライアル等）かどうか */
  isZeroAmount: boolean;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * ISO日付文字列（"YYYY-MM-DD"）を「YYYY年M月D日」の表示用ラベルに変換する。
 * 未入力・不正な日付の場合は「未設定」を返す（タイムゾーン依存の挙動を避けるため
 * Date型ではなく文字列を直接パースする。invoicePrintLayout.tsのformatInvoiceDateLabelと同じ方針）。
 */
export function formatBillingDateLabel(dateIso: string | null | undefined): string {
  const parsed = parseIsoDate(dateIso);
  if (!parsed) return "未設定";
  return `${parsed.y}年${parsed.m}月${parsed.d}日`;
}

/**
 * サブスクリプションのplanIdから、プランカタログ（PRICING_PLANS）上の表示名を解決する。
 * カタログに存在しないplanId（旧プラン等）の場合はplanIdをそのまま表示に使う。
 */
export function resolveCurrentPlanName(subscription: Subscription, plans: PricingPlan[]): string {
  const plan = plans.find((p) => p.id === subscription.planId);
  return plan ? plan.name : `不明なプラン（${subscription.planId}）`;
}

/**
 * 次回請求日を計算する。
 * - 解約済み（canceled）の場合、以後の請求は発生しないため null
 * - それ以外（トライアル中/契約中/支払い遅延中）は、現在の請求期間の終了日
 *   （currentPeriodEnd）が次回請求日にあたる
 * - currentPeriodEndが不正な日付文字列の場合は null（呼び出し側でガードする）
 */
export function computeNextBillingDate(subscription: Subscription): string | null {
  if (subscription.status === "canceled") return null;
  return parseIsoDate(subscription.currentPeriodEnd) ? subscription.currentPeriodEnd : null;
}

/**
 * 次回請求日の表示用ラベル。解約済みの場合は請求が発生しない旨を、
 * 日付が不正な場合は「未設定」を返す。
 */
export function formatNextBillingDateLabel(subscription: Subscription): string {
  if (subscription.status === "canceled") return "解約済みのため次回請求はありません";
  return formatBillingDateLabel(computeNextBillingDate(subscription));
}

export interface CurrentSubscriptionView {
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  statusLabel: string;
  currentPeriodStartLabel: string;
  currentPeriodEndLabel: string;
  nextBillingDate: string | null;
  nextBillingDateLabel: string;
}

/**
 * 現在のプラン・契約状況・次回請求日を、画面表示にそのまま使える形にまとめる。
 */
export function buildCurrentSubscriptionView(subscription: Subscription, plans: PricingPlan[]): CurrentSubscriptionView {
  return {
    planId: subscription.planId,
    planName: resolveCurrentPlanName(subscription, plans),
    status: subscription.status,
    statusLabel: SUBSCRIPTION_STATUS_LABELS[subscription.status],
    currentPeriodStartLabel: formatBillingDateLabel(subscription.currentPeriodStart),
    currentPeriodEndLabel: formatBillingDateLabel(subscription.currentPeriodEnd),
    nextBillingDate: computeNextBillingDate(subscription),
    nextBillingDateLabel: formatNextBillingDateLabel(subscription),
  };
}

/**
 * 請求記録（ChargeRecord[]）から、画面表示用の領収書履歴を組み立てる。
 * 日付降順（新しい順）に並べ、同日の場合はreceiptNumber降順で安定させる。
 * 請求記録が1件もない場合（契約直後でまだ請求が発生していない等）は空配列を返す
 * （例外は投げない）。
 */
export function buildReceiptHistory(charges: ChargeRecord[]): ReceiptHistoryEntry[] {
  return (charges ?? [])
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.receiptNumber < b.receiptNumber ? 1 : a.receiptNumber > b.receiptNumber ? -1 : 0;
    })
    .map((charge) => ({
      ...charge,
      dateLabel: formatBillingDateLabel(charge.date),
      isZeroAmount: charge.amount === 0,
    }));
}

export interface BillingHistorySummary {
  /** 請求記録が1件でもあるか（「まだ請求履歴がありません」表示の判定に使う） */
  hasHistory: boolean;
  /** 請求件数 */
  chargeCount: number;
  /** 支払済み合計金額（円）。0円請求（トライアル等）も件数には含むが金額は加算されない */
  totalPaidAmount: number;
  /** 直近の請求に紐づくプランID（履歴が空の場合はnull） */
  latestPlanId: string | null;
}

/**
 * 請求履歴の集計（件数・合計支払額・直近プラン）。
 */
export function summarizeBillingHistory(charges: ChargeRecord[]): BillingHistorySummary {
  const history = buildReceiptHistory(charges);
  return {
    hasHistory: history.length > 0,
    chargeCount: history.length,
    totalPaidAmount: history.reduce((sum, entry) => sum + entry.amount, 0),
    latestPlanId: history.length > 0 ? history[0].planId : null,
  };
}

export interface PlanChangeEvent {
  /** 変更前のプランID（直前の請求時点） */
  fromPlanId: string;
  /** 変更後のプランID（直近の請求時点） */
  toPlanId: string;
  /** 変更後プランでの最初の請求日 */
  effectiveDate: string;
}

/**
 * 領収書履歴（新しい順）の中から、直近のプラン変更（アップグレード/ダウングレード）を検出する。
 * 直近2件の請求のplanIdが異なる場合にのみ変更ありと判定する。
 * 請求が1件以下、またはplanIdに変化がない場合はnullを返す（アップグレード/ダウングレードなし）。
 */
export function detectMostRecentPlanChange(history: ReceiptHistoryEntry[]): PlanChangeEvent | null {
  if (history.length < 2) return null;
  const [latest, previous] = history;
  if (latest.planId === previous.planId) return null;
  return {
    fromPlanId: previous.planId,
    toPlanId: latest.planId,
    effectiveDate: latest.date,
  };
}

const receiptYenFormatter = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/**
 * 領収書の印刷／PDF保存レイアウトのヘッダーに表示するフィールド一覧を組み立てる
 * （src/lib/invoice/invoicePrintLayout.ts の buildInvoicePrintHeaderFields と同じ方針）。
 */
export function buildReceiptPrintFields(entry: ReceiptHistoryEntry, tenantName?: string | null): PrintableField[] {
  return selectPrintVisibleFields([
    { key: "receiptNumber", label: "領収書番号", value: entry.receiptNumber || "未採番" },
    { key: "date", label: "発行日", value: entry.dateLabel },
    { key: "planName", label: "ご利用プラン", value: entry.planName },
    {
      key: "amount",
      label: "お支払金額",
      value: entry.isZeroAmount ? `${receiptYenFormatter.format(0)}（無料トライアル期間）` : receiptYenFormatter.format(entry.amount),
    },
    { key: "tenantName", label: "宛名", value: tenantName?.trim() || "（未入力）" },
  ]);
}

/** 領収書の印刷書面のフッターに常時表示する注記文。文言はここを唯一の出典とする。 */
export const RECEIPT_PRINT_NOTICE =
  "本書面は「税務申告AI（ジャービス）」の月額サービス利用料に関する領収書です。" +
  "当社が税務代理・税務書類の作成・個別具体的な税務相談を行うものではありません。" +
  "経費計上等の税務上の取り扱いについては、ご自身または税理士等の専門家にご確認ください。";
