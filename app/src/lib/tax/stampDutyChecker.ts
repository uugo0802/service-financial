// ------------------------------------------------------------------
// 印紙税チェッカー（領収書・請負契約書）
//
// フリーランス・マイクロ法人が日常的に発行する代表的な課税文書のうち、
//   - 第17号の1文書「売上代金に係る金銭又は有価証券の受取書」（いわゆる領収書）
//   - 第2号文書「請負に関する契約書」（業務委託契約書等のうち、仕事の完成を約する請負契約のもの）
// の2種類について、記載金額と「紙で作成・交付するか／電子的に作成・交付するか」から、
// 必要な収入印紙の金額（印紙税額）を機械的に判定する参考ツール。
//
// 【重要】電子交付は印紙税の対象外という一般的な取扱いについて
// 印紙税は「課税文書の作成」に対して課される税金であり（印紙税法2条）、国税庁の見解
// （国税庁 質疑応答事例「請負契約に係る注文書に対して電磁的記録を交付した場合の印紙税」等）
// では、契約書や領収書をPDF等の電磁的記録として作成し、メール添付やクラウドサービス経由の
// ダウンロード等の電子的方法のみで相手方に交付した場合、紙の「文書」を作成したことには
// ならないため、印紙税は課税されないという取扱いが実務上定着している。本モジュールでは、
// この一般的な取扱いに基づき、format="electronic"（電子的に作成・交付）の場合は金額に
// かかわらず印紙税額を0円として扱う。ただし、電子的に作成した後に自分で紙に印刷して相手方に
// 交付した場合は「紙の文書の作成」に該当し、通常どおり課税される点に注意（本モジュールの
// isTaxableDocument判定はformat="paper"かどうかのみで行っており、印刷の有無までは
// 判定していない）。
//
// 対応していない・簡略化している点（コメントとして明示。詳細はSTAMP_DUTY_CHECKER_DISCLAIMER参照）:
// - 領収書は「第17号の1文書（売上代金に係るもの）」のみを対象とする。借入金の返済や
//   保証金の返還等、売上代金以外の金銭を受け取った際の受取書（第17号の2文書）は、金額に
//   かかわらず（5万円未満の免税点を除き）一律200円という別の取扱いがあるが、本モジュールの
//   対象外。
// - 契約書は「第2号文書（請負に関する契約書）」の一般税率のみを対象とする。建設工事の
//   請負に関する契約書については、租税特別措置法91条に基づく軽減税率（記載金額が
//   一定額を超えるものについて、令和9年3月31日まで適用）が別途あるが、本モジュールでは
//   考慮していない。また、土地の売買契約書・金銭消費貸借契約書等の第1号文書、継続的
//   取引の基本契約書である第7号文書など、他の号の文書は対象外。
// - 消費税額を区分記載している受取書・契約書は、税抜金額で５万円（受取書）・１万円
//   （契約書）等の判定を行えるという取扱いがあるが、本モジュールは入力された amount を
//   そのまま判定に用いる。税抜金額で判定したい場合は、税抜金額を入力すること。
// - 契約書の内容が「請負」（仕事の完成を約するもの）に該当するかどうかの判定自体は
//   本モジュールの対象外。準委任契約など、請負に該当しない業務委託契約書は、そもそも
//   第2号文書に該当しない（別の号の文書に該当するか、不課税文書となる）場合がある。
//
// 出典: 国税庁タックスアンサー No.7140「印紙税額の一覧表（その1）第1号文書から第4号文書まで」
//   https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7140.htm
//   （第2号文書・第17号文書の税額表、記載金額のないものの取扱い含む）
// 税制改正により将来変更される可能性があるため、実際の申告・課税文書の作成時には必ず
// 国税庁の最新の発表内容と照合すること。
// ------------------------------------------------------------------

/** 文書を紙で作成・交付するか、電子的に（PDFメール添付・クラウド経由等）作成・交付するか */
export type StampDutyDocumentFormat = "paper" | "electronic";

/** 記載金額の階級と、それに対応する印紙税額（円）の1段階分 */
export interface StampDutyBracket {
  /** この金額（円）以下であればこの段階が適用される。最上位はInfinity */
  upToAmount: number;
  /** この段階に該当する場合の印紙税額（円） */
  stampDutyAmount: number;
}

/** 受取金額の記載のない文書（領収書・契約書とも）に一律適用される印紙税額（円） */
export const STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT = 200;

/** 受取書（第17号の1文書）の免税点。この金額未満は非課税（円） */
export const RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD = 50_000;

/**
 * 受取書（第17号の1文書・売上代金に係る金銭又は有価証券の受取書）の記載金額階級表。
 * 出典: 国税庁タックスアンサー No.7140。
 */
