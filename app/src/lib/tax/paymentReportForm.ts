import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 報酬、料金、契約金及び賞金の支払調書（下書き・簡易版）。
//
// 事業者（マイクロ法人・個人事業主を問わない）が、弁護士・税理士等の専門家や
// フリーランス（原稿執筆・講演・デザイン等）に業務委託の対価等を支払った場合、
// 一定額を超えると、支払を受けた者ごと・区分ごとに「支払調書」を作成し、
// 税務署へ提出（および通常は支払先へも交付）する必要がある（所得税法225条）。
//
// このモジュールが対象とするのは、実務上もっとも件数が多い「同一年中の支払合計額が
// 50,000円を超える場合に提出が必要」という一般的なしきい値のみ。以下のような
// 区分は提出要否の金額基準・計算方法が異なるため、意図的にスコープ外としている
// （該当する場合は必ずご自身で国税庁の手引き等を確認してください）。
//   ・馬主が受ける競馬の賞金（1回の賞金が75万円を超え、かつ年間の賞金合計の
//     一定割合を超える場合など、金額基準が全く異なる）
//   ・ホステス等の報酬・料金（同一人につき月々の支払金額から一定額を控除する等、
//     年間合計額の単純な足し上げでは判定できない）
//
// また、実際にどの区分（原稿料・講演料等／弁護士・税理士等の報酬／デザイン料／
// その他）に当たるかは取引内容に応じて利用者が判断すべき事項であり、勘定科目名
// だけから機械的に確定できるものではない。そのため、取引明細（categorize/engine.ts）
// からこの帳票を組み立てる際は「対象になりうる勘定科目」からの既定区分の割り当て
// に留め、行ごとに明示的な区分（category）で上書きできるようにしている。
//
// このモジュールはあくまで下書きデータの組み立てのみを行う。実際の提出（e-Tax等）
// は利用者本人が別途行う必要があり、税理士法に定める税務代理・税務書類の作成・
// 個別具体的な税務相談には該当しない。
// ------------------------------------------------------------------

export type PaymentReportCategory =
  | "原稿料・講演料等"
  | "弁護士・税理士等の報酬"
  | "デザイン料"
  | "外注費（原稿料等に準ずる業務委託）"
  | "その他の報酬・料金";

/** UIの選択肢等、PaymentReportCategoryの実行時一覧が必要な箇所で使用する */
export const PAYMENT_REPORT_CATEGORIES: PaymentReportCategory[] = [
  "原稿料・講演料等",
  "弁護士・税理士等の報酬",
  "デザイン料",
  "外注費（原稿料等に準ずる業務委託）",
  "その他の報酬・料金",
];

/** 同一年・同一支払先・同一区分の支払合計額がこの金額を「超える」場合に提出が必要（多くの区分に共通する一般的基準） */
export const GENERAL_ANNUAL_THRESHOLD = 50_000;

export interface PaymentReportSourceRow {
  /** 支払を受けた者（報酬等の支払先）の氏名・名称 */
  payeeName: string;
  /** この帳票上の区分 */
  category: PaymentReportCategory;
  /** 支払日（"YYYY-MM-DD" 等）。年でのフィルタ（buildPaymentReportLinesのoptions.fiscalYear）に使用する。省略可 */
  date?: string;
  /** 支払金額（源泉徴収前の総額）。プラスの数値で指定する */
  grossAmount: number;
  /** 源泉徴収税額（把握している場合）。未把握・源泉徴収なしの場合は省略可（0として扱う） */
  withholdingTax?: number;
}

export interface PaymentReportLine {
  payeeName: string;
  category: PaymentReportCategory;
  /** 年間の支払金額合計（源泉徴収前） */
  grossAmount: number;
  /** 年間の源泉徴収税額合計 */
  withholdingTax: number;
  /** grossAmount - withholdingTax */
  netAmount: number;
  /** 集計対象になった支払の件数 */
  paymentCount: number;
  /** 一般的基準（50,000円）を超えており、支払調書の提出が必要と考えられるか */
  reportRequired: boolean;
}

