import { CategorizedTransaction } from "../categorize/engine";
import { outstandingAmountOf, ReceivableInvoiceInput } from "../invoice/receivables";

// ------------------------------------------------------------------
// 入金消込（Invoice Payment Matching）。
//
// bankReconciliation.ts は「取り込んだ取引の合計」対「銀行明細上の実際の残高」という
// “残高”レベルの突合であり、個々の取引が具体的にどの請求書への入金なのかまでは扱わない。
// 本モジュールはその一段細かいレイヤーとして、入金（プラス金額の銀行取引）1件ずつを、
// 発行済みだが未収の請求書（receivables.ts の ReceivableInvoiceInput）と突き合わせ、
// 「この入金 = どの請求書への支払いか」の候補を提示する純粋関数群。
//
// あくまで記帳・入金消込を補助するマッチング候補の提示であり、最終的な消込の確定は
// 必ず利用者自身が行う（税理士法に定める税務代理・税務相談は一切行わない。
// docs/business-plan.md 2.「法的ポジショニング」の方針に準拠）。
//
// マッチングの信頼度（confidence）の考え方:
//   - "high"（高）  : 入金額が、未収の請求書のうちちょうど1件の未収金額とだけ一致する
//                      （金額だけで一意に特定できる、最も強いシグナル）。
//   - "medium"（中） : 入金額が複数の請求書の未収金額と同額で並んでいて金額だけでは一意に
//                      特定できないが、振込摘要（取引摘要）に請求先名が含まれる（ファジー
//                      部分一致）ことで1件に絞り込めた場合。金額一致に加えて名寄せという
//                      弱いシグナルを足して初めて特定できているため、金額単独の一致より
//                      信頼度を1段階下げて扱う。
//   - "partial"（部分入金）: 入金額が請求書の未収金額を下回っており、かつ振込摘要から
//                      請求先が推定できる場合。金額が一致しないため誤って「一致」とは
//                      扱わず、分割入金・一部入金の可能性として明示的に区別する。
//   - 複数の請求書の合計額が1回の入金額と一致するケース（まとめ入金）は、
//     どの組み合わせが実際に支払われたのかを一般的に決定する問題（部分和問題）を
//     解くことはせず、"要確認（まとめ入金の可能性）" として明示的にフラグを立てるにとどめる。
// ------------------------------------------------------------------

export type InvoicePaymentMatchConfidence = "high" | "medium" | "partial";

/** マッチング対象とする、未収金額が0円より大きい請求書1件分の情報。 */
export interface OutstandingInvoiceForMatching {
  invoiceNumber: string;
  clientName: string;
  /** 当該請求書の未収金額（円）。一部入金済みの場合は残額。 */
  outstandingAmount: number;
}

/** 入金消込の候補となった銀行取引側の情報（プレビュー表示用に元の取引もそのまま保持する）。 */
export interface DepositForMatching {
  transactionId: string;
  date: string;
  description: string;
  /** 入金額（円、常にプラス）。 */
  amount: number;
}

export interface InvoicePaymentMatchCandidate {
  transaction: DepositForMatching;
  invoiceNumber: string;
  clientName: string;
  invoiceOutstandingAmount: number;
  confidence: InvoicePaymentMatchConfidence;
  /** マッチ理由の短い説明（UI表示用）。 */
  reason: string;
  /** 部分入金の場合、消込後もなお残る未収金額（円）。それ以外は undefined。 */
  remainingBalanceAfterMatch?: number;
}

export interface CombinedPaymentReviewItem {
  transaction: DepositForMatching;
  /** 合計額が入金額と一致した請求書番号の一覧（＝支払われた可能性のある組み合わせ）。 */
  candidateInvoiceNumbers: string[];
  clientName: string;
  note: string;
}

export interface UnmatchedDeposit {
  transaction: DepositForMatching;
  reason: string;
}

export interface UnmatchedInvoice {
  invoiceNumber: string;
  clientName: string;
  outstandingAmount: number;
  reason: string;
}

export interface InvoicePaymentMatchResult {
  /** 金額のみで一意に特定できた高信頼度マッチ */
  highConfidenceMatches: InvoicePaymentMatchCandidate[];
  /** 金額の一致に加え、摘要のファジー名寄せで絞り込んだ中信頼度マッチ */
  mediumConfidenceMatches: InvoicePaymentMatchCandidate[];
  /** 入金額が請求書未収金額を下回る、部分入金（一部入金）の候補 */
  partialPaymentCandidates: InvoicePaymentMatchCandidate[];
  /** 複数請求書の合計額と一致する「まとめ入金」の可能性があり、要確認としてフラグを立てたもの */
  combinedPaymentReviewItems: CombinedPaymentReviewItem[];
  /** どの請求書ともマッチしなかった入金取引 */
  unmatchedDeposits: UnmatchedDeposit[];
  /** どの入金ともマッチしなかった未収請求書 */
  unmatchedInvoices: UnmatchedInvoice[];
}

/**
 * 会社名・屋号によくある表記ゆれ（法人格の有無・全角/半角スペース等）を吸収するための正規化。
 * 完全な名寄せエンジンではなく、あくまで「摘要に請求先名が含まれていそうか」を判定する
 * ためのシンプルな前処理にとどめる。
 */
function normalizeForFuzzyNameMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\(有\)|（有）|様|御中/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

/**
 * 銀行取引の摘要（description）に、請求先名（clientName）が部分一致で含まれているかを判定する。
 * 双方向の部分一致（摘要⊂請求先名 / 請求先名⊂摘要）を許容する。
 * 請求先名が短すぎる（1文字以下）場合は誤検知しやすいため一致とみなさない。
 */
export function fuzzyPayerNameMatches(description: string, clientName: string): boolean {
  const normalizedDescription = normalizeForFuzzyNameMatch(description ?? "");
  const normalizedClientName = normalizeForFuzzyNameMatch(clientName ?? "");
  if (normalizedClientName.length <= 1 || normalizedDescription.length === 0) return false;
  return (
    normalizedDescription.includes(normalizedClientName) || normalizedClientName.includes(normalizedDescription)
  );
}

/** ReceivableInvoiceInput（receivables.ts）から、未収金額が0円より大きい請求書だけを抽出する。 */
export function toOutstandingInvoices(invoices: ReceivableInvoiceInput[]): OutstandingInvoiceForMatching[] {
  return (invoices ?? [])
    .map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      outstandingAmount: outstandingAmountOf(invoice),
    }))
    .filter((invoice) => invoice.outstandingAmount > 0);
}

/** CategorizedTransaction（categorize/engine.ts）から、入金（プラス金額）の取引だけを抽出する。 */
export function toDeposits(transactions: Pick<CategorizedTransaction, "id" | "date" | "description" | "amount">[]): DepositForMatching[] {
  return (transactions ?? [])
    .filter((t) => t.amount > 0)
    .map((t) => ({ transactionId: t.id, date: t.date, description: t.description, amount: t.amount }));
}

/**
 * 同一請求先の未収請求書2件の組み合わせ（ペア）のうち、合計額が入金額と一致するものを探す。
 * 一般の部分和問題（3件以上の任意の組み合わせ）は解かず、実務上もっとも多い
 * 「同じ取引先の請求書2件をまとめて振り込んだ」ケースのみを機械的に検出する簡易ヒューリスティック。
 * 見つかった場合でも「実際にその2件への支払いである」と断定はせず、要確認としてのみ扱う。
 */
function findPairSummingTo(invoices: OutstandingInvoiceForMatching[], amount: number): OutstandingInvoiceForMatching[] | null {
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      if (invoices[i].outstandingAmount + invoices[j].outstandingAmount === amount) {
        return [invoices[i], invoices[j]];
      }
    }
  }
  return null;
}

export interface MatchInvoicePaymentsInput {
  invoices: ReceivableInvoiceInput[];
  transactions: Pick<CategorizedTransaction, "id" | "date" | "description" | "amount">[];
}

/**
 * 未収請求書一覧と銀行取引一覧から、入金消込の候補を計算する。
 *
 * 判定の優先順位（入金1件ごと）:
 *   1. 未収金額がちょうど一致する請求書が1件だけ → high
 *   2. 未収金額が一致する請求書が複数あり、摘要のファジー名寄せで1件に絞り込めた → medium
 *   3. 未収金額を下回る請求書のうち、摘要のファジー名寄せで請求先が推定できるもの → partial
 *      （複数該当する場合はすべて候補として提示し、確定は利用者に委ねる）
 *   4. 同一請求先の請求書2件の合計額が入金額と一致する → combinedPaymentReviewItems（要確認）
 *   5. 上記いずれにも該当しない → unmatchedDeposits
 *
 * どの候補にも使われなかった未収請求書は unmatchedInvoices として別途返す。
 * 例外は投げない。
 */