export const RECEIPT_STAMP_DUTY_BRACKETS: StampDutyBracket[] = [
  { upToAmount: 1_000_000, stampDutyAmount: 200 },
  { upToAmount: 2_000_000, stampDutyAmount: 400 },
  { upToAmount: 3_000_000, stampDutyAmount: 600 },
  { upToAmount: 5_000_000, stampDutyAmount: 1_000 },
  { upToAmount: 10_000_000, stampDutyAmount: 2_000 },
  { upToAmount: 20_000_000, stampDutyAmount: 4_000 },
  { upToAmount: 30_000_000, stampDutyAmount: 6_000 },
  { upToAmount: 50_000_000, stampDutyAmount: 10_000 },
  { upToAmount: 100_000_000, stampDutyAmount: 20_000 },
  { upToAmount: 200_000_000, stampDutyAmount: 40_000 },
  { upToAmount: 300_000_000, stampDutyAmount: 60_000 },
  { upToAmount: 500_000_000, stampDutyAmount: 100_000 },
  { upToAmount: 1_000_000_000, stampDutyAmount: 150_000 },
  { upToAmount: Infinity, stampDutyAmount: 200_000 },
];

/** 請負契約書（第2号文書）の免税点。この金額未満は非課税（円） */
export const CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD = 10_000;

/**
 * 請負に関する契約書（第2号文書）の記載金額階級表（建設工事の軽減税率は含まない一般税率）。
 * 出典: 国税庁タックスアンサー No.7140。
 */
export const CONTRACT_STAMP_DUTY_BRACKETS: StampDutyBracket[] = [
  { upToAmount: 1_000_000, stampDutyAmount: 200 },
  { upToAmount: 2_000_000, stampDutyAmount: 400 },
  { upToAmount: 3_000_000, stampDutyAmount: 1_000 },
  { upToAmount: 5_000_000, stampDutyAmount: 2_000 },
  { upToAmount: 10_000_000, stampDutyAmount: 10_000 },
  { upToAmount: 50_000_000, stampDutyAmount: 20_000 },
  { upToAmount: 100_000_000, stampDutyAmount: 60_000 },
  { upToAmount: 500_000_000, stampDutyAmount: 100_000 },
  { upToAmount: 1_000_000_000, stampDutyAmount: 200_000 },
  { upToAmount: 5_000_000_000, stampDutyAmount: 400_000 },
  { upToAmount: Infinity, stampDutyAmount: 600_000 },
];

export const STAMP_DUTY_CHECKER_DISCLAIMER =
  "この判定結果は、第17号の1文書（売上代金に係る受取書）・第2号文書（請負に関する契約書）の一般税率に関する、国税庁公表の税額表に基づく一般的なルールの機械的な当てはめであり、個別具体的な税務相談・助言（税理士法上の税務相談）には該当しません。売上代金以外の金銭を受け取った際の受取書（第17号の2文書）、建設工事請負契約書の軽減税率、土地の売買契約書・金銭消費貸借契約書等の他の号の文書、契約の内容が請負に該当するかどうかの判定は、本ツールの対象外です。電子的に作成・交付した文書は印紙税の対象外という取扱いも、実際の作成・交付方法によって結論が変わり得ります。実際に必要な収入印紙の金額や課税文書への該当性は、必ず国税庁・所轄税務署または税理士等の専門家にご確認ください。";

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

