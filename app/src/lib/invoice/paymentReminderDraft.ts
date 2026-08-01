import { OverdueInvoice } from "./receivables";
import { formatInvoiceDateLabel } from "./invoicePrintLayout";

// ------------------------------------------------------------------
// 支払期日超過（未収）の請求書1件から、取引先に送る「支払い状況確認・督促」メールの
// 下書き（件名＋本文、プレーンテキスト）を組み立てる純粋関数群。
//
// 入力の型は src/lib/invoice/receivables.ts が既に定義している OverdueInvoice を
// そのまま再利用する（このファイルでは請求書関連のフィールドを再定義しない）。
// receivables.ts の computeReceivablesSummary() は daysOverdue が1以上の請求書のみを
// overdueInvoices に含める設計だが、TypeScript の型自体はその不変条件を強制しないため
// （例えば呼び出し側がフォーム入力から直接 OverdueInvoice 相当のオブジェクトを組み立てる場合）、
// このモジュール自身も daysOverdue < 1 のケースをランタイムでガードし、
// 「督促の対象ではない」という明確な結果を返す（例外は投げない）。
//
// 実際のメール送信は行わない（本サービスに配信基盤は存在しない）。あくまで下書きテキストを
// 生成するだけであり、督促状の作成・債権回収の助言・税理士法に定める税務代理／税務相談を
// 行うものではない（docs/business-plan.md 2.「法的ポジショニング」/ receivables.ts の方針に準拠）。
// ------------------------------------------------------------------

/** 督促メールの文面トーン。gentle=初回の穏やかな確認、firm=再送・督促（強め）。 */
export type ReminderTone = "gentle" | "firm";

export const REMINDER_TONE_OPTIONS: { value: ReminderTone; label: string; description: string }[] = [
  {
    value: "gentle",
    label: "やわらかい（初回のご案内）",
    description: "行き違いの可能性を前提にした、穏やかな支払い状況確認の文面です。",
  },
  {
    value: "firm",
    label: "強め（再送・督促）",
    description: "支払期日超過を明示し、期限を区切って対応を促す文面です（督促状ではありません）。",
  },
];

/** generatePaymentReminderDraft() が下書きを生成できなかった理由。 */
export type PaymentReminderRejectionReason = "not-overdue" | "invalid-invoice";

export interface PaymentReminderDraft {
  tone: ReminderTone;
  toneLabel: string;
  invoiceNumber: string;
  clientName: string;
  /** メール件名 */
  subject: string;
  /** メール本文（プレーンテキスト） */
  body: string;
}

export type PaymentReminderResult =
  | { ok: true; draft: PaymentReminderDraft }
  | { ok: false; reason: PaymentReminderRejectionReason; message: string };

export interface PaymentReminderOptions {
  /**
   * 署名欄に使う送信者名・屋号（省略可）。指定しない場合、本文に署名欄は付与しない
   * （利用者が自身のメールクライアントの署名を使うことを想定）。
   */
  senderName?: string;
}