export function matchInvoicePayments(input: MatchInvoicePaymentsInput): InvoicePaymentMatchResult {
  const outstandingInvoices = toOutstandingInvoices(input.invoices);
  const deposits = toDeposits(input.transactions);

  const highConfidenceMatches: InvoicePaymentMatchCandidate[] = [];
  const mediumConfidenceMatches: InvoicePaymentMatchCandidate[] = [];
  const partialPaymentCandidates: InvoicePaymentMatchCandidate[] = [];
  const combinedPaymentReviewItems: CombinedPaymentReviewItem[] = [];
  const unmatchedDeposits: UnmatchedDeposit[] = [];
  const matchedInvoiceNumbers = new Set<string>();

  // 請求先ごとにグルーピングしておく（まとめ入金の判定に使う）。
  const invoicesByClient = new Map<string, OutstandingInvoiceForMatching[]>();
  for (const invoice of outstandingInvoices) {
    const list = invoicesByClient.get(invoice.clientName) ?? [];
    list.push(invoice);
    invoicesByClient.set(invoice.clientName, list);
  }

  for (const deposit of deposits) {
    const exactAmountMatches = outstandingInvoices.filter((inv) => inv.outstandingAmount === deposit.amount);

    if (exactAmountMatches.length === 1) {
      const invoice = exactAmountMatches[0];
      highConfidenceMatches.push({
        transaction: deposit,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        invoiceOutstandingAmount: invoice.outstandingAmount,
        confidence: "high",
        reason: "入金額が、未収請求書1件の未収金額とちょうど一致しました（金額のみで一意に特定）。",
      });
      matchedInvoiceNumbers.add(invoice.invoiceNumber);
      continue;
    }

    if (exactAmountMatches.length > 1) {
      const nameNarrowed = exactAmountMatches.filter((inv) => fuzzyPayerNameMatches(deposit.description, inv.clientName));
      if (nameNarrowed.length === 1) {
        const invoice = nameNarrowed[0];
        mediumConfidenceMatches.push({
          transaction: deposit,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          invoiceOutstandingAmount: invoice.outstandingAmount,
          confidence: "medium",
          reason:
            "同額の未収請求書が複数あったため金額だけでは一意に特定できませんでしたが、" +
            "取引摘要に含まれる請求先名から1件に絞り込みました。",
        });
        matchedInvoiceNumbers.add(invoice.invoiceNumber);
        continue;
      }
      // 金額が同額の請求書が複数あり、摘要からも1件に絞り込めない場合は、
      // 誤って確定させず未消込として一覧に残す（要手動確認）。
      unmatchedDeposits.push({
        transaction: deposit,
        reason: `未収金額が同額の請求書が${exactAmountMatches.length}件あり、取引摘要だけでは1件に絞り込めませんでした。手動でご確認ください。`,
      });
      continue;
    }

    // 金額が完全一致する請求書が無い場合: 部分入金（一部入金）の可能性を確認する。
    const partialCandidates = outstandingInvoices.filter(
      (inv) => inv.outstandingAmount > deposit.amount && fuzzyPayerNameMatches(deposit.description, inv.clientName)
    );
    if (partialCandidates.length > 0) {
      for (const invoice of partialCandidates) {
        partialPaymentCandidates.push({
          transaction: deposit,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          invoiceOutstandingAmount: invoice.outstandingAmount,
          confidence: "partial",
          reason:
            "取引摘要から請求先は推定できましたが、入金額が請求書の未収金額を下回っています。" +
            "一部入金（分割入金）の可能性があります。",
          remainingBalanceAfterMatch: invoice.outstandingAmount - deposit.amount,
        });
        matchedInvoiceNumbers.add(invoice.invoiceNumber);
      }
      continue;
    }

    // まとめ入金（複数請求書の合計額が1回の入金と一致）の可能性を確認する。
    // 相手先が摘要から推定できる場合はその請求先の請求書内で、推定できない場合は
    // 請求先ごとのグループそれぞれについてペアの合計額を確認する。
    let combinedMatch: { pair: OutstandingInvoiceForMatching[]; clientName: string } | null = null;

    // まず摘要から請求先が推定できるグループだけを優先的に探す。複数の請求先がたまたま
    // 同額のペアを持っていても、摘要が名指ししている請求先を優先して誤帰属を防ぐ。
    for (const [clientName, clientInvoices] of invoicesByClient.entries()) {
      if (!fuzzyPayerNameMatches(deposit.description, clientName)) continue;
      const pair = findPairSummingTo(clientInvoices, deposit.amount);
      if (pair) {
        combinedMatch = { pair, clientName };
        break;
      }
    }

    // 摘要から請求先を推定できなかった場合（推定できた請求先にペアが無かった場合を含む）は、
    // 請求先ごとのグループそれぞれについて確認する（フォールバック）。
    if (!combinedMatch) {
      for (const [clientName, clientInvoices] of invoicesByClient.entries()) {
        const pair = findPairSummingTo(clientInvoices, deposit.amount);
        if (pair) {
          combinedMatch = { pair, clientName };
          break;
        }
      }
    }

    if (combinedMatch) {
      combinedPaymentReviewItems.push({
        transaction: deposit,
        candidateInvoiceNumbers: combinedMatch.pair.map((inv) => inv.invoiceNumber),
        clientName: combinedMatch.clientName,
        note:
          "この入金額は、同一請求先の未収請求書2件の合計額と一致します。複数の請求書をまとめて" +
          "支払われた可能性があります（自動では確定しません。対象の請求書をご確認のうえ、手動で消込してください）。",
      });
      combinedMatch.pair.forEach((inv) => matchedInvoiceNumbers.add(inv.invoiceNumber));
      continue;
    }

    unmatchedDeposits.push({
      transaction: deposit,
      reason: "未収金額が一致する請求書が見つかりませんでした。請求書が未登録か、他の入金と合算されている可能性があります。",
    });
  }

  const unmatchedInvoices: UnmatchedInvoice[] = outstandingInvoices
    .filter((inv) => !matchedInvoiceNumbers.has(inv.invoiceNumber))
    .map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      outstandingAmount: inv.outstandingAmount,
      reason: "この未収金額・請求先に一致する入金取引が見つかりませんでした。",
    }));

  return {
    highConfidenceMatches,
    mediumConfidenceMatches,
    partialPaymentCandidates,
    combinedPaymentReviewItems,
    unmatchedDeposits,
    unmatchedInvoices,
  };
}