/** 金額に対応する階級（印紙税額）を階級表から求める。amountはInfinity以下の階級のいずれかに必ず該当する */
function findBracketAmount(amount: number, brackets: StampDutyBracket[]): number {
  const bracket = brackets.find((b) => amount <= b.upToAmount);
  return (bracket ?? brackets[brackets.length - 1]).stampDutyAmount;
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

export interface ReceiptStampDutyInput {
  /**
   * 受取金額（円）。売上代金として金銭又は有価証券を受け取った際の受取書（領収書）を前提とする
   * （第17号の1文書）。消費税額を区分記載しており税抜金額で判定したい場合は、税抜金額を入力すること。
   */
  amount: number;
  /** 紙で作成・交付するか、電子的に作成・交付するか */
  format: StampDutyDocumentFormat;
  /**
   * 受取金額の記載があるかどうか。省略時（true扱い）は記載ありとして通常の階級表を適用する。
   * false の場合は「記載金額のない受取書」として、金額にかかわらず一律200円（紙の場合）を適用する。
   */
  amountStated?: boolean;
}

export interface ContractStampDutyInput {
  /**
   * 契約金額（円）。請負に関する契約書（第2号文書、業務委託契約書のうち仕事の完成を
   * 約する請負契約のもの）を前提とする。
   */
  amount: number;
  /** 紙で作成・交付するか、電子的に作成・交付するか */
  format: StampDutyDocumentFormat;
  /**
   * 契約金額の記載があるかどうか。省略時（true扱い）は記載ありとして通常の階級表を適用する。
   * false の場合は「記載金額のない契約書」として、金額にかかわらず一律200円（紙の場合）を適用する。
   */
  amountStated?: boolean;
}

export interface StampDutyCheckResult {
  /** 紙の課税文書として印紙税の課税対象になるかどうか（電子交付・免税点未満の場合はfalse） */
  isTaxableDocument: boolean;
  /** 必要な収入印紙の金額（円）。電子交付の場合・免税点未満の場合は0 */
  stampDutyAmount: number;
  /** 判定結果の理由（画面にそのまま表示できる平易な文言） */
  reason: string;
  disclaimer: string;
}

export interface ReceiptStampDutyResult extends StampDutyCheckResult {
  input: ReceiptStampDutyInput;
}

export interface ContractStampDutyResult extends StampDutyCheckResult {
  input: ContractStampDutyInput;
}

/**
 * 受取書（領収書、第17号の1文書・売上代金に係る金銭又は有価証券の受取書）について、
 * 必要な収入印紙の金額を判定する。
 *
 * - 電子的に作成・交付する場合（format="electronic"）は、紙の文書を作成したことにならないため、
 *   金額にかかわらず印紙税額は0円。
 * - 紙で作成・交付する場合（format="paper"）は、受取金額が5万円未満であれば非課税（0円）、
 *   5万円以上であれば階級表（RECEIPT_STAMP_DUTY_BRACKETS）に従って印紙税額を判定する。
 * - amountStated=false（受取金額の記載のない受取書）の場合は、紙であれば金額にかかわらず一律200円。
 */
export function checkReceiptStampDuty(input: ReceiptStampDutyInput): ReceiptStampDutyResult {
  assertFiniteNonNegative(input.amount, "受取金額");
  const amountStated = input.amountStated ?? true;

  if (input.format === "electronic") {
    return {
      input,
      isTaxableDocument: false,
      stampDutyAmount: 0,
      reason:
        "PDF等の電磁的記録として作成し、メール添付やクラウドサービス経由のダウンロード等、電子的方法のみで交付する受取書は、印紙税法上の「文書の作成」に該当しないため、印紙税は課税されません（金額にかかわらず0円）。",
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  if (!amountStated) {
    return {
      input,
      isTaxableDocument: true,
      stampDutyAmount: STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT,
      reason: `受取金額の記載のない受取書（紙）に該当するため、金額にかかわらず印紙税額は一律${formatYen(
        STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT
      )}です。`,
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  if (input.amount < RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD) {
    return {
      input,
      isTaxableDocument: false,
      stampDutyAmount: 0,
      reason: `受取金額${formatYen(input.amount)}は免税点（${formatYen(
        RECEIPT_STAMP_DUTY_EXEMPTION_THRESHOLD
      )}未満）に該当するため、印紙税は課税されません。`,
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  const stampDutyAmount = findBracketAmount(input.amount, RECEIPT_STAMP_DUTY_BRACKETS);
  return {
    input,
    isTaxableDocument: true,
    stampDutyAmount,
    reason: `受取金額${formatYen(input.amount)}（紙）の受取書に該当するため、印紙税額は${formatYen(
      stampDutyAmount
    )}です。`,
    disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
  };
}

/**
 * 請負に関する契約書（第2号文書）について、必要な収入印紙の金額を判定する。
 *
 * - 電子的に作成・交付する場合（format="electronic"）は、紙の文書を作成したことにならないため、
 *   金額にかかわらず印紙税額は0円。
 * - 紙で作成・交付する場合（format="paper"）は、契約金額が1万円未満であれば非課税（0円）、
 *   1万円以上であれば階級表（CONTRACT_STAMP_DUTY_BRACKETS、一般税率）に従って印紙税額を判定する。
 *   建設工事請負契約書の軽減税率は考慮していない。
 * - amountStated=false（契約金額の記載のない契約書）の場合は、紙であれば金額にかかわらず一律200円。
 */
export function checkContractStampDuty(input: ContractStampDutyInput): ContractStampDutyResult {
  assertFiniteNonNegative(input.amount, "契約金額");
  const amountStated = input.amountStated ?? true;

  if (input.format === "electronic") {
    return {
      input,
      isTaxableDocument: false,
      stampDutyAmount: 0,
      reason:
        "PDF等の電磁的記録として作成し、メール添付やクラウドサービス経由のダウンロード等、電子的方法のみで締結・交付する契約書（電子契約）は、印紙税法上の「文書の作成」に該当しないため、印紙税は課税されません（金額にかかわらず0円）。",
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  if (!amountStated) {
    return {
      input,
      isTaxableDocument: true,
      stampDutyAmount: STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT,
      reason: `契約金額の記載のない請負契約書（紙）に該当するため、金額にかかわらず印紙税額は一律${formatYen(
        STAMP_DUTY_AMOUNT_FOR_UNSTATED_AMOUNT
      )}です。`,
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  if (input.amount < CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD) {
    return {
      input,
      isTaxableDocument: false,
      stampDutyAmount: 0,
      reason: `契約金額${formatYen(input.amount)}は免税点（${formatYen(
        CONTRACT_STAMP_DUTY_EXEMPTION_THRESHOLD
      )}未満）に該当するため、印紙税は課税されません。`,
      disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
    };
  }

  const stampDutyAmount = findBracketAmount(input.amount, CONTRACT_STAMP_DUTY_BRACKETS);
  return {
    input,
    isTaxableDocument: true,
    stampDutyAmount,
    reason: `契約金額${formatYen(
      input.amount
    )}（紙）の請負に関する契約書（第2号文書、一般税率）に該当するため、印紙税額は${formatYen(
      stampDutyAmount
    )}です。`,
    disclaimer: STAMP_DUTY_CHECKER_DISCLAIMER,
  };
}
