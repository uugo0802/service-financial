// ------------------------------------------------------------------
// 源泉徴収税額の控除照合（下書き・簡易版）。
//
// paymentReportForm.ts が扱うのは「自分が外部の専門家・フリーランスへ報酬等を
// 支払い、支払調書を発行する側」の下書きだが、このモジュールはその逆方向——
// 「自分がデザイン・原稿執筆・コンサルティング等の報酬を業務委託先（クライアント）
// から受け取り、クライアント側で源泉徴収された側」を対象とする。
//
// クライアントは報酬・料金等の支払時に所得税及び復興特別所得税を源泉徴収し、
// 本人（受取側）へその金額を支払調書等で通知する。受取側はその源泉徴収税額を、
// 自身の確定申告における所得税額からの税額控除として差し引くことができる
// （国税庁が源泉徴収する主体ではなく、あくまで前払いされた税額の精算）。
//
// このモジュールは、
//   1) 記帳・入力された「支払ごとの源泉徴収税額（recordedWithholdingTax）」を、
//      報酬・料金等（原稿料・講演料等／弁護士・税理士等の報酬／デザイン料／
//      その他の報酬・料金）に共通する標準税率（10.21%／100万円超部分20.42%）
//      から機械的に算出した「期待値」と突き合わせ、差異がある支払を検出する。
//   2) 確定申告の所得税額計算（estimate.ts）へ入力する「源泉徴収税額の合計額」
//      （＝法的に控除可能な、実際にクライアントが徴収・納付したrecorded側の合計）
//      を算出する。
// このファイルはestimate.tsを一切importせず、その計算結果を書き換えることも
// ないpure・framework-freeなロジックである（呼び出し側がtotalCreditをestimate.ts
// への入力として別途渡すことを想定した、読み取り専用の下流消費パターン）。
//
// 【重要な限定事項】
// ・対象は「報酬、料金、契約金及び賞金」（所得税法204条1項各号のうち、原稿料・
//   講演料・デザイン料・弁護士や税理士等の専門家報酬など）に共通する一般的な
//   税率のみ。ホステス等の報酬・馬主が受ける競馬の賞金など、計算方法が異なる
//   区分は対象外（paymentReportForm.tsと同様の限定）。
// ・1回の支払ごとに100万円以下の部分10.21%・超える部分20.42%という税率区分を
//   適用する（年間の支払合計額に対してではなく、支払1回ごとの金額で判定する
//   点に注意——これは他の多くの源泉徴収区分と異なる、このカテゴリ固有のルール）。
// ・実際に控除できる金額は、あくまでクライアントが実際に徴収した金額
//   （recordedWithholdingTax）であり、期待値（expectedWithholdingTax）は
//   差異の検出（クライアント側の計算誤り・支払調書の記載漏れ等に気づくため）
//   にのみ使用する。期待値で実際の控除額を上書きすることはしない。
// ・このモジュールはあくまで下書き・照合支援であり、税理士法に定める税務代理・
//   税務書類の作成・個別具体的な税務相談には該当しない。
// ------------------------------------------------------------------

/** 報酬・料金等の源泉徴収：100万円以下の部分に適用する税率（所得税10%＋復興特別所得税0.21%） */
export const WITHHOLDING_RATE_STANDARD = 0.1021;
/** 報酬・料金等の源泉徴収：1回の支払につき100万円を超える部分に適用する税率 */
export const WITHHOLDING_RATE_EXCESS = 0.2042;
/** 税率が切り替わる、支払1回あたりの金額のしきい値（年間合計ではない） */
export const WITHHOLDING_SINGLE_PAYMENT_THRESHOLD = 1_000_000;

/** 期待値と記録値の差異を「一致」とみなす許容範囲（円）。既定は差異0円（完全一致）を求める */
export const DEFAULT_RECONCILIATION_TOLERANCE_YEN = 0;

export interface WithholdingPaymentRecord {
  /** 支払元のクライアント（報酬等の支払を行った業務委託先）の名称 */
  clientName: string;
  /** この1回の支払金額（源泉徴収前の総額）。プラスの数値で指定する */
  grossAmount: number;
  /**
   * この支払についてクライアントが実際に源泉徴収した（と支払調書等で報告してきた）税額。
   * 確定申告で税額控除として実際に使えるのはこの金額。
   */
  recordedWithholdingTax: number;
  /** 支払日（"YYYY-MM-DD"等）。任意・表示用 */
  date?: string;
  /** 呼び出し側で任意に付与できる識別子。任意・表示用 */
  id?: string;
}

export type WithholdingReconciliationStatus = "matched" | "discrepancy";

export interface WithholdingReconciliationRecord {
  id?: string;
  clientName: string;
  date?: string;
  grossAmount: number;
  /** 標準税率（10.21%／20.42%）から機械的に算出した期待値。あくまで差異検出用の参考値 */
  expectedWithholdingTax: number;
  /** クライアントが実際に源泉徴収した、確定申告で控除に使う金額 */
  recordedWithholdingTax: number;
  /** recordedWithholdingTax - expectedWithholdingTax */
  differenceYen: number;
  status: WithholdingReconciliationStatus;
}