function extractYear(date: string): number | null {
  const m = date.match(/^(\d{4})/);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * 支払データ（payeeName, category, grossAmount, withholdingTaxがあれば）を
 * 支払先×区分ごとに年間集計し、一般的基準（50,000円超）を超える組み合わせに
 * reportRequired: true を立てた明細行を作成する。
 *
 * @param rows 集計対象の支払データ
 * @param options.fiscalYear 指定した場合、date（YYYY-MM-DD等）の年がこれと一致する行のみを対象にする。
 *   date が指定されていない行は、fiscalYearの指定にかかわらず常に対象に含める（年不明の手入力データ等を想定）。
 */
export function buildPaymentReportLines(
  rows: PaymentReportSourceRow[],
  options?: { fiscalYear?: number }
): PaymentReportLine[] {
  const fiscalYear = options?.fiscalYear;
  const filtered =
    fiscalYear == null
      ? rows
      : rows.filter((r) => {
          if (!r.date) return true;
          const year = extractYear(r.date);
          return year == null || year === fiscalYear;
        });

  const byKey = new Map<
    string,
    { payeeName: string; category: PaymentReportCategory; gross: number; withheld: number; count: number }
  >();

  for (const r of filtered) {
    const payeeName = r.payeeName.trim() || "（支払先不明）";
    const key = `${payeeName} ${r.category}`;
    const cur = byKey.get(key) ?? { payeeName, category: r.category, gross: 0, withheld: 0, count: 0 };
    cur.gross += r.grossAmount;
    cur.withheld += r.withholdingTax ?? 0;
    cur.count += 1;
    byKey.set(key, cur);
  }

  return Array.from(byKey.values())
    .map((v) => ({
      payeeName: v.payeeName,
      category: v.category,
      grossAmount: v.gross,
      withholdingTax: v.withheld,
      netAmount: v.gross - v.withheld,
      paymentCount: v.count,
      reportRequired: v.gross > GENERAL_ANNUAL_THRESHOLD,
    }))
    .sort((a, b) => b.grossAmount - a.grossAmount);
}

/** buildPaymentReportLines の結果のうち、実際に提出が必要と考えられる行のみを抽出する */
export function filterReportRequiredLines(lines: PaymentReportLine[]): PaymentReportLine[] {
  return lines.filter((l) => l.reportRequired);
}

// ------------------------------------------------------------------
// 取引明細（categorize/engine.ts の分類結果）からの下書き作成。
// ------------------------------------------------------------------

/**
 * CategorizedTransaction を拡張し、この帳票の作成に必要な追加情報を持たせた入力行。
 * categorize/engine.ts のCategorizedTransactionは支払先名・源泉徴収税額を保持していないため、
 * これらはこのモジュール側で任意項目として追加する（記帳データに紐づけて保持する場合は
 * 呼び出し側でこの型に詰め替えて渡す）。
 */
export interface PaymentReportTransactionInput extends CategorizedTransaction {
  /** 支払先（報酬等の支払を受けた者）の氏名・名称。省略時は note→description の順にフォールバックする */
  payeeName?: string;
  /** 源泉徴収税額（把握している場合） */
  withholdingTaxAmount?: number;
  /** この帳票上の区分。省略時は勘定科目からの既定値（下記ACCOUNT_DEFAULT_CATEGORY）を使う */
  paymentReportCategory?: PaymentReportCategory;
}

/**
 * 勘定科目辞書（categorize/dictionary.ts）の科目名のうち、外部の専門家・フリーランスへの
 * 役務提供の対価を計上しうるもの → この帳票の既定区分、の対応表。
 * あくまでデフォルト値であり、実際の区分は取引内容次第のため、行ごとに
 * paymentReportCategory を指定して上書きすることを想定している。
 */
const ACCOUNT_DEFAULT_CATEGORY: Partial<Record<string, PaymentReportCategory>> = {
  "給料賃金/外注工賃": "外注費（原稿料等に準ずる業務委託）",
  "支払手数料": "その他の報酬・料金",
};

const RELEVANT_ACCOUNTS = new Set(Object.keys(ACCOUNT_DEFAULT_CATEGORY));

function normalizePayeeName(row: PaymentReportTransactionInput): string {
  return row.payeeName?.trim() || row.note?.trim() || row.description.trim() || "（支払先不明）";
}

function resolveCategory(row: PaymentReportTransactionInput): PaymentReportCategory {
  return row.paymentReportCategory ?? ACCOUNT_DEFAULT_CATEGORY[row.account] ?? "その他の報酬・料金";
}

/**
 * 取引明細から、支払調書の対象になりうる勘定科目（ACCOUNT_DEFAULT_CATEGORYのキー）の
 * 支出行だけを抜き出し、buildPaymentReportLinesに渡せる形に変換したうえで集計する。
 * 給与・賞与（雇用関係）は対象外（別途 payroll/withholdingSlip.ts の対象）のため含めない。
 */
export function buildPaymentReportFromTransactions(
  rows: PaymentReportTransactionInput[],
  options?: { fiscalYear?: number }
): PaymentReportLine[] {
  const sourceRows: PaymentReportSourceRow[] = rows
    .filter((r) => r.amount < 0 && !r.excludeFromIncome && RELEVANT_ACCOUNTS.has(r.account))
    .map((r) => ({
      payeeName: normalizePayeeName(r),
      category: resolveCategory(r),
      date: r.date,
      grossAmount: Math.abs(r.amount),
      withholdingTax: r.withholdingTaxAmount ?? 0,
    }));

  return buildPaymentReportLines(sourceRows, options);
}

/** 画面・帳票下部に表示する前提・注意事項 */
export const PAYMENT_REPORT_ASSUMPTIONS: string[] = [
  "この一覧は「報酬、料金、契約金及び賞金の支払調書」の下書きデータです。正式な法定調書ではなく、税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。",
  `対象は、同一年中に同一の支払先・同一区分への支払合計額が${GENERAL_ANNUAL_THRESHOLD.toLocaleString("ja-JP")}円を超える一般的な基準のみです。馬主が受ける競馬の賞金・ホステス等の報酬など、金額基準や計算方法が異なる区分はこの画面の対象外です。`,
  "実際の区分（原稿料・講演料等／弁護士・税理士等の報酬／デザイン料／外注費／その他）は取引内容に応じてご自身でご確認・修正してください。",
  "e-Taxソフト等への実際の提出は、この画面では行いません。下書きの内容を確認のうえ、ご自身で提出手続きを行ってください。",
];