const TONE_LABEL: Record<ReminderTone, string> = {
  gentle: "やわらかい（初回）",
  firm: "強め（再送・督促）",
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/**
 * この機能が「督促状の作成」「債権回収の助言」「税務代理・税務相談」ではないことを
 * 常に利用者に示すための注記文。UI側での表示に用いる想定（本文自体には含めない。
 * 取引先に送る文面に自社の免責文言を混ぜるのは不自然なため）。
 */
export const PAYMENT_REMINDER_DISCLAIMER =
  "生成される文面はあくまで下書きです。送信前に内容・宛先を必ずご自身でご確認ください。" +
  "本機能は督促状の作成や債権回収の助言、税理士法に定める税務代理・税務相談を行うものではありません。";

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * 支払期日（なければ発行日）の表示用ラベルを返す。日付フォーマットは既存の
 * invoicePrintLayout.ts の formatInvoiceDateLabel() をそのまま再利用し、
 * 「YYYY年M月D日」表記をアプリ全体で統一する。
 */
function dueDateLabel(invoice: OverdueInvoice): string {
  if (!isBlank(invoice.dueDate)) {
    return formatInvoiceDateLabel(invoice.dueDate);
  }
  return `${formatInvoiceDateLabel(invoice.issueDate)}（請求書発行日を基準とした支払期日）`;
}

function buildSubject(tone: ReminderTone, invoice: OverdueInvoice): string {
  if (tone === "gentle") {
    return `【ご確認のお願い】ご請求書（No.${invoice.invoiceNumber}）のお支払いについて`;
  }
  return `【再送・至急】ご請求書（No.${invoice.invoiceNumber}）お支払いのお願い`;
}

function buildBody(tone: ReminderTone, invoice: OverdueInvoice, options: PaymentReminderOptions | undefined): string {
  const amountText = yen.format(invoice.outstandingAmount);
  const dueText = dueDateLabel(invoice);
  const lines: string[] =
    tone === "gentle"
      ? [
          `${invoice.clientName} 様`,
          "",
          "いつも大変お世話になっております。",
          "",
          `下記ご請求書につきまして、お支払期日を${invoice.daysOverdue}日超過しておりますが、`,
          "本日時点でご入金の確認ができておらず、念のためご連絡いたしました。",
          "",
          "【ご請求内容】",
          `・請求書番号：${invoice.invoiceNumber}`,
          `・お支払期日：${dueText}`,
          `・ご請求金額：${amountText}`,
          "",
          "行き違いで既にお手続きいただいておりましたら、大変恐縮ですが、",
          "その旨だけご一報いただけますと幸いです。",
          "",
          "お手数をおかけいたしますが、お支払い状況のご確認をお願いいたします。",
          "ご不明な点がございましたら、お気軽にお申し付けください。",
          "",
          "今後ともどうぞよろしくお願いいたします。",
        ]
      : [
          `${invoice.clientName} 様`,
          "",
          "いつも大変お世話になっております。",
          "",
          `以前ご案内いたしましたご請求書につきまして、お支払期日を${invoice.daysOverdue}日超過しており、`,
          "本日時点でもご入金の確認ができていないため、あらためてご連絡を差し上げました。",
          "",
          "【ご請求内容】",
          `・請求書番号：${invoice.invoiceNumber}`,
          `・お支払期日：${dueText}`,
          `・ご請求金額：${amountText}`,
          "",
          "大変恐縮ではございますが、本メール受領後1週間以内を目安にお支払い状況をご確認いただき、",
          "お手続きいただけますでしょうか。",
          "",
          "資金繰り等のご事情がある場合は分割のご相談等にも応じますので、お早めにご一報いただけますと幸いです。",
          "",
          "既にお手続きいただいている場合は、行き違いでのご連絡となり恐縮です。",
          "本メールへの返信にてお知らせいただけますと幸いです。",
          "",
          "引き続きどうぞよろしくお願いいたします。",
        ];

  const signature = options?.senderName && !isBlank(options.senderName) ? `\n\n${options.senderName}` : "";
  return lines.join("\n") + signature;
}

/**
 * 期日超過の請求書1件から、支払い状況確認・督促メールの下書き（件名＋本文）を生成する。
 *
 * - invoice.daysOverdue が1未満（まだ支払期日を超過していない、または不正な値）の場合は
 *   下書きを生成せず、reason: "not-overdue" の結果を返す。
 * - 請求書番号・請求先名が空、または未収金額が0円以下の場合は reason: "invalid-invoice" を返す。
 * - それ以外の例外は投げない（純粋関数）。
 */
export function generatePaymentReminderDraft(
  invoice: OverdueInvoice,
  tone: ReminderTone,
  options?: PaymentReminderOptions
): PaymentReminderResult {
  if (isBlank(invoice.invoiceNumber) || isBlank(invoice.clientName)) {
    return {
      ok: false,
      reason: "invalid-invoice",
      message: "請求書番号または請求先名が未入力のため、督促メールの下書きを作成できません。",
    };
  }

  if (!Number.isFinite(invoice.outstandingAmount) || invoice.outstandingAmount <= 0) {
    return {
      ok: false,
      reason: "invalid-invoice",
      message: "未収金額が0円以下のため、督促メールの対象になりません。",
    };
  }

  if (!Number.isFinite(invoice.daysOverdue) || invoice.daysOverdue < 1) {
    return {
      ok: false,
      reason: "not-overdue",
      message: "この請求書はまだ支払期日を超過していないため、督促メールの対象ではありません。",
    };
  }

  return {
    ok: true,
    draft: {
      tone,
      toneLabel: TONE_LABEL[tone],
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      subject: buildSubject(tone, invoice),
      body: buildBody(tone, invoice, options),
    },
  };
}
