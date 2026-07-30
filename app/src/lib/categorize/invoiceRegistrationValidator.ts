// インボイス制度（適格請求書等保存方式）の登録番号（T + 13桁）の形式・チェックデジット検証。
//
// 登録番号の形式: "T" + 13桁の数字。法人の場合、13桁部分はその法人の法人番号と一致する
// （国税庁 インボイス制度 適格請求書発行事業者の登録番号のよくある質問）。
// 法人番号は「1桁のチェックデジット + 12桁の基礎番号」で構成され、チェックデジットは
// 基礎番号から次の算式で求められる:
//   1. 基礎番号12桁を末尾（1の位）から1,2,3...12桁目とする
//   2. 奇数桁目の数字の合計 + 偶数桁目の数字の合計×2 を求める
//   3. その合計を9で割った余りを、9から引いた値がチェックデジット
//
// 出典・検証済み実例（国税庁公式PDF「チェックデジットの計算」より）:
//   https://www.houjin-bangou.nta.go.jp/documents/checkdigit.pdf
//   基礎番号 "120901007402" → チェックデジット "2" → 法人番号 "2120901007402"
//   （本ファイルの computeCorporateNumberCheckDigit・テストはこの実例で検算済み）
//
// 注意: これは「番号の形式・検算が正しいか」のみを確認するものであり、
// 国税庁「適格請求書発行事業者公表サイト」上で実在・有効性が確認できたことを意味しない。
// 仕入税額控除の可否についても、本モジュールは最終判定を行わない（要確認フラグを返すのみ）。

export type InvoiceNumberInvalidReason =
  | "empty"
  | "missing_prefix"
  | "invalid_length"
  | "non_numeric"
  | "checksum_mismatch";

export interface InvoiceNumberValidationResult {
  valid: boolean;
  /** 無効な場合の理由コード。有効な場合は null */
  reason: InvoiceNumberInvalidReason | null;
  /** UI表示用の日本語メッセージ */
  message: string;
  /** 有効な場合のみ、"T"+13桁に正規化した文字列。無効な場合は null */
  normalized: string | null;
}

/**
 * 法人番号（12桁の基礎番号）から、国税庁の算式によるチェックデジット（1桁）を計算する。
 * base12 は数字のみ12桁であることを呼び出し側で保証すること。
 */
function computeCorporateNumberCheckDigit(base12: string): number {
  let weightedSum = 0;
  for (let positionFromRight = 1; positionFromRight <= 12; positionFromRight++) {
    const digit = Number(base12[12 - positionFromRight]);
    const weight = positionFromRight % 2 === 1 ? 1 : 2;
    weightedSum += digit * weight;
  }
  return 9 - (weightedSum % 9);
}

function invalid(reason: InvoiceNumberInvalidReason, message: string): InvoiceNumberValidationResult {
  return { valid: false, reason, message, normalized: null };
}

/**
 * インボイス登録番号（"T" + 13桁）の形式とチェックデジットを検証する純粋関数。
 * ネットワークアクセスは行わない（国税庁公表サイトでの実在確認は別途必要）。
 */
export function validateInvoiceRegistrationNumber(rawInput: string): InvoiceNumberValidationResult {
  const trimmed = (rawInput ?? "").trim();

  if (trimmed.length === 0) {
    return invalid("empty", "登録番号が入力されていません。");
  }

  if (!trimmed.startsWith("T")) {
    return invalid("missing_prefix", '登録番号は "T" から始まる必要があります。');
  }

  const body = trimmed.slice(1);

  if (body.length !== 13) {
    return invalid(
      "invalid_length",
      `"T" に続く数字は13桁である必要がありますが、${body.length}桁でした。`
    );
  }

  if (!/^\d{13}$/.test(body)) {
    return invalid("non_numeric", '"T" の後は数字13桁のみで構成されている必要があります。');
  }

  const checkDigit = Number(body[0]);
  const base12 = body.slice(1);
  const expectedCheckDigit = computeCorporateNumberCheckDigit(base12);

  if (checkDigit !== expectedCheckDigit) {
    return invalid(
      "checksum_mismatch",
      `チェックデジットが一致しません（入力値の先頭桁: ${checkDigit}、算出値: ${expectedCheckDigit}）。番号の入力間違いの可能性があります。`
    );
  }

  return {
    valid: true,
    reason: null,
    message:
      "番号の形式・チェックデジットは正しく整合しています。ただし国税庁「適格請求書発行事業者公表サイト」での実在・有効性確認は別途行ってください。",
    normalized: `T${body}`,
  };
}

/**
 * 課税仕入税額控除の適用是非についての「要確認」アドバイザリー。
 *
 * 重要: このモジュールは最終的な税務判定を行わない。docs/cto-tech-architecture.md 3.3節
 * 「税区分判定はルール優先」の方針、および税理士法上の非独占業務（個別具体の税務相談の
 * 代行禁止）を踏まえ、登録番号が形式的に正しい場合であっても "控除OK" のような自動承認は
 * 返さず、常に status: "要確認" を返し、人間（利用者本人または顧問税理士）の最終確認を促す。
 */
export interface InputTaxCreditAdvisory {
  /** 常に "要確認" 固定。将来の誤読み込み（＝自動承認扱い）を型レベルで防ぐための単一値リテラル。 */
  status: "要確認";
  /** 登録番号自体の形式・チェックデジット検証結果。未入力の場合は null */
  registrationNumberValid: boolean | null;
  headline: string;
  detail: string;
}

export function assessInputTaxCreditEligibility(
  counterpartyName: string,
  registrationNumber?: string | null
): InputTaxCreditAdvisory {
  const displayName = counterpartyName?.trim() || "この取引先";

  if (!registrationNumber || registrationNumber.trim().length === 0) {
    return {
      status: "要確認",
      registrationNumberValid: null,
      headline: `${displayName}の適格請求書発行事業者登録番号が未入力です`,
      detail:
        "登録番号が未確認のため、仕入税額控除の可否は自動判定していません。請求書・領収書に記載の登録番号を確認して入力し、国税庁「適格請求書発行事業者公表サイト」で実在確認のうえ、最終的な判断はご自身（または顧問税理士）で行ってください。",
    };
  }

  const validation = validateInvoiceRegistrationNumber(registrationNumber);

  if (!validation.valid) {
    return {
      status: "要確認",
      registrationNumberValid: false,
      headline: `${displayName}の登録番号の形式に誤りがあります`,
      detail: `${validation.message} 仕入税額控除の適用可否は自動判定せず、要確認としています。`,
    };
  }

  return {
    status: "要確認",
    registrationNumberValid: true,
    headline: `${displayName}の登録番号は形式上正しい可能性があります`,
    detail:
      "番号の形式・チェックデジットは整合していますが、実在確認（国税庁 適格請求書発行事業者公表サイト）や請求書の記載事項要件の充足は自動判定していません。仕入税額控除の適用は必ずご自身（または顧問税理士）が最終確認してください。",
  };
}