export interface WithholdingReconciliationResult {
  records: WithholdingReconciliationRecord[];
  /** 差異ありと判定された件数 */
  discrepancyCount: number;
  /**
   * 確定申告の税額控除として使う源泉徴収税額の合計。recordedWithholdingTaxの合計値であり、
   * expectedWithholdingTaxの合計ではない（法的に控除できるのは実際に徴収された金額のため）。
   * estimate.tsの所得税概算への入力として、呼び出し側がそのまま渡すことを想定している。
   */
  totalRecordedWithholdingTax: number;
  /** 標準税率で機械的に算出した期待値の合計。差異の全体感を把握するための参考値 */
  totalExpectedWithholdingTax: number;
}

/**
 * 報酬・料金等の源泉徴収税額を、支払1回あたりの金額から標準税率で算出する。
 * 100万円以下の部分は10.21%、100万円を超える部分は20.42%（1回の支払ごとの判定、
 * 年間合計額での判定ではない）。1円未満の端数は切り捨て（円未満切り捨てが原則）。
 */
export function calcExpectedWithholdingTax(grossAmount: number): number {
  if (grossAmount <= 0) return 0;

  if (grossAmount <= WITHHOLDING_SINGLE_PAYMENT_THRESHOLD) {
    return Math.floor(grossAmount * WITHHOLDING_RATE_STANDARD);
  }

  const baseAmount = WITHHOLDING_SINGLE_PAYMENT_THRESHOLD * WITHHOLDING_RATE_STANDARD; // 102,100円（端数なし）
  const excessAmount = grossAmount - WITHHOLDING_SINGLE_PAYMENT_THRESHOLD;
  return Math.floor(baseAmount + excessAmount * WITHHOLDING_RATE_EXCESS);
}

/**
 * 支払ごとの記録（クライアント名・支払金額・実際の源泉徴収税額）を、標準税率から
 * 算出した期待値と突き合わせ、差異のある支払にdiscrepancyのステータスを立てる。
 *
 * @param records 支払ごとの記録
 * @param options.toleranceYen 期待値と記録値の差異をmatched扱いとする許容範囲（円）。
 *   既定は0円（完全一致のみmatched）。クライアント側の端数処理の流儀の違い等で
 *   ごくわずかな差異を許容したい場合に指定する。
 */
export function reconcileWithholdingTaxCredits(
  records: WithholdingPaymentRecord[],
  options?: { toleranceYen?: number }
): WithholdingReconciliationResult {
  const toleranceYen = Math.max(0, options?.toleranceYen ?? DEFAULT_RECONCILIATION_TOLERANCE_YEN);

  const reconciled: WithholdingReconciliationRecord[] = records.map((r) => {
    const expectedWithholdingTax = calcExpectedWithholdingTax(r.grossAmount);
    const recordedWithholdingTax = r.recordedWithholdingTax;
    const differenceYen = recordedWithholdingTax - expectedWithholdingTax;
    const status: WithholdingReconciliationStatus =
      Math.abs(differenceYen) <= toleranceYen ? "matched" : "discrepancy";

    return {
      id: r.id,
      clientName: r.clientName.trim() || "（クライアント不明）",
      date: r.date,
      grossAmount: r.grossAmount,
      expectedWithholdingTax,
      recordedWithholdingTax,
      differenceYen,
      status,
    };
  });

  const totalRecordedWithholdingTax = reconciled.reduce((sum, r) => sum + r.recordedWithholdingTax, 0);
  const totalExpectedWithholdingTax = reconciled.reduce((sum, r) => sum + r.expectedWithholdingTax, 0);
  const discrepancyCount = reconciled.filter((r) => r.status === "discrepancy").length;

  return {
    records: reconciled,
    discrepancyCount,
    totalRecordedWithholdingTax,
    totalExpectedWithholdingTax,
  };
}

/** 画面・帳票下部に表示する前提・注意事項 */
export const WITHHOLDING_RECONCILIATION_ASSUMPTIONS: string[] = [
  "この一覧は、クライアント（報酬等の支払元）から受け取った支払調書・記帳データ等をもとに、源泉徴収税額の下書き照合を行うものです。正式な税額の確定や確定申告書の作成を行うものではありません。",
  "期待値は「報酬、料金、契約金及び賞金」に共通する標準税率（支払1回につき100万円以下の部分10.21%・超える部分20.42%）から機械的に算出した参考値です。ホステス等の報酬・馬主が受ける競馬の賞金など、計算方法が異なる区分には対応していません。",
  "確定申告の税額控除として実際に使用できるのは、クライアントが実際に源泉徴収した金額（recordedWithholdingTax）です。期待値との差異は、支払調書の記載内容をクライアントにご確認いただくための目安としてご利用ください。",
  "税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。",
];
